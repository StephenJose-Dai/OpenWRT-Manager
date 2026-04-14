/**
 * OpenWrtClient - 通用 ubus HTTP 直连 SDK
 * 适用于：桌面 Electron、手机 React Native、微信小程序
 *
 * 使用方式：
 *   const client = new OpenWrtClient({ host: '192.168.1.1', password: 'xxx' })
 *   await client.login()
 *   const info = await client.call('system', 'info')
 */
class OpenWrtClient {
  constructor(config) {
    this.host     = config.host;
    this.port     = config.port || 80;
    this.username = config.username || 'root';
    this.password = config.password || '';
    this.https     = config.https || false;
    this.ignoreSSL = config.ignoreSSL || false;
    this.timeout  = config.timeout || 15000;
    this.session  = null;
    this._reqId   = 1;

    // 平台适配器：由各端注入（fetch / wx.request / node-fetch）
    this._fetcher = config.fetcher || (typeof fetch !== 'undefined' ? fetch.bind(window) : null);
  }

  get baseUrl() {
    const proto = this.https ? 'https' : 'http';
    const port  = (this.port === 80 && !this.https) || (this.port === 443 && this.https)
      ? '' : `:${this.port}`;
    return `${proto}://${this.host}${port}`;
  }

  // ─── 底层 JSON-RPC 请求 ────────────────────────────────
  async _rpc(params, path = '/ubus') {
    const id   = this._reqId++;
    const body = JSON.stringify({ jsonrpc: '2.0', id, method: 'call', params });

    const res = await this._request(`${this.baseUrl}${path}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      timeout: this.timeout
    });

    const data = res;  // _request 已经返回解析好的对象

    // ubus 错误响应
    if (data.error) throw new Error(data.error.message || `RPC 错误 ${data.error.code}`);

    // ubus 结果：[status_code, data_object]
    if (!Array.isArray(data.result)) {
      // 某些 OpenWrt 版本直接返回 result 对象而不是数组
      if (data.result && typeof data.result === 'object') return data.result;
      throw new Error('无效的 RPC 响应：' + JSON.stringify(data).slice(0, 100));
    }
    const [code, result] = data.result;
    if (code !== 0) throw new OpenWrtError(code, ubusCodes[code] || `ubus 错误 ${code}`);
    return result || {};
  }

  // 平台无关的 HTTP 请求
  // 优先使用 Electron 主进程代理（绕过 CORS），否则使用 fetch
  async _request(url, options) {
    const body = options.body || '';

    // Electron 环境：通过主进程代理，完全绕过 CORS 限制
    if (typeof window !== 'undefined' && window.electron?.ubusRequest) {
      try {
        const data = await window.electron.ubusRequest(url, body);
        console.log('[ubus-proxy] OK:', url.split('/').pop(), JSON.stringify(data).slice(0,100));
        return data;
      } catch (err) {
        console.error('[ubus-proxy] FAIL:', url, err.message);
        throw err;
      }
    }

    // 非 Electron 环境（开发 / 小程序 / 移动端）：使用注入的 fetcher
    if (!this._fetcher) throw new Error('未提供 fetcher');

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller
      ? setTimeout(() => controller.abort(), options.timeout || this.timeout)
      : null;

    try {
      const resp = await this._fetcher(url, { ...options, signal: controller?.signal });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return await resp.json();
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('连接超时');
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // ─── 登录 ──────────────────────────────────────────────
  async login() {
    const NULL_SESSION = '00000000000000000000000000000000';
    const result = await this._rpc([
      NULL_SESSION, 'session', 'login',
      { username: this.username, password: this.password }
    ]);
    this.session = result.ubus_rpc_session;
    this.sessionExpires = Date.now() + (result.expires || 300) * 1000;
    return this.session;
  }

  async ensureSession() {
    if (!this.session || Date.now() > this.sessionExpires - 10000) {
      await this.login();
    }
  }

  logout() {
    if (this.session) {
      this._rpc([this.session, 'session', 'destroy', {}]).catch(() => {});
      this.session = null;
    }
  }

  // ─── 核心 call 方法 ────────────────────────────────────
  async call(object, method, params = {}) {
    await this.ensureSession();
    return this._rpc([this.session, object, method, params]);
  }

  // ─── 连通性测试 ────────────────────────────────────────
  async ping() {
    try {
      const NULL_SESSION = '00000000000000000000000000000000';
      await this._rpc([NULL_SESSION, 'session', 'login', { username: '', password: '' }]);
      return true;
    } catch (err) {
      // 即使登录失败，只要路由器有响应就算通
      return err instanceof OpenWrtError || err.message.includes('ubus');
    }
  }

  // ─── 系统信息 ──────────────────────────────────────────
  async getSystemInfo() {
    const [board, info] = await Promise.all([
      this.call('system', 'board'),
      this.call('system', 'info')
    ]);
    return {
      hostname:   board.hostname,
      model:      board.model,
      release:    board.release?.description || '',
      kernel:     board.kernel,
      uptime:     info.uptime,
      uptimeFmt:  this._fmtUptime(info.uptime),
      localtime:  info.localtime,
      memory: {
        total:   info.memory?.total   || 0,
        free:    info.memory?.free    || 0,
        used:    (info.memory?.total - info.memory?.free) || 0,
        usagePct: info.memory?.total
          ? Math.round((1 - info.memory.free / info.memory.total) * 100) : 0
      },
      load: info.load?.map(l => (l / 65536).toFixed(2)) || []
    };
  }

  // ─── 网络接口 ──────────────────────────────────────────
  async getNetworkInterfaces() { return this.getNetworkInfo(); }  // alias

  // 读取精确的接口流量统计（直接从 /proc/net/dev 获取）
  async getNetworkStats() {
    try {
      const f = await this.call('file', 'read', { path: '/proc/net/dev' });
      const lines = (f.data || '').split('\n').slice(2); // 跳过两行标题
      const stats = {};
      lines.forEach(line => {
        const parts = line.trim().split(/[:\s]+/).filter(Boolean);
        if (parts.length >= 10) {
          stats[parts[0]] = {
            rxBytes: parseInt(parts[1]) || 0,
            txBytes: parseInt(parts[9]) || 0,
          };
        }
      });
      return stats; // { "eth0": { rxBytes, txBytes }, "br-lan": {...}, ... }
    } catch {
      // 回退到 network.interface
      const ifaces = await this.getNetworkInfo();
      const stats = {};
      ifaces.forEach(i => {
        if (i.ifname) stats[i.ifname] = { rxBytes: i.rxBytes, txBytes: i.txBytes };
        stats[i.name] = { rxBytes: i.rxBytes, txBytes: i.txBytes };
      });
      return stats;
    }
  }

  async getNetworkInfo() {
    const status = await this.call('network.interface', 'dump');
    return (status.interface || []).map(iface => ({
      name:    iface.interface,
      ifname:  iface.l3_device || iface.device,
      up:      iface.up,
      proto:   iface.proto,
      ipv4:    iface['ipv4-address']?.[0]?.address,
      ipv6:    iface['ipv6-address']?.[0]?.address,
      rxBytes: iface.statistics?.rx_bytes || 0,
      txBytes: iface.statistics?.tx_bytes || 0
    }));
  }

  // ─── 无线信息 ──────────────────────────────────────────
  async getWirelessClients() {
    try {
      const res  = await this.call('iwinfo', 'devices');
      const devices = [];
      for (const dev of (res.devices || [])) {
        const assoc = await this.call('iwinfo', 'assoclist', { device: dev });
        const info  = await this.call('iwinfo', 'info',     { device: dev });
        devices.push({
          device:  dev,
          ssid:    info.ssid,
          channel: info.channel,
          signal:  info.signal,
          clients: assoc.results || []
        });
      }
      return devices;
    } catch { return []; }
  }

  // ─── DHCP 租约（连接设备列表）─────────────────────────
  async getDHCPLeases() {
    // 方法1: luci-rpc（需要 luci-mod-rpc）
    try {
      const res = await this.call('luci-rpc', 'getDHCPLeases');
      const leases = res.leases || res || [];
      if (Array.isArray(leases) && leases.length > 0) {
        return leases.map(d => ({
          ip:       d['ipaddr'] || d['ip-addr'] || d.ip || '',
          mac:      d['macaddr'] || d['mac-addr'] || d.mac || '',
          hostname: d.hostname || d.name || '',
        })).filter(d => d.ip);
      }
    } catch {}

    // 方法2: 读 /tmp/dhcp.leases 文件（dnsmasq 标准路径）
    try {
      const f = await this.call('file', 'read', { path: '/tmp/dhcp.leases' });
      const parsed = this._parseDHCPLeases(f.data || '');
      if (parsed.length > 0) return parsed;
    } catch {}

    // 方法3: 通过 ubus dhcp ipv4leases（odhcp6c）
    try {
      const res = await this.call('dhcp', 'ipv4leases');
      if (res.device) {
        const list = Object.values(res.device).flatMap(dev =>
          (dev['ipv4-address'] || []).map(a => ({
            ip:       a.address || '',
            mac:      dev['mac-address'] || '',
            hostname: dev.hostname || '',
          }))
        ).filter(d => d.ip);
        if (list.length > 0) return list;
      }
    } catch {}

    // 方法4: 读 ARP 表（/proc/net/arp），覆盖面最广
    try {
      const arpFile = await this.call('file', 'read', { path: '/proc/net/arp' });
      const lines = (arpFile.data || '').split('\n').slice(1); // 跳过标题行
      const devices = lines
        .map(line => {
          const parts = line.trim().split(/\s+/);
          // 格式: IP HW_TYPE FLAGS MAC Mask Device
          if (parts.length >= 4 && parts[2] === '0x2') { // 0x2 = 已解析
            return { ip: parts[0], mac: parts[3].toUpperCase(), hostname: '' };
          }
          return null;
        })
        .filter(d => d && d.ip && !d.ip.startsWith('0.') && d.mac !== '00:00:00:00:00:00');
      if (devices.length > 0) return devices;
    } catch {}

    return [];
  }

  // ─── UCI 配置读写 ──────────────────────────────────────
  async uciGet(config, section, option) {
    const params = { config };
    if (section) params.section = section;
    if (option)  params.option  = option;
    const res = await this.call('uci', 'get', params);
    return res.value || res.values;
  }

  async uciSet(config, section, values) {
    await this.call('uci', 'set',    { config, section, values });
    await this.call('uci', 'commit', { config });
  }

  // ─── 防火墙 ────────────────────────────────────────────
  async getFirewallRules() {
    const res = await this.uciGet('firewall');
    return res;
  }

  // ─── 系统操作 ──────────────────────────────────────────
  async reboot() {
    await this.call('system', 'reboot');
  }

  async getLog() {
    const res = await this.call('file', 'read', { path: '/tmp/log/messages' })
      .catch(() => this.call('file', 'exec', { command: 'logread', args: ['-l', '200'] }));
    return (res.data || res.stdout || '').split('\n').filter(Boolean);
  }

  async execCommand(cmd, args = []) {
    // 尝试完整路径，rpcd-mod-file 需要可执行文件的完整路径
    return this.call('file', 'exec', { command: cmd, args });
  }

  // 带路径探测的命令执行
  // rpcd-mod-file 的 exec 需要完整路径，且必须在 ACL 里
  // 使用 sh -c 方式绕过路径问题
  async execCommandFull(cmd, args = []) {
    // 方法1：用 sh -c 执行（sh 的路径固定在 /bin/sh）
    const shellCmd = [cmd, ...args].join(' ')
    try {
      const r = await this.call('file', 'exec', {
        command: '/bin/sh',
        args: ['-c', shellCmd]
      })
      return r
    } catch(e1) {
      // 如果 /bin/sh 不在 ACL，尝试常见路径
      const searchPaths = [
        '/bin', '/usr/bin', '/sbin', '/usr/sbin',
        '/usr/local/bin', '/usr/local/sbin'
      ]
      for (const dir of searchPaths) {
        try {
          const r = await this.call('file', 'exec', {
            command: dir + '/' + cmd,
            args
          })
          return r
        } catch(e2) {
          if (e2.message?.includes('PERMISSION_DENIED')) throw e2
          // NOT_FOUND: 继续试下一个路径
        }
      }
      throw e1
    }
  }

  // 检测路由器已安装的功能，用于动态菜单
  async detectFeatures() {
    const features = {
      vpn: false, wireguard: false, docker: false,
      adguard: false, passwall: false, clash: false
    };
    try {
      // 检查各功能配置文件/包是否存在
      const checks = [
        ['cat', ['/etc/config/openvpn']],
        ['cat', ['/etc/config/wireguard']],
        ['which', ['dockerd']],
        ['cat', ['/etc/config/adguardhome']],
        ['cat', ['/etc/config/passwall']],
        ['which', ['clash']],
      ];
      const keys = ['vpn', 'wireguard', 'docker', 'adguard', 'passwall', 'clash'];
      const results = await Promise.allSettled(
        checks.map(([cmd, args]) => this.execCommand(cmd, args))
      );
      results.forEach((r, i) => {
        features[keys[i]] = r.status === 'fulfilled' && !!(r.value?.stdout || r.value?.code === 0);
      });
    } catch {}
    return features;
  }

  // ─── 工具 ──────────────────────────────────────────────
  _fmtUptime(s) {
    if (!s) return '--';
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${d}天 ${h}时 ${m}分`;
  }

  _parseDHCPLeases(raw) {
    return raw.trim().split('\n').filter(Boolean).map(line => {
      const [expires, mac, ip, name] = line.split(' ');
      return { expires: parseInt(expires), mac, ip, hostname: name === '*' ? null : name };
    });
  }
}

// ubus 错误码
const ubusCodes = {
  1: 'INVALID_COMMAND',
  2: 'INVALID_ARGUMENT',
  3: 'METHOD_NOT_FOUND',
  4: 'NOT_FOUND',
  5: 'NO_DATA',
  6: 'PERMISSION_DENIED',
  7: 'TIMEOUT',
  8: 'NOT_SUPPORTED',
  9: 'UNKNOWN_ERROR',
  10: 'CONNECTION_FAILED'
};

class OpenWrtError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'OpenWrtError';
  }
}

// ─── 局域网自动探测器 ──────────────────────────────────────
class LANScanner {
  constructor(fetcher, timeout = 1500) {
    this._fetcher = fetcher;
    this._timeout = timeout;
  }

  /**
   * 探测局域网内的 OpenWrt 路由器
   * 策略：
   *   1. 尝试常见网关地址（192.168.1.1 / .0.1 / .2.1 / .31.1 等）
   *   2. 尝试 openwrt.lan / router.lan mDNS 域名
   *   3. 扫描当前子网的 .1 地址
   */
  async scan(onFound, gatewayHints = []) {
    const candidates = this._buildCandidates(gatewayHints);
    const found = [];

    // 并发探测，每批 8 个
    for (let i = 0; i < candidates.length; i += 8) {
      const batch = candidates.slice(i, i + 8);
      const results = await Promise.allSettled(
        batch.map(host => this._probe(host))
      );
      for (let j = 0; j < results.length; j++) {
        if (results[j].status === 'fulfilled' && results[j].value) {
          const item = { host: batch[j], ...results[j].value };
          found.push(item);
          onFound?.(item);
        }
      }
      // 继续扫描所有候选地址
    }
    return found;
  }

  async _probe(host) {
    // 并行探测常用端口，哪个先响应用哪个
    const attempts = [
      { url: `http://${host}/ubus`,      https: false, port: 80   },
      { url: `http://${host}:8080/ubus`, https: false, port: 8080 },
      { url: `https://${host}/ubus`,     https: true,  port: 443  },
    ];

    const body = JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'call',
      params: ['00000000000000000000000000000000', 'session', 'login',
               { username: '', password: '' }]
    });

    // 并行发请求，取第一个成功的
    const tryOne = async ({ url, https, port }) => {
      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this._timeout);
      try {
        const resp = await this._fetcher(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: ctrl.signal
        });
        clearTimeout(timer);
        if (!resp.ok) return null;
        const text = await resp.text();
        let data; try { data = JSON.parse(text); } catch { return null; }
        const code = data.result?.[0];
        if (code === 6 || code === 0 || (data.jsonrpc === '2.0' && data.id === 1)) {
          return { reachable: true, isOpenWrt: code === 6 || code === 0, https, port };
        }
        return null;
      } catch { clearTimeout(timer); return null; }
    };

    // 并行尝试，返回第一个非 null 结果
    const results = await Promise.all(attempts.map(tryOne));
    return results.find(r => r !== null) || null;
  }

  _buildCandidates(hints = []) {
    const common = [
      '192.168.1.1', '192.168.0.1', '192.168.2.1', '192.168.3.1',
      '192.168.10.1', '192.168.11.1', '192.168.31.1', '192.168.100.1',
      '192.168.50.1', '192.168.123.1', '192.168.178.1', '192.168.188.1',
      '10.0.0.1', '10.0.1.1', '10.10.10.1', '172.16.0.1', '172.16.1.1',
      'openwrt.lan', 'router.lan', 'openwrt', 'gateway.local',
    ];

    // 优先放传入的本机实际网关（来自 Electron net:getGateways）
    const all = [...hints, ...common];
    return [...new Set(all)];
  }
}

// ─── 多路由器管理器 ────────────────────────────────────────
class RouterManager {
  constructor(storage) {
    this._storage = storage; // 注入平台存储（localStorage / AsyncStorage / wx.storage）
    this._clients = new Map();   // routerId → OpenWrtClient 实例
    this._configs = new Map();   // routerId → config
  }

  async load() {
    const raw = await this._storage.getItem('openwrt_routers');
    const list = raw ? JSON.parse(raw) : [];
    for (const cfg of list) {
      this._configs.set(cfg.id, cfg);
    }
    return list;
  }

  async save() {
    const list = [...this._configs.values()];
    await this._storage.setItem('openwrt_routers', JSON.stringify(list));
  }

  // 添加 / 更新路由器配置
  async addRouter(config) {
    const id = config.id || `router_${Date.now()}`;
    const cfg = {
      id,
      label:      config.label || config.host,
      host:       config.host,
      port:       config.port || 80,
      https:      !!config.https,
      ignoreSSL:  !!config.ignoreSSL,
      username:   config.username || 'root',
      password:   config.rememberPassword ? config.password : '',
      rememberPassword: !!config.rememberPassword,
      autoLogin:  !!config.autoLogin,
      addedAt:    config.addedAt || Date.now()
    };
    this._configs.set(id, cfg);
    await this.save();
    return id;
  }

  async removeRouter(id) {
    this._configs.delete(id);
    this._clients.delete(id);
    await this.save();
  }

  getClient(id, fetcher) {
    if (this._clients.has(id)) return this._clients.get(id);
    const cfg = this._configs.get(id);
    if (!cfg) throw new Error(`路由器 ${id} 不存在`);
    const client = new OpenWrtClient({ ...cfg, fetcher });
    this._clients.set(id, client);
    return client;
  }

  listRouters() {
    return [...this._configs.values()].sort((a, b) => a.addedAt - b.addedAt);
  }

  getConfig(id) {
    return this._configs.get(id);
  }
}

// ─── 图形验证码生成器（纯 Canvas，浏览器 / Electron 可用）────
class CaptchaGenerator {
  constructor(width = 120, height = 40) {
    this.width  = width;
    this.height = height;
    this.code   = '';
  }

  generate() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    this.code = Array.from({ length: 4 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');
    return this.code;
  }

  // 返回 data URL，可直接放 <img src=...>
  render() {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width  = this.width;
    canvas.height = this.height;
    const ctx = canvas.getContext('2d');

    // 背景
    ctx.fillStyle = '#f0f4f8';
    ctx.fillRect(0, 0, this.width, this.height);

    // 干扰线
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = `hsl(${Math.random()*360},50%,70%)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.random() * this.width, Math.random() * this.height);
      ctx.lineTo(Math.random() * this.width, Math.random() * this.height);
      ctx.stroke();
    }

    // 干扰点
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = `hsl(${Math.random()*360},50%,70%)`;
      ctx.fillRect(Math.random() * this.width, Math.random() * this.height, 2, 2);
    }

    // 字符
    this.generate();
    const colors = ['#1a56db', '#d03801', '#0e9f6e', '#7e3af2'];
    this.code.split('').forEach((ch, i) => {
      ctx.save();
      ctx.font = `bold ${22 + Math.random()*6}px Arial`;
      ctx.fillStyle = colors[i % colors.length];
      const x = 10 + i * 27;
      const y = 28 + (Math.random() - 0.5) * 6;
      ctx.translate(x, y);
      ctx.rotate((Math.random() - 0.5) * 0.4);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    });

    return canvas.toDataURL('image/png');
  }

  verify(input) {
    return input.trim().toLowerCase() === this.code.toLowerCase();
  }
}

// ─── 微信小程序适配器 ──────────────────────────────────────
class WxFetcher {
  static fetch(url, options) {
    return new Promise((resolve, reject) => {
      wx.request({
        url,
        method:  options.method || 'GET',
        data:    options.body,
        header:  options.headers || {},
        timeout: options.timeout || 8000,
        success: (res) => resolve({
          ok:   res.statusCode >= 200 && res.statusCode < 300,
          json: () => Promise.resolve(res.data)
        }),
        fail: (err) => reject(new Error(err.errMsg || '请求失败'))
      });
    });
  }
}

// ─── 微信小程序存储适配器 ──────────────────────────────────
const WxStorage = {
  getItem: (key) => {
    try { return Promise.resolve(wx.getStorageSync(key)); }
    catch { return Promise.resolve(null); }
  },
  setItem: (key, val) => {
    wx.setStorageSync(key, val);
    return Promise.resolve();
  },
  removeItem: (key) => {
    wx.removeStorageSync(key);
    return Promise.resolve();
  }
};

// ─── 浏览器 / Electron 存储适配器 ─────────────────────────
const WebStorage = {
  getItem:    (key) => Promise.resolve(localStorage.getItem(key)),
  setItem:    (key, val) => Promise.resolve(localStorage.setItem(key, val)),
  removeItem: (key) => Promise.resolve(localStorage.removeItem(key))
};

// React Native AsyncStorage 适配器（使用时注入）
function makeRNStorage(AsyncStorage) {
  return {
    getItem:    (key) => AsyncStorage.getItem(key),
    setItem:    (key, val) => AsyncStorage.setItem(key, val),
    removeItem: (key) => AsyncStorage.removeItem(key)
  };
}

module.exports = {
  OpenWrtClient,
  OpenWrtError,
  LANScanner,
  RouterManager,
  CaptchaGenerator,
  WxFetcher,
  WxStorage,
  WebStorage,
  makeRNStorage
};

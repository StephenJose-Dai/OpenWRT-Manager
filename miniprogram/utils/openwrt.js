// utils/openwrt.js - 微信小程序专用 OpenWrt 客户端

// ─── ubus HTTP 客户端 ──────────────────────────────────────
class OpenWrtClient {
  constructor(config) {
    this.host     = config.host;
    this.port     = config.port || 80;
    this.username = config.username || 'root';
    this.password = config.password || '';
    this.https    = config.https || false;
    this.timeout  = config.timeout || 8000;
    this.session  = null;
    this.sessionExpires = 0;
    this._id      = 1;
  }

  get baseUrl() {
    const proto = this.https ? 'https' : 'http';
    const portStr = (this.port === 80 && !this.https) ? '' : `:${this.port}`;
    return `${proto}://${this.host}${portStr}`;
  }

  // wx.request 封装（返回 Promise）
  _wxRequest(url, data) {
    return new Promise((resolve, reject) => {
      wx.request({
        url,
        method:  'POST',
        data:    JSON.stringify(data),
        header:  { 'content-type': 'application/json' },
        timeout: this.timeout,
        success: res => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(typeof res.data === 'string' ? JSON.parse(res.data) : res.data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        },
        fail: err => reject(new Error(err.errMsg || '网络错误'))
      });
    });
  }

  async _rpc(params) {
    const id   = this._id++;
    const data = await this._wxRequest(`${this.baseUrl}/ubus`, {
      jsonrpc: '2.0', id, method: 'call', params
    });
    if (!data.result) throw new Error('无效响应');
    const [code, result] = data.result;
    if (code !== 0) throw new OpenWrtError(code);
    return result;
  }

  async login() {
    const NULL = '00000000000000000000000000000000';
    const res  = await this._rpc([NULL, 'session', 'login',
      { username: this.username, password: this.password }]);
    this.session        = res.ubus_rpc_session;
    this.sessionExpires = Date.now() + (res.expires || 300) * 1000;
    return this.session;
  }

  async ensureSession() {
    if (!this.session || Date.now() > this.sessionExpires - 10000) {
      await this.login();
    }
  }

  async call(obj, method, params = {}) {
    await this.ensureSession();
    return this._rpc([this.session, obj, method, params]);
  }

  async ping() {
    try {
      const NULL = '00000000000000000000000000000000';
      await this._rpc([NULL, 'session', 'login', { username: '', password: '' }]);
      return true;
    } catch (e) {
      return e instanceof OpenWrtError;
    }
  }

  async getSystemInfo() {
    const [board, info] = await Promise.all([
      this.call('system', 'board'),
      this.call('system', 'info')
    ]);
    return {
      hostname:   board.hostname,
      model:      board.model,
      release:    board.release?.description || '',
      uptime:     info.uptime,
      uptimeFmt:  fmtUptime(info.uptime),
      memory: {
        total:    info.memory?.total || 0,
        free:     info.memory?.free  || 0,
        usagePct: info.memory?.total
          ? Math.round((1 - info.memory.free / info.memory.total) * 100) : 0
      },
      load: (info.load || []).map(l => (l / 65536).toFixed(2))
    };
  }

  async getDHCPLeases() {
    try {
      const res = await this.call('luci-rpc', 'getDHCPLeases');
      return res.leases || [];
    } catch {
      try {
        const f = await this.call('file', 'read', { path: '/tmp/dhcp.leases' });
        return parseDHCPLeases(f.data || '');
      } catch { return []; }
    }
  }

  async getNetworkInterfaces() {
    const res = await this.call('network.interface', 'dump');
    return (res.interface || []).map(i => ({
      name:    i.interface,
      up:      i.up,
      proto:   i.proto,
      ip:      i['ipv4-address']?.[0]?.address,
      rx:      i.statistics?.rx_bytes || 0,
      tx:      i.statistics?.tx_bytes || 0
    }));
  }

  async reboot() {
    await this.call('system', 'reboot');
  }
}

class OpenWrtError extends Error {
  constructor(code) {
    const msgs = { 2:'参数错误', 3:'方法不存在', 6:'权限不足', 7:'超时' };
    super(msgs[code] || `ubus错误(${code})`);
    this.code = code;
  }
}

function fmtUptime(s) {
  if (!s) return '--';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${d}天${h}时${m}分`;
}

function parseDHCPLeases(raw) {
  return raw.trim().split('\n').filter(Boolean).map(line => {
    const [expires, mac, ip, name] = line.split(' ');
    return { expires: parseInt(expires), mac, ip, hostname: name === '*' ? null : name };
  });
}

// ─── 路由器管理器（wx.storage）────────────────────────────
class RouterManager {
  constructor() { this._configs = new Map(); }

  load() {
    try {
      const raw  = wx.getStorageSync('openwrt_routers');
      const list = raw ? JSON.parse(raw) : [];
      list.forEach(c => this._configs.set(c.id, c));
      return list;
    } catch { return []; }
  }

  save() {
    wx.setStorageSync('openwrt_routers', JSON.stringify([...this._configs.values()]));
  }

  add(config) {
    const id = config.id || `r_${Date.now()}`;
    this._configs.set(id, { ...config, id });
    this.save();
    return id;
  }

  remove(id) { this._configs.delete(id); this.save(); }

  list() {
    return [...this._configs.values()].sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
  }

  get(id) { return this._configs.get(id); }

  update(id, patch) {
    const cfg = this._configs.get(id);
    if (cfg) { Object.assign(cfg, patch); this.save(); }
  }
}

// ─── 局域网扫描（小程序限制：只能扫常见 IP）────────────────
async function scanLAN(onFound, timeout = 1500) {
  const candidates = [
    '192.168.1.1', '192.168.0.1', '192.168.2.1', '192.168.31.1',
    '192.168.100.1', '10.0.0.1', '10.1.1.1'
  ];
  const found = [];

  // 小程序并发限制，每批 4 个
  for (let i = 0; i < candidates.length; i += 4) {
    const batch = candidates.slice(i, i + 4);
    const results = await Promise.allSettled(
      batch.map(host => probeHost(host, timeout))
    );
    results.forEach((r, j) => {
      if (r.status === 'fulfilled' && r.value) {
        const item = { host: batch[j] };
        found.push(item);
        onFound?.(item);
      }
    });
  }
  return found;
}

function probeHost(host, timeout) {
  return new Promise((resolve) => {
    wx.request({
      url: `http://${host}/ubus`,
      method: 'POST',
      data: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'call',
        params: ['00000000000000000000000000000000', 'session', 'login',
                 { username: '', password: '' }]
      }),
      header: { 'content-type': 'application/json' },
      timeout,
      success: (res) => {
        const code = res.data?.result?.[0];
        resolve(code === 6 || code === 0);
      },
      fail: () => resolve(false)
    });
  });
}

// ─── 验证码（小程序用 Canvas 2D）────────────────────────────
function generateCaptchaCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 4 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
}

function drawCaptcha(canvas, code) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;

  ctx.fillStyle = '#1e2530';
  ctx.fillRect(0, 0, w, h);

  // 干扰线
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = `rgba(${Math.random()*100+100},${Math.random()*100+100},${Math.random()*100+200},0.4)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.random() * w, Math.random() * h);
    ctx.lineTo(Math.random() * w, Math.random() * h);
    ctx.stroke();
  }

  // 字符
  const colors = ['#60a5fa', '#34d399', '#f472b6', '#fbbf24'];
  code.split('').forEach((ch, i) => {
    ctx.save();
    ctx.font = `bold ${20 + Math.random() * 4}px Arial`;
    ctx.fillStyle = colors[i];
    ctx.translate(14 + i * 26, 30 + (Math.random() - 0.5) * 6);
    ctx.rotate((Math.random() - 0.5) * 0.4);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  });
}

module.exports = {
  OpenWrtClient, OpenWrtError, RouterManager,
  scanLAN, generateCaptchaCode, drawCaptcha, fmtUptime
};

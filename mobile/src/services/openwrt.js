/**
 * React Native OpenWrt ubus 客户端
 * 功能与桌面版对齐：HTTP/HTTPS、忽略SSL、完整数据获取
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

class OpenWrtClient {
  constructor(config) {
    this.host      = config.host
    this.port      = config.port || 80
    this.username  = config.username || 'root'
    this.password  = config.password || ''
    this.https     = config.https || false
    this.ignoreSSL = config.ignoreSSL !== undefined ? config.ignoreSSL : (config.https || false)
    this.timeout   = config.timeout || 15000
    this.session   = null
    this.sessionExpires = 0
    this._id       = 1
  }

  get baseUrl() {
    const proto   = this.https ? 'https' : 'http'
    const portStr = (this.port === 80 && !this.https) || (this.port === 443 && this.https)
      ? '' : `:${this.port}`
    return `${proto}://${this.host}${portStr}`
  }

  async _rpc(params) {
    const id   = this._id++
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), this.timeout)
    try {
      const res = await fetch(`${this.baseUrl}/ubus`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ jsonrpc: '2.0', id, method: 'call', params }),
        signal:  ctrl.signal,
      })
      clearTimeout(timer)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error.message || 'RPC 错误')
      if (!Array.isArray(data.result)) {
        if (data.result && typeof data.result === 'object') return data.result
        throw new Error('无效响应')
      }
      const [code, result] = data.result
      if (code !== 0) throw new OpenWrtError(code)
      return result || {}
    } catch (err) {
      clearTimeout(timer)
      if (err.name === 'AbortError') throw new Error('连接超时')
      throw err
    }
  }

  async login() {
    const NULL = '00000000000000000000000000000000'
    const res  = await this._rpc([NULL, 'session', 'login',
      { username: this.username, password: this.password }])
    this.session        = res.ubus_rpc_session
    this.sessionExpires = Date.now() + (res.expires || 300) * 1000
    return this.session
  }

  async ensureSession() {
    if (!this.session || Date.now() > this.sessionExpires - 10000) await this.login()
  }

  async call(obj, method, params = {}) {
    await this.ensureSession()
    return this._rpc([this.session, obj, method, params])
  }

  async getSystemInfo() {
    const [board, info] = await Promise.all([
      this.call('system', 'board'),
      this.call('system', 'info')
    ])
    return {
      hostname:  board.hostname,
      model:     board.model,
      release:   board.release?.description || '',
      kernel:    board.kernel,
      uptime:    info.uptime,
      uptimeFmt: fmtUptime(info.uptime),
      memory: {
        total:    info.memory?.total || 0,
        free:     info.memory?.free  || 0,
        used:     (info.memory?.total - info.memory?.free) || 0,
        usagePct: info.memory?.total
          ? Math.round((1 - info.memory.free / info.memory.total) * 100) : 0
      },
      load: (info.load || []).map(l => (l / 65536).toFixed(2))
    }
  }

  async getNetworkInterfaces() {
    const res = await this.call('network.interface', 'dump')
    return (res.interface || []).map(i => ({
      name:    i.interface,
      ifname:  i.l3_device || i.device,
      up:      i.up,
      proto:   i.proto,
      ip:      i['ipv4-address']?.[0]?.address,
      rxBytes: i.statistics?.rx_bytes || 0,
      txBytes: i.statistics?.tx_bytes || 0,
    }))
  }

  // 精确流量统计，直接读 /proc/net/dev
  async getNetworkStats() {
    try {
      const f = await this.call('file', 'read', { path: '/proc/net/dev' })
      const lines = (f.data || '').split('\n').slice(2)
      const stats = {}
      lines.forEach(line => {
        const parts = line.trim().split(/[:\s]+/).filter(Boolean)
        if (parts.length >= 10) {
          stats[parts[0]] = { rxBytes: parseInt(parts[1]) || 0, txBytes: parseInt(parts[9]) || 0 }
        }
      })
      return stats
    } catch {
      const ifaces = await this.getNetworkInterfaces()
      const stats = {}
      ifaces.forEach(i => { if (i.ifname) stats[i.ifname] = { rxBytes: i.rxBytes, txBytes: i.txBytes } })
      return stats
    }
  }

  async getDHCPLeases() {
    // 方法1: luci-rpc
    try {
      const res = await this.call('luci-rpc', 'getDHCPLeases')
      const leases = res.leases || res || []
      if (Array.isArray(leases) && leases.length > 0) {
        return leases.map(d => ({
          ip:       d['ipaddr'] || d.ip || '',
          mac:      (d['macaddr'] || d.mac || '').toUpperCase(),
          hostname: d.hostname || d.name || '',
        })).filter(d => d.ip)
      }
    } catch {}
    // 方法2: 读文件
    try {
      const f = await this.call('file', 'read', { path: '/tmp/dhcp.leases' })
      const parsed = parseDHCPLeases(f.data || '')
      if (parsed.length > 0) return parsed
    } catch {}
    // 方法3: ARP 表（最广兼容）
    try {
      const f = await this.call('file', 'read', { path: '/proc/net/arp' })
      const lines = (f.data || '').split('\n').slice(1)
      const devices = lines.map(line => {
        const parts = line.trim().split(/\s+/)
        if (parts.length >= 6 && (parts[2] === '0x2' || parts[2] === '0x0')) {
          const mac = parts[3].toUpperCase()
          if (mac === '00:00:00:00:00:00') return null
          return { ip: parts[0], mac, hostname: '' }
        }
        return null
      }).filter(d => d && d.ip && !d.ip.startsWith('0.'))
      if (devices.length > 0) return devices
    } catch {}
    return []
  }

  async getFirewallData() {
    const res  = await this.call('uci', 'get', { config: 'firewall' })
    const vals = res.values || {}
    const rules = [], zones = [], redirects = []
    // 支持 hash key 格式（cfg01e63d）和 @rule[N] 格式
    const firstVal = Object.values(vals)[0] || {}
    if (typeof firstVal === 'object' && '.type' in firstVal) {
      // 新格式：section 对象有 .type 字段
      Object.values(vals).forEach(v => {
        if (!v || typeof v !== 'object') return
        const t = v['.type']
        if (t === 'rule')        rules.push(v)
        else if (t === 'zone')   zones.push(v)
        else if (t === 'redirect') redirects.push(v)
      })
    } else {
      // 旧格式：key 是 firewall.@rule[N].field
      const map = {}
      Object.entries(vals).forEach(([k, v]) => {
        const m = k.match(/^firewall\.@(\w+)\[(\d+)\]\.(.+)$/)
        if (m) {
          const [, type, idx, field] = m
          const key = `${type}_${idx}`
          if (!map[key]) map[key] = { _idx: +idx, _type: type }
          map[key][field] = v
        }
      })
      Object.values(map).forEach(sec => {
        if (sec._type === 'rule')     rules.push(sec)
        else if (sec._type === 'zone') zones.push(sec)
        else if (sec._type === 'redirect') redirects.push(sec)
      })
    }
    const byIdx = arr => arr.sort((a, b) => (a['.index'] || a._idx || 0) - (b['.index'] || b._idx || 0))
    return { rules: byIdx(rules), zones: byIdx(zones), redirects: byIdx(redirects) }
  }

  async getLog() {
    try {
      const r = await this.call('file', 'exec', { command: '/sbin/logread', args: ['-l', '200'] })
      return (r.stdout || '').split('\n').filter(Boolean)
    } catch { return [] }
  }

  async setupACL() {
    const aclJson = '{"root":{"read":{"ubus":{"*":["*"]},"uci":{"*":["read"]},"file":{"*":["read","exec","list"]}},"write":{"ubus":{"*":["*"]},"uci":{"*":["read","write"]},"file":{"*":["read","write","exec","list"]}}}}'
    try {
      await this.call('file', 'write', { path: '/usr/share/rpcd/acl.d/owm.json', data: aclJson })
      await this.call('file', 'exec', { command: '/bin/sh', args: ['-c', '/etc/init.d/rpcd restart'] })
      return { success: true }
    } catch {}
    try {
      await this.call('file', 'exec', { command: '/bin/sh',
        args: ['-c', `echo '${aclJson}' > /usr/share/rpcd/acl.d/owm.json && /etc/init.d/rpcd restart`] })
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  async checkACL() {
    try { await this.call('file', 'read', { path: '/proc/net/arp' }); return true }
    catch { return false }
  }

  async reboot() { await this.call('system', 'reboot') }

  async execCommand(cmd, args = []) {
    return this.call('file', 'exec', { command: cmd, args })
  }

  async execCommandFull(cmd, args = []) {
    try {
      return await this.call('file', 'exec', { command: '/bin/sh', args: ['-c', [cmd, ...args].join(' ')] })
    } catch (e) {
      if (e.message?.includes('PERMISSION_DENIED') || e.message?.includes('权限')) throw e
      return this.execCommand(cmd, args)
    }
  }
}

class OpenWrtError extends Error {
  constructor(code) {
    const msgs = { 2: '参数错误', 3: '方法不存在', 4: '命令不存在', 6: '权限不足', 7: '超时' }
    super(msgs[code] || `ubus 错误 (${code})`)
    this.code = code
    this.name = 'OpenWrtError'
  }
}

function fmtUptime(s) {
  if (!s) return '--'
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}天 ${h}时 ${m}分`
  if (h > 0) return `${h}时 ${m}分`
  return `${m}分`
}

function parseDHCPLeases(raw) {
  return raw.trim().split('\n').filter(Boolean).map(line => {
    const [, mac, ip, name] = line.split(' ')
    return { mac: (mac || '').toUpperCase(), ip: ip || '', hostname: name === '*' ? '' : (name || '') }
  }).filter(d => d.ip)
}

// 局域网扫描 - 支持 HTTP 和 HTTPS，并行探测
async function scanLAN(onFound, timeout = 2000) {
  const candidates = [
    '192.168.1.1', '192.168.0.1', '192.168.2.1', '192.168.3.1',
    '192.168.31.1', '192.168.100.1', '192.168.123.1',
    '10.0.0.1', '10.0.1.1', '172.16.0.1', '172.16.1.1',
  ]
  const found = []
  for (let i = 0; i < candidates.length; i += 4) {
    const batch = candidates.slice(i, i + 4)
    const results = await Promise.allSettled(batch.map(host => probeHost(host, timeout)))
    results.forEach((r, j) => {
      if (r.status === 'fulfilled' && r.value) {
        const item = { host: batch[j], ...r.value }
        found.push(item)
        onFound?.(item)
      }
    })
  }
  return found
}

async function probeHost(host, timeout) {
  // 并行探测 HTTP:80 和 HTTPS:443
  const attempts = [
    { url: `http://${host}/ubus`,  https: false, port: 80  },
    { url: `https://${host}/ubus`, https: true,  port: 443 },
    { url: `http://${host}:8080/ubus`, https: false, port: 8080 },
  ]
  const body = JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'call',
    params: ['00000000000000000000000000000000', 'session', 'login', { username: '', password: '' }]
  })
  const results = await Promise.allSettled(attempts.map(async ({ url, https: isHttps, port }) => {
    const ctrl  = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeout)
    try {
      const res  = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: ctrl.signal })
      clearTimeout(timer)
      if (!res.ok) return null
      const data = await res.json()
      const code = data.result?.[0]
      if (code === 6 || code === 0 || (data.jsonrpc === '2.0' && data.id === 1)) {
        return { reachable: true, isOpenWrt: code === 6 || code === 0, https: isHttps, port }
      }
      return null
    } catch { clearTimeout(timer); return null }
  }))
  return results.find(r => r.status === 'fulfilled' && r.value)?.value || null
}

class RouterManager {
  constructor() { this._configs = new Map() }

  async load() {
    try {
      const raw  = await AsyncStorage.getItem('openwrt_routers')
      const list = raw ? JSON.parse(raw) : []
      list.forEach(c => this._configs.set(c.id, c))
      return list
    } catch { return [] }
  }

  async save() {
    await AsyncStorage.setItem('openwrt_routers', JSON.stringify([...this._configs.values()]))
  }

  async add(config) {
    const id = config.id || `r_${Date.now()}`
    this._configs.set(id, {
      ...config, id,
      https:     !!config.https,
      ignoreSSL: config.ignoreSSL !== undefined ? !!config.ignoreSSL : !!config.https,
      addedAt:   Date.now()
    })
    await this.save()
    return id
  }

  async remove(id) { this._configs.delete(id); await this.save() }
  list()   { return [...this._configs.values()].sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0)) }
  get(id)  { return this._configs.get(id) }
  async update(id, patch) {
    const cfg = this._configs.get(id)
    if (cfg) { Object.assign(cfg, patch); await this.save() }
  }
}

export const routerManager = new RouterManager()
export { OpenWrtClient, OpenWrtError, RouterManager, scanLAN, fmtUptime, probeHost }

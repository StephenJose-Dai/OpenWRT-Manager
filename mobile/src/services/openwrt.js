/**
 * React Native OpenWrt ubus 客户端
 * 使用原生 fetch API（RN 内置），支持局域网 HTTP 直连
 */

class OpenWrtClient {
  constructor(config) {
    this.host     = config.host
    this.port     = config.port || 80
    this.username = config.username || 'root'
    this.password = config.password || ''
    this.https    = config.https || false
    this.timeout  = config.timeout || 8000
    this.session  = null
    this.sessionExpires = 0
    this._id      = 1
  }

  get baseUrl() {
    const proto   = this.https ? 'https' : 'http'
    const portStr = (this.port === 80 && !this.https) ? '' : `:${this.port}`
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
      if (!data.result) throw new Error('无效响应')
      const [code, result] = data.result
      if (code !== 0) throw new OpenWrtError(code)
      return result
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
    if (!this.session || Date.now() > this.sessionExpires - 10000) {
      await this.login()
    }
  }

  async call(obj, method, params = {}) {
    await this.ensureSession()
    return this._rpc([this.session, obj, method, params])
  }

  async ping() {
    try {
      const NULL = '00000000000000000000000000000000'
      await this._rpc([NULL, 'session', 'login', { username: '', password: '' }])
      return true
    } catch (e) { return e instanceof OpenWrtError }
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
      up:      i.up,
      proto:   i.proto,
      ip:      i['ipv4-address']?.[0]?.address,
      rxBytes: i.statistics?.rx_bytes || 0,
      txBytes: i.statistics?.tx_bytes || 0,
    }))
  }

  async getDHCPLeases() {
    try {
      const res = await this.call('luci-rpc', 'getDHCPLeases')
      return res.leases || []
    } catch {
      try {
        const f = await this.call('file', 'read', { path: '/tmp/dhcp.leases' })
        return parseDHCPLeases(f.data || '')
      } catch { return [] }
    }
  }

  async getFirewallRules() {
    const res  = await this.call('uci', 'get', { config: 'firewall' })
    const vals = res.values || {}
    const map  = {}
    Object.entries(vals).forEach(([k, v]) => {
      const m = k.match(/^firewall\.@rule\[(\d+)\]\.(\w+)$/)
      if (m) { if (!map[m[1]]) map[m[1]] = { _idx: +m[1] }; map[m[1]][m[2]] = v }
    })
    return Object.values(map).sort((a, b) => a._idx - b._idx)
  }

  async getLog() {
    try {
      const r = await this.call('file', 'exec', { command: 'logread', args: ['-l', '200'] })
      return (r.stdout || '').split('\n').filter(Boolean)
    } catch { return [] }
  }

  async reboot() { await this.call('system', 'reboot') }

  async execCommand(cmd, args = []) {
    return this.call('file', 'exec', { command: cmd, args })
  }

  async uciGet(config) {
    return this.call('uci', 'get', { config })
  }

  async uciSet(config, section, values) {
    await this.call('uci', 'set',    { config, section, values })
    await this.call('uci', 'commit', { config })
  }
}

class OpenWrtError extends Error {
  constructor(code) {
    const msgs = { 2: '参数错误', 3: '方法不存在', 6: '权限不足', 7: '超时' }
    super(msgs[code] || `ubus 错误 (${code})`)
    this.code = code
    this.name = 'OpenWrtError'
  }
}

function fmtUptime(s) {
  if (!s) return '--'
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${d}天 ${h}时 ${m}分`
}

function parseDHCPLeases(raw) {
  return raw.trim().split('\n').filter(Boolean).map(line => {
    const [expires, mac, ip, name] = line.split(' ')
    return { expires: parseInt(expires), mac, ip, hostname: name === '*' ? null : name }
  })
}

// ── 局域网扫描 ──────────────────────────────────────────────
async function scanLAN(onFound, timeout = 1500) {
  const candidates = [
    '192.168.1.1', '192.168.0.1', '192.168.2.1', '192.168.3.1',
    '192.168.31.1', '192.168.100.1', '10.0.0.1', '10.0.1.1',
    '172.16.0.1'
  ]
  const found = []

  for (let i = 0; i < candidates.length; i += 4) {
    const batch = candidates.slice(i, i + 4)
    const results = await Promise.allSettled(
      batch.map(host => probeHost(host, timeout))
    )
    results.forEach((r, j) => {
      if (r.status === 'fulfilled' && r.value) {
        const item = { host: batch[j] }
        found.push(item)
        onFound?.(item)
      }
    })
  }
  return found
}

async function probeHost(host, timeout) {
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(`http://${host}/ubus`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'call',
        params: ['00000000000000000000000000000000', 'session', 'login',
                 { username: '', password: '' }]
      }),
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    const data = await res.json()
    const code = data.result?.[0]
    return code === 6 || code === 0
  } catch {
    clearTimeout(timer)
    return false
  }
}

// ── 路由器管理（AsyncStorage）──────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage'

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
    this._configs.set(id, { ...config, id, addedAt: Date.now() })
    await this.save()
    return id
  }

  async remove(id) { this._configs.delete(id); await this.save() }
  list()     { return [...this._configs.values()].sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0)) }
  get(id)    { return this._configs.get(id) }
  async update(id, patch) {
    const cfg = this._configs.get(id)
    if (cfg) { Object.assign(cfg, patch); await this.save() }
  }
}

// 全局单例
export const routerManager = new RouterManager()
export { OpenWrtClient, OpenWrtError, RouterManager, scanLAN, fmtUptime }

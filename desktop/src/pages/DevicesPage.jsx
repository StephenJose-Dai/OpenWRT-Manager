import React, { useEffect, useState, useCallback } from 'react'
import { RefreshCw, UserX, Search, Wifi } from 'lucide-react'

export default function DevicesPage({ client }) {
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(false)
  const [search,  setSearch]  = useState('')
  const [kicking, setKicking] = useState(null)
  const [error,   setError]   = useState('')

  const fetchDevices = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const leases = await client.getDHCPLeases()
      // 去重（按 MAC 或 IP）
      const seen = new Set()
      const unique = leases.filter(d => {
        const key = d.mac || d.ip
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
      })
      setDevices(unique)
      if (unique.length === 0) {
        setError('未找到设备。可能原因：① DHCP 租约为空  ② 需安装 rpcd-mod-file + luci-mod-rpc  ③ 重启 rpcd')
      }
    } catch(e) {
      setError('加载失败：' + e.message)
    }
    setLoading(false)
  }, [client])

  useEffect(() => {
    fetchDevices()
    const t = setInterval(fetchDevices, 15000)
    return () => clearInterval(t)
  }, [fetchDevices])

  const filtered = devices.filter(d =>
    !search ||
    (d.ip   || '').includes(search) ||
    (d.hostname || '').toLowerCase().includes(search.toLowerCase()) ||
    (d.mac  || '').toLowerCase().includes(search.toLowerCase())
  )

  const kick = async (mac, name) => {
    if (!mac) { alert('无 MAC 地址，无法踢出'); return }
    if (!confirm(`踢出设备「${name || mac}」？此操作将通过 iptables 阻断该设备`)) return
    setKicking(mac)
    try {
      await client.execCommand('iptables', ['-I', 'FORWARD', '-m', 'mac', '--mac-source', mac, '-j', 'DROP'])
      setDevices(d => d.filter(x => x.mac !== mac))
    } catch(e) {
      alert('操作失败：' + e.message + '\n可能需要先安装 rpcd-mod-file 并重启 rpcd')
    }
    setKicking(null)
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>设备管理 <span className="badge badge-blue">{devices.length}</span></h1>
        <div className="page-actions">
          <div className="search-box">
            <Search size={13}/>
            <input placeholder="搜索 IP/MAC/主机名" value={search}
              onChange={e => setSearch(e.target.value)}/>
          </div>
          <button className="btn-icon" onClick={fetchDevices}>
            <RefreshCw size={15} className={loading ? 'spin' : ''}/>
          </button>
        </div>
      </div>

      {error && devices.length === 0 && (
        <div style={{background:'#1e2530',border:'1px solid #30363d',borderRadius:8,
          padding:'12px 14px',fontSize:13,marginBottom:12}}>
          <div style={{color:'#8b949e',marginBottom:8}}>ℹ {error}</div>
          <details style={{cursor:'pointer'}}>
            <summary style={{color:'#58a6ff',fontSize:12}}>查看路由器端配置命令</summary>
            <pre style={{background:'#0d1117',borderRadius:6,padding:'10px',marginTop:8,
              fontSize:11,color:'#7ee787',overflow:'auto',userSelect:'all'}}>
{`opkg update && opkg install rpcd-mod-file luci-mod-rpc

cat > /usr/share/rpcd/acl.d/owm.json << 'EOF'
{
  "root": {
    "read": {
      "ubus": {"*":["*"]},
      "uci": {"*":["read"]},
      "file": {
        "/tmp/dhcp.leases":["read"],
        "/proc/net/arp":["read"],
        "/proc/net/dev":["read"],
        "/bin/sh":["exec"],"/bin/ls":["exec"],
        "/bin/cat":["exec"],"/sbin/logread":["exec"]
      }
    },
    "write": {
      "ubus":{"*":["*"]},
      "uci":{"*":["read","write"]},
      "file": {
        "/tmp/dhcp.leases":["read"],
        "/proc/net/arp":["read"],
        "/proc/net/dev":["read"],
        "/bin/sh":["exec"],"/etc/init.d/*":["exec"],
        "/sbin/iptables":["exec"],"/usr/sbin/iptables":["exec"]
      }
    }
  }
}
EOF

/etc/init.d/rpcd restart`}
            </pre>
          </details>
        </div>
      )}

      <div className="card">
        <table className="data-table">
          <thead>
            <tr><th>主机名</th><th>IP 地址</th><th>MAC 地址</th><th>操作</th></tr>
          </thead>
          <tbody>
            {loading && devices.length === 0 && (
              <tr><td colSpan={4} style={{textAlign:'center',color:'#8b949e',padding:28}}>
                加载中...
              </td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={4} style={{textAlign:'center',color:'#484f58',padding:28}}>
                暂无设备
              </td></tr>
            )}
            {filtered.map((d, i) => (
              <tr key={d.mac || d.ip || i}>
                <td>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span className="device-avatar"><Wifi size={13}/></span>
                    {d.hostname || <span className="text-muted">未知设备</span>}
                  </div>
                </td>
                <td><code>{d.ip || '--'}</code></td>
                <td><code className="text-muted">{d.mac || '--'}</code></td>
                <td>
                  <button className="btn-danger-sm" disabled={kicking === d.mac || !d.mac}
                    onClick={() => kick(d.mac, d.hostname)}>
                    <UserX size={12}/> {kicking === d.mac ? '踢出中' : '踢出'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

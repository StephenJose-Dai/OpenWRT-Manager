import React, { useEffect, useState } from 'react'
import { RefreshCw, UserX, Search, Wifi } from 'lucide-react'

export default function DevicesPage({ client }) {
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch]   = useState('')
  const [kicking, setKicking] = useState(null)

  const fetchDevices = async () => {
    setLoading(true)
    try {
      const leases = await client.getDHCPLeases()
      const seen = new Set()
      setDevices(leases.filter(d => { if(seen.has(d.mac)) return false; seen.add(d.mac); return true }))
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { fetchDevices(); const t = setInterval(fetchDevices, 15000); return () => clearInterval(t) }, [client])

  const filtered = devices.filter(d =>
    !search || d.ip.includes(search) ||
    (d.hostname||'').toLowerCase().includes(search.toLowerCase()) ||
    d.mac.toLowerCase().includes(search.toLowerCase())
  )

  const kick = async (mac, name) => {
    if (!confirm(`踢出设备「${name||mac}」？`)) return
    setKicking(mac)
    try {
      await client.execCommand('iptables', ['-I','FORWARD','-m','mac','--mac-source',mac,'-j','DROP'])
      setDevices(d => d.filter(x => x.mac !== mac))
    } catch(e) { alert('操作失败：'+e.message) }
    setKicking(null)
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>设备管理 <span className="badge badge-blue">{devices.length}</span></h1>
        <div className="page-actions">
          <div className="search-box">
            <Search size={13}/>
            <input placeholder="搜索 IP/MAC/主机名" value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <button className="btn-icon" onClick={fetchDevices}><RefreshCw size={15} className={loading?'spin':''}/></button>
        </div>
      </div>
      <div className="card">
        <table className="data-table">
          <thead><tr><th>主机名</th><th>IP 地址</th><th>MAC 地址</th><th>操作</th></tr></thead>
          <tbody>
            {filtered.map(d=>(
              <tr key={d.mac}>
                <td>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span className="device-avatar"><Wifi size={13}/></span>
                    {d.hostname||<span className="text-muted">未知设备</span>}
                  </div>
                </td>
                <td><code>{d.ip}</code></td>
                <td><code className="text-muted">{d.mac}</code></td>
                <td>
                  <button className="btn-danger-sm" disabled={kicking===d.mac}
                    onClick={()=>kick(d.mac,d.hostname)}>
                    <UserX size={12}/>{kicking===d.mac?'踢出中':'踢出'}
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length===0&&<tr><td colSpan={4} style={{textAlign:'center',color:'#666',padding:28}}>暂无设备</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

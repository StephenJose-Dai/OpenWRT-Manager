// VPNPage.jsx
import React, { useEffect, useState } from 'react'
import { Network, RefreshCw, Play, Square } from 'lucide-react'

export function VPNPage({ client }) {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)

  const check = async () => {
    setLoading(true)
    try {
      const r = await client.execCommand('cat', ['/etc/config/openvpn'])
      setStatus(r.stdout ? 'openvpn' : null)
    } catch { setStatus(null) }
    setLoading(false)
  }
  useEffect(()=>{ check() },[client])

  const ctl = async (svc, act) => {
    try { await client.execCommand(`/etc/init.d/${svc}`, [act]) }
    catch(e) { alert(e.message) }
    check()
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1><Network size={18}/> VPN 管理</h1>
        <button className="btn-icon" onClick={check}><RefreshCw size={15} className={loading?'spin':''}/></button>
      </div>
      <div className="card">
        {status===null?(
          <div style={{padding:'32px 0',textAlign:'center'}}>
            <p className="text-muted" style={{marginBottom:12}}>未检测到 OpenVPN 或 WireGuard 配置</p>
            <p style={{fontSize:13,color:'#555'}}>请通过 SSH 终端在路由器上安装并配置 VPN。</p>
            <button className="btn-primary" style={{marginTop:16}} onClick={()=>window.location.href='/terminal'}>打开终端配置</button>
          </div>
        ):(
          <div className="vpn-item">
            <span className="vpn-name">OpenVPN</span>
            <div className="vpn-actions">
              <button className="btn-primary" onClick={()=>ctl('openvpn','start')}><Play size={12}/> 启动</button>
              <button className="btn-ghost"   onClick={()=>ctl('openvpn','stop')}><Square size={12}/> 停止</button>
              <button className="btn-ghost"   onClick={()=>ctl('openvpn','restart')}><RefreshCw size={12}/> 重启</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
export default VPNPage

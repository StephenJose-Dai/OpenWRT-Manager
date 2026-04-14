import React, { useEffect, useState } from 'react'
import { Settings, Power, RefreshCw, Key } from 'lucide-react'

export default function SystemPage({ client }) {
  const [info, setInfo]   = useState(null)
  const [log, setLog]     = useState([])
  const [wifi, setWifi]   = useState([])
  const [tab, setTab]     = useState('info')
  const [wifiForm, setWifiForm] = useState({ iface:'', password:'' })
  const [wifiMsg, setWifiMsg]   = useState('')
  const [loading,   setLoading]   = useState(false)

  useEffect(()=>{
    client.getSystemInfo().then(setInfo).catch(()=>{})
  },[client])

  const loadLog = async () => {
    setLoading(true)
    try { setLog(await client.getLog()) } catch{}
    setLoading(false)
  }

  const loadWifi = async () => {
    try {
      const r = await client.call('uci','get',{config:'wireless'})
      const vals = r.values||{}
      const nets = []
      const map = {}
      Object.entries(vals).forEach(([k,v])=>{
        const parts = k.split('.')
        if(parts.length===3&&parts[0]==='wireless'){ if(!map[parts[1]])map[parts[1]]={_s:parts[1]}; map[parts[1]][parts[2]]=v }
      })
      Object.values(map).forEach(n=>{ if(n.ssid||n.mode==='ap') nets.push(n) })
      setWifi(nets)
      if(nets[0]) setWifiForm(f=>({...f,iface:nets[0]._s}))
    } catch{}
  }

  const [autoStart, setAutoStart] = useState(false)
  const [autoStartMsg, setAutoStartMsg] = useState('')

  useEffect(() => {
    // 读取当前开机自启状态（通过注册表）
    window.electron?.getAutoStart?.().then(v => setAutoStart(!!v)).catch(() => {})
  }, [])

  const toggleAutoStart = async (checked) => {
    try {
      await window.electron?.setAutoStart?.(checked)
      setAutoStart(checked)
      setAutoStartMsg(checked ? '✓ 已设置开机自启' : '✓ 已关闭开机自启')
      setTimeout(() => setAutoStartMsg(''), 2000)
    } catch(e) {
      setAutoStartMsg('✗ 设置失败：' + e.message)
    }
  }

  const switchTab = (t) => {
    setTab(t)
    if(t==='log'&&log.length===0) loadLog()
    if(t==='wifi'&&wifi.length===0) loadWifi()
  }

  const saveWifi = async () => {
    if(wifiForm.password.length < 8){ setWifiMsg('密码至少8位'); return }
    try {
      await client.call('uci','set',{config:'wireless',section:wifiForm.iface,values:{key:wifiForm.password}})
      await client.call('uci','commit',{config:'wireless'})
      await client.execCommand('wifi').catch(()=>{})
      setWifiMsg('✅ 密码已更新，设备需重新连接')
    } catch(e){ setWifiMsg('❌ '+e.message) }
  }

  return (
    <div className="page">
      <div className="page-header"><h1><Settings size={18}/> 系统设置</h1></div>
      <div style={{display:'flex',gap:8,marginBottom:16}}>
        {[['info','系统信息'],['wifi','WiFi 设置'],['log','系统日志'],['app','应用设置']].map(([t,l])=>(
          <button key={t} className={tab===t?'btn-primary':'btn-ghost'} onClick={()=>switchTab(t)}>
            {l}
          </button>
        ))}
      </div>

      {tab==='info'&&(
        <>
          <div className="card">
            <div className="card-header"><h2>系统信息</h2></div>
            <div className="info-grid">
              {[['主机名',info?.hostname],['型号',info?.model],['系统版本',info?.release],
                ['运行时间',info?.uptimeFmt],['CPU负载',info?.load?.join(' / ')],
                ['内存使用',`${info?.memory?.usagePct||0}% (${Math.round((info?.memory?.used||0)/1024)}MB / ${Math.round((info?.memory?.total||0)/1024)}MB)`]
              ].map(([l,v])=>(
                <div key={l} className="info-row">
                  <span className="info-label">{l}</span>
                  <span className="info-val">{v||'--'}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card" style={{marginTop:12}}>
            <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
              <button className="btn-danger" onClick={()=>{ if(confirm('确定重启？')) client.reboot() }}>
                <Power size={14}/> 重启路由器
              </button>
              <button className="btn-ghost" onClick={()=>client.execCommand('opkg',['list-upgradable']).then(r=>alert(r.stdout||'已是最新')).catch(e=>alert(e.message))}>
                <RefreshCw size={14}/> 检查升级
              </button>
              <button className="btn-ghost" onClick={()=>client.getSystemInfo().then(setInfo)}>
                <RefreshCw size={14}/> 刷新
              </button>
            </div>
          </div>
          <div className="card" style={{marginTop:12}}>
            <h3 style={{marginBottom:12,fontSize:14}}>应用设置</h3>
            <label className="checkbox-label" style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer'}}>
              <input type="checkbox" checked={autoStart} onChange={e=>toggleAutoStart(e.target.checked)}
                style={{width:16,height:16,accentColor:'var(--blue)',cursor:'pointer'}}/>
              <div>
                <div style={{fontSize:13,fontWeight:500}}>开机自动启动 OpenWrt Manager</div>
                <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>Windows 登录时自动启动（写入注册表 HKCU\Run）</div>
              </div>
            </label>
            {autoStartMsg && <div style={{marginTop:8,fontSize:12,color:autoStartMsg.startsWith('✓')?'var(--green)':'var(--red)'}}>{autoStartMsg}</div>}
          </div>
        </>
      )}

      {tab==='wifi'&&(
        <div className="card">
          <h3 style={{marginBottom:14}}>修改 WiFi 密码</h3>
          <div className="form-grid" style={{maxWidth:400}}>
            <label>无线接口
              <select value={wifiForm.iface} onChange={e=>setWifiForm(f=>({...f,iface:e.target.value}))}>
                {wifi.map(n=><option key={n._s} value={n._s}>{n.ssid||n._s}</option>)}
              </select>
            </label>
            <label>新密码（至少8位）
              <input type="password" value={wifiForm.password} onChange={e=>setWifiForm(f=>({...f,password:e.target.value}))} placeholder="输入新密码"/>
            </label>
          </div>
          <div style={{marginTop:12,display:'flex',alignItems:'center',gap:12}}>
            <button className="btn-primary" onClick={saveWifi}><Key size={13}/> 更新密码</button>
            {wifiMsg&&<span style={{fontSize:13}}>{wifiMsg}</span>}
          </div>
        </div>
      )}

      {tab==='app'&&(
        <div className="card">
          <div className="card-header"><h2>应用设置</h2></div>
          <div style={{display:'flex',flexDirection:'column',gap:16,padding:'4px 0'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
              padding:'12px 0',borderBottom:'1px solid var(--border)'}}>
              <div>
                <div style={{fontWeight:500,marginBottom:3}}>开机自动启动</div>
                <div style={{fontSize:12,color:'var(--muted)'}}>Windows 登录时自动启动 OpenWrt Manager</div>
              </div>
              <label style={{position:'relative',display:'inline-block',width:44,height:24,cursor:'pointer'}}>
                <input type="checkbox" checked={autoStart}
                  onChange={e => toggleAutoStart(e.target.checked)}
                  style={{opacity:0,width:0,height:0}} />
                <span style={{
                  position:'absolute',inset:0,borderRadius:12,
                  background: autoStart ? '#4f8ef7' : '#30363d',
                  transition:'.3s',
                }}>
                  <span style={{
                    position:'absolute',width:18,height:18,borderRadius:'50%',
                    background:'#fff',top:3,left: autoStart ? 23 : 3,
                    transition:'.3s', boxShadow:'0 1px 3px rgba(0,0,0,.3)'
                  }}/>
                </span>
              </label>
            </div>
            {autoStartMsg && (
              <div style={{color: autoStartMsg.startsWith('✓') ? 'var(--green)' : 'var(--red)',
                fontSize:13}}>
                {autoStartMsg}
              </div>
            )}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
              padding:'12px 0',borderBottom:'1px solid var(--border)'}}>
              <div>
                <div style={{fontWeight:500,marginBottom:3}}>最小化到托盘</div>
                <div style={{fontSize:12,color:'var(--muted)'}}>关闭窗口时最小化到系统托盘而不退出</div>
              </div>
              <span style={{fontSize:12,color:'var(--muted)',
                background:'var(--bg3)',padding:'3px 10px',borderRadius:6}}>
                已启用
              </span>
            </div>
          </div>
        </div>
      )}

      {tab==='log'&&(
        <div className="card">
          <div className="card-header">
            <h2>系统日志</h2>
            <button className="btn-icon" onClick={loadLog}><RefreshCw size={13} className={loading?'spin':''}/></button>
          </div>
          <pre className="log-viewer">{log.slice(-200).join('\n')||'加载中...'}</pre>
        </div>
      )}
    </div>
  )
}

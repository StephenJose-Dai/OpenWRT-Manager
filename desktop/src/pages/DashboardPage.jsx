// 完整实现见对话历史 DashboardPage.jsx
// 此处为占位符，实际文件已在上方对话中完整给出
import React, { useEffect } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Cpu, MemoryStick, Wifi, Clock, RefreshCw, Power } from 'lucide-react'

function fmtBytes(b) {
  if (!b) return '0 B'
  const k=1024,s=['B','KB','MB','GB'],i=Math.floor(Math.log(b)/Math.log(k))
  return `${(b/Math.pow(k,i)).toFixed(1)} ${s[i]}`
}

export default function DashboardPage({ client }) {
  const [info, setInfo] = React.useState(null)
  const [loading, setLoading] = React.useState(false)
  const [history, setHistory] = React.useState([])

  const fetchInfo = async () => {
    setLoading(true)
    try {
      const sysInfo = await client.getSystemInfo()
      setInfo(sysInfo)
      const ifaces = await client.getNetworkInterfaces()
      const eth = ifaces.find(i => i.name === 'wan' || i.ifname === 'eth0')
      if (eth) {
        setHistory(h => [...h, { rx: eth.rxBytes, tx: eth.txBytes, ts: Date.now() }].slice(-60))
      }
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { fetchInfo(); const t = setInterval(fetchInfo, 10000); return () => clearInterval(t) }, [client])

  const chartData = history.slice(-30).map((s,i,arr) => ({
    i,
    rx: i > 0 ? Math.max(0, Math.round((s.rx - arr[i-1].rx)/1024)) : 0,
    tx: i > 0 ? Math.max(0, Math.round((s.tx - arr[i-1].tx)/1024)) : 0,
  }))

  return (
    <div className="page">
      <div className="page-header">
        <h1>系统总览</h1>
        <div className="page-actions">
          <button className="btn-icon" onClick={fetchInfo}><RefreshCw size={15} className={loading ? 'spin' : ''} /></button>
          <button className="btn-danger" onClick={() => { if(confirm('确定重启路由器？')) client.reboot() }}>
            <Power size={15}/> 重启
          </button>
        </div>
      </div>

      {info && (
        <div className="info-banner">
          <span className="hostname">{info.hostname}</span>
          <span className="divider">·</span>
          <span>{info.release}</span>
          <span className="divider">·</span>
          <Clock size={13}/>
          <span>{info.uptimeFmt}</span>
        </div>
      )}

      <div className="stats-grid">
        {[
          { label:'CPU 负载', value: info?.load?.[0] || '--', sub:`5m: ${info?.load?.[1]||'--'}`, color:'#4f8ef7' },
          { label:'内存使用', value:`${info?.memory?.usagePct||0}%`, sub:`${fmtBytes((info?.memory?.used||0)*1024)}`, color:'#7c5af7' },
          { label:'运行时间', value: info?.uptimeFmt?.split(' ')[0]||'--', sub: info?.uptimeFmt||'--', color:'#f59e0b' },
          { label:'系统版本', value:(info?.release||'--').substring(0,12), sub: info?.hostname||'--', color:'#22c55e' },
        ].map(c => (
          <div key={c.label} className="stat-card">
            <div className="stat-icon" style={{background:c.color+'22',color:c.color}}>
              <Cpu size={18}/>
            </div>
            <div className="stat-body">
              <div className="stat-label">{c.label}</div>
              <div className="stat-value">{c.value}</div>
              <div className="stat-sub">{c.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header"><h2>实时流量（KB/s）</h2></div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData} margin={{top:8,right:16,left:0,bottom:0}}>
            <defs>
              <linearGradient id="rx-g" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4f8ef7" stopOpacity={0.4}/>
                <stop offset="95%" stopColor="#4f8ef7" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="tx-g" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4}/>
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis dataKey="i" hide/>
            <YAxis tickFormatter={v=>v+'K'} width={48} tick={{fontSize:11}}/>
            <Tooltip formatter={(v,n)=>[`${v} KB/s`, n==='rx'?'↓下行':'↑上行']}/>
            <Area type="monotone" dataKey="rx" stroke="#4f8ef7" fill="url(#rx-g)" strokeWidth={2} dot={false} name="rx"/>
            <Area type="monotone" dataKey="tx" stroke="#22c55e" fill="url(#tx-g)" strokeWidth={2} dot={false} name="tx"/>
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

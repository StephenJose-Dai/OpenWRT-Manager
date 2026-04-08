// TrafficPage.jsx
import React, { useEffect, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from 'recharts'

function fmtSpeed(bps) {
  if (bps < 1024) return `${Math.round(bps)} B/s`
  if (bps < 1048576) return `${(bps/1024).toFixed(1)} KB/s`
  return `${(bps/1048576).toFixed(2)} MB/s`
}

export function TrafficPage({ client }) {
  const [ifaces, setIfaces]   = useState([])
  const [active, setActive]   = useState('wan')
  const [history, setHistory] = useState([])
  const [prev, setPrev]       = useState(null)

  useEffect(() => {
    client.getNetworkInterfaces().then(list => {
      setIfaces(list)
      const wan = list.find(i => i.name==='wan')
      if (wan) setActive('wan')
    }).catch(()=>{})
  }, [client])

  useEffect(() => {
    const poll = async () => {
      try {
        const list = await client.getNetworkInterfaces()
        const iface = list.find(i => i.name === active)
        if (!iface) return
        const now = { rx: iface.rxBytes||0, tx: iface.txBytes||0, ts: Date.now() }
        let rxRate=0, txRate=0
        if (prev) {
          const dt = (now.ts - prev.ts) / 1000
          rxRate = Math.max(0, (now.rx - prev.rx) / dt)
          txRate = Math.max(0, (now.tx - prev.tx) / dt)
        }
        setPrev(now)
        setHistory(h => [...h, { rx: Math.round(rxRate/1024), tx: Math.round(txRate/1024), ts: now.ts }].slice(-60))
      } catch{}
    }
    const t = setInterval(poll, 3000)
    return () => clearInterval(t)
  }, [client, active, prev])

  const cur = history.at(-1)
  return (
    <div className="page">
      <div className="page-header">
        <h1>流量统计</h1>
        <div className="page-actions">
          <select className="select" value={active} onChange={e=>{setActive(e.target.value);setHistory([]);setPrev(null)}}>
            {ifaces.map(i=><option key={i.name} value={i.name}>{i.name}</option>)}
          </select>
        </div>
      </div>
      <div className="stats-grid" style={{gridTemplateColumns:'repeat(2,1fr)'}}>
        <div className="stat-card mini"><div className="stat-label">当前下行</div><div className="stat-value" style={{color:'#4f8ef7'}}>{cur?fmtSpeed(cur.rx*1024):'--'}</div></div>
        <div className="stat-card mini"><div className="stat-label">当前上行</div><div className="stat-value" style={{color:'#22c55e'}}>{cur?fmtSpeed(cur.tx*1024):'--'}</div></div>
      </div>
      <div className="card">
        <div className="card-header"><h2>实时速率（KB/s）</h2></div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={history} margin={{top:8,right:16,left:0,bottom:0}}>
            <defs>
              <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#4f8ef7" stopOpacity={.5}/><stop offset="95%" stopColor="#4f8ef7" stopOpacity={0}/></linearGradient>
              <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22c55e" stopOpacity={.4}/><stop offset="95%" stopColor="#22c55e" stopOpacity={0}/></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08"/>
            <XAxis dataKey="ts" hide/>
            <YAxis tickFormatter={v=>v+'K'} width={50} tick={{fontSize:11}}/>
            <Tooltip formatter={(v,n)=>[`${v} KB/s`,n==='rx'?'↓下行':'↑上行']}/>
            <Legend formatter={v=>v==='rx'?'↓下行':'↑上行'}/>
            <Area type="monotone" dataKey="rx" stroke="#4f8ef7" fill="url(#rg)" strokeWidth={2} dot={false} name="rx"/>
            <Area type="monotone" dataKey="tx" stroke="#22c55e" fill="url(#tg)" strokeWidth={2} dot={false} name="tx"/>
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
export default TrafficPage

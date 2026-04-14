import React, { useEffect, useState, useRef, useCallback } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from 'recharts'
import { RefreshCw } from 'lucide-react'

function fmtSpeed(bps) {
  if (!bps || bps < 0) return '0 B/s'
  if (bps < 1024)    return `${Math.round(bps)} B/s`
  if (bps < 1048576) return `${(bps/1024).toFixed(1)} KB/s`
  return `${(bps/1048576).toFixed(2)} MB/s`
}

export function TrafficPage({ client }) {
  const [ifaces,  setIfaces]  = useState([])
  const [active,  setActive]  = useState('wan')
  const [history, setHistory] = useState([])
  const prevRef = useRef(null)
  const intervalRef = useRef(null)

  // 加载接口列表
  useEffect(() => {
    client.getNetworkInterfaces().then(list => {
      setIfaces(list)
      // 默认选 wan，找不到就选第一个 up 的
      const wan = list.find(i => i.name === 'wan') || list.find(i => i.up)
      if (wan) setActive(wan.name)
    }).catch(() => {})
  }, [client])

  const poll = useCallback(async () => {
    try {
      // 用 getNetworkStats 获取精确流量数据
      const stats = await client.getNetworkStats()

      // 找当前活跃接口的实际设备名
      const ifaceInfo = ifaces.find(i => i.name === active)
      // 尝试接口名、l3_device、ifname
      const candidates = [
        active,
        ifaceInfo?.ifname,
        ifaceInfo?.name,
        // wan 接口可能叫 pppoe-wan, eth1, etc
        active === 'wan' ? 'pppoe-wan' : null,
      ].filter(Boolean)

      let data = null
      for (const name of candidates) {
        if (stats[name]) { data = stats[name]; break }
      }

      if (!data) {
        // 如果找不到，打印可用的接口名帮助调试
        console.log('Available stats keys:', Object.keys(stats))
        return
      }

      const now = { rx: data.rxBytes, tx: data.txBytes, ts: Date.now() }
      const prev = prevRef.current

      if (prev && prev.ts > 0) {
        const dt   = (now.ts - prev.ts) / 1000  // 秒
        const rxBps = Math.max(0, (now.rx - prev.rx) / dt)
        const txBps = Math.max(0, (now.tx - prev.tx) / dt)
        setHistory(h => [...h, {
          rxBps, txBps,
          rx: Math.round(rxBps / 1024 * 10) / 10,  // KB/s，保留1位小数
          tx: Math.round(txBps / 1024 * 10) / 10,
          ts: now.ts,
        }].slice(-60))
      }
      prevRef.current = now
    } catch(e) {
      console.error('TrafficPage poll error:', e)
    }
  }, [client, active, ifaces])

  useEffect(() => {
    setHistory([])
    prevRef.current = null
    // 立即 poll 一次设置 prev，2秒后再 poll 开始显示速率
    setTimeout(() => {
      poll().then(() => {
        intervalRef.current = setInterval(poll, 2000)
      })
    }, 100)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [poll])

  const cur = history.at(-1)

  return (
    <div className="page">
      <div className="page-header">
        <h1>流量统计</h1>
        <div className="page-actions">
          <select className="select" value={active}
            onChange={e => { setActive(e.target.value); setHistory([]); prevRef.current = null }}>
            {ifaces.map(i => (
              <option key={i.name} value={i.name}>
                {i.name}{i.ifname && i.ifname !== i.name ? ` (${i.ifname})` : ''}
              </option>
            ))}
          </select>
          <button className="btn-icon" onClick={() => { setHistory([]); prevRef.current = null; poll() }}
            title="重置">
            <RefreshCw size={15}/>
          </button>
        </div>
      </div>

      <div className="stats-grid" style={{gridTemplateColumns:'repeat(2,1fr)'}}>
        <div className="stat-card mini">
          <div className="stat-label">↓ 当前下行</div>
          <div className="stat-value" style={{color:'#4f8ef7'}}>
            {cur ? fmtSpeed(cur.rxBps) : '-- B/s'}
          </div>
        </div>
        <div className="stat-card mini">
          <div className="stat-label">↑ 当前上行</div>
          <div className="stat-value" style={{color:'#22c55e'}}>
            {cur ? fmtSpeed(cur.txBps) : '-- B/s'}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2>实时速率（KB/s）</h2></div>
        {history.length > 1 ? (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={history} margin={{top:8,right:16,left:0,bottom:0}}>
              <defs>
                <linearGradient id="rg2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#4f8ef7" stopOpacity={.5}/>
                  <stop offset="95%" stopColor="#4f8ef7" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="tg2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#22c55e" stopOpacity={.4}/>
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08"/>
              <XAxis dataKey="ts" hide/>
              <YAxis tickFormatter={v => v + 'K'} width={50} tick={{fontSize:11}}/>
              <Tooltip
                labelFormatter={v => new Date(v).toLocaleTimeString()}
                formatter={(v, n) => [`${v} KB/s`, n === 'rx' ? '↓ 下行' : '↑ 上行']}
                contentStyle={{background:'#161b22',border:'1px solid #30363d',borderRadius:6}}
              />
              <Legend formatter={v => v === 'rx' ? '↓ 下行' : '↑ 上行'}/>
              <Area type="monotone" dataKey="rx" stroke="#4f8ef7" fill="url(#rg2)"
                strokeWidth={2} dot={false} name="rx"/>
              <Area type="monotone" dataKey="tx" stroke="#22c55e" fill="url(#tg2)"
                strokeWidth={2} dot={false} name="tx"/>
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div style={{height:240,display:'flex',alignItems:'center',justifyContent:'center',
            flexDirection:'column',gap:8,color:'#484f58',fontSize:13}}>
            <div>等待流量数据...</div>
            <div style={{fontSize:11,color:'#30363d'}}>正在采集 {active} 接口数据</div>
          </div>
        )}
      </div>
    </div>
  )
}
export default TrafficPage

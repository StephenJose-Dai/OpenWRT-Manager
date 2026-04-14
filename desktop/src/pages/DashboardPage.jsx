import React, { useEffect, useState, useCallback, useRef } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Cpu, RefreshCw, Power, Wifi } from 'lucide-react'

function fmtBytes(b) {
  if (!b || b < 0) return '0 B'
  const k = 1024, s = ['B','KB','MB','GB','TB']
  const i = Math.min(Math.floor(Math.log(b) / Math.log(k)), s.length - 1)
  return `${(b / Math.pow(k, i)).toFixed(1)} ${s[i]}`
}

function fmtSpeed(bps) {
  if (!bps || bps <= 0) return '0 B/s'
  if (bps < 1024)    return `${Math.round(bps)} B/s`
  if (bps < 1048576) return `${(bps/1024).toFixed(1)} KB/s`
  return `${(bps/1048576).toFixed(2)} MB/s`
}

export default function DashboardPage({ client }) {
  const [info,    setInfo]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState([])   // [{rx,tx,rxBps,txBps,ts}]
  const [error,   setError]   = useState('')
  const prevRef = useRef(null)

  const fetchInfo = useCallback(async () => {
    if (!client) return
    setLoading(true); setError('')
    try {
      const sysInfo = await client.getSystemInfo()
      setInfo(sysInfo)
    } catch(e) {
      console.error('[Dashboard] getSystemInfo error:', e.message, e.stack)
      setError(e.message || '获取系统信息失败')
    }
    setLoading(false)
  }, [client])

  // 独立的流量轮询（不和系统信息耦合，失败不影响系统信息显示）
  const pollTraffic = useCallback(async () => {
    if (!client) return
    try {
      const stats = await client.getNetworkStats()
      // 找流量最大的非 lo 接口作为 WAN
      const keys = Object.keys(stats).filter(k => k !== 'lo')
      if (keys.length === 0) return

      // 优先用 wan/pppoe-wan，找不到就用流量最大的
      const wanKey = keys.find(k => k === 'wan' || k === 'pppoe-wan' || k.includes('wan'))
        || keys.reduce((a, b) => (stats[a].rxBytes + stats[a].txBytes) > (stats[b].rxBytes + stats[b].txBytes) ? a : b)

      const d = stats[wanKey]
      const now = { rx: d.rxBytes, tx: d.txBytes, ts: Date.now() }
      const prev = prevRef.current

      if (prev) {
        const dt = (now.ts - prev.ts) / 1000
        if (dt > 0) {
          const rxBps = Math.max(0, (now.rx - prev.rx) / dt)
          const txBps = Math.max(0, (now.tx - prev.tx) / dt)
          setHistory(h => [...h, {
            rx: Math.round(rxBps / 1024 * 10) / 10,
            tx: Math.round(txBps / 1024 * 10) / 10,
            rxBps, txBps, ts: now.ts
          }].slice(-30))
        }
      }
      prevRef.current = now
    } catch { /* 流量获取失败静默忽略 */ }
  }, [client])

  useEffect(() => {
    fetchInfo()
    const t1 = setInterval(fetchInfo, 15000)
    return () => clearInterval(t1)
  }, [fetchInfo])

  useEffect(() => {
    // 先 poll 一次设置 prev
    pollTraffic()
    const t2 = setInterval(pollTraffic, 3000)
    return () => clearInterval(t2)
  }, [pollTraffic])

  const handleReboot = () => {
    if (!confirm('确定重启路由器？重启后约需 1-2 分钟恢复')) return
    client.reboot().catch(e => alert('重启失败：' + e.message))
  }

  const cur = history.at(-1)

  const STAT_CARDS = info ? [
    { label: 'CPU 负载',  value: info.load?.[0] ?? '--', sub: `5m: ${info.load?.[1] ?? '--'}`, color: '#4f8ef7' },
    { label: '内存使用',  value: `${info.memory?.usagePct ?? 0}%`, sub: fmtBytes(info.memory?.used || 0), color: '#7c5af7' },
    { label: '运行时间',  value: info.uptimeFmt ?? '--', sub: info.hostname ?? '--', color: '#f59e0b' },
    { label: '系统版本',  value: (info.release || '--').replace('OpenWrt ',''), sub: info.model || '--', color: '#22c55e' },
  ] : []

  return (
    <div className="page">
      <div className="page-header">
        <h1>系统总览</h1>
        <div className="page-actions">
          <button className="btn-icon" onClick={fetchInfo} title="刷新">
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
          </button>
          <button className="btn-danger" onClick={handleReboot}>
            <Power size={15} /> 重启
          </button>
        </div>
      </div>

      {error && (
        <div style={{background:'#2a1010',border:'1px solid #7f1d1d',borderRadius:8,
          padding:'10px 14px',color:'#f87171',fontSize:13,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span>⚠ {error}</span>
          <button onClick={fetchInfo} style={{background:'#4f8ef7',border:'none',borderRadius:6,
            color:'#fff',padding:'4px 12px',cursor:'pointer',fontSize:12}}>重试</button>
        </div>
      )}

      {info && (
        <div className="info-banner">
          <Wifi size={13}/>
          <span className="hostname">{info.hostname}</span>
          <span className="divider">·</span>
          <span>{info.release}</span>
          <span className="divider">·</span>
          <span>{info.uptimeFmt}</span>
        </div>
      )}

      {STAT_CARDS.length > 0 && (
        <div className="stats-grid">
          {STAT_CARDS.map(c => (
            <div key={c.label} className="stat-card">
              <div className="stat-icon" style={{background: c.color+'22', color: c.color}}>
                <Cpu size={18} />
              </div>
              <div className="stat-body">
                <div className="stat-label">{c.label}</div>
                <div className="stat-value">{c.value}</div>
                <div className="stat-sub">{c.sub}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!info && !loading && !error && (
        <div style={{textAlign:'center',color:'#8b949e',padding:40}}>正在连接...</div>
      )}

      <div className="card">
        <div className="card-header" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <h2>实时流量（KB/s）</h2>
          {cur && (
            <div style={{fontSize:12,color:'#8b949e',display:'flex',gap:16}}>
              <span style={{color:'#4f8ef7'}}>↓ {fmtSpeed(cur.rxBps)}</span>
              <span style={{color:'#22c55e'}}>↑ {fmtSpeed(cur.txBps)}</span>
            </div>
          )}
        </div>
        {history.length > 1 ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={history} margin={{top:8,right:16,left:0,bottom:0}}>
              <defs>
                <linearGradient id="dash-rx" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#4f8ef7" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#4f8ef7" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="dash-tx" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="ts" hide />
              <YAxis tickFormatter={v => v+'K'} width={48} tick={{fontSize:11}} />
              <Tooltip
                labelFormatter={v => new Date(v).toLocaleTimeString()}
                formatter={(v, n) => [`${v} KB/s`, n==='rx'?'↓下行':'↑上行']}
                contentStyle={{background:'#161b22',border:'1px solid #30363d',borderRadius:6}}
              />
              <Area type="monotone" dataKey="rx" stroke="#4f8ef7" fill="url(#dash-rx)"
                strokeWidth={2} dot={false} name="rx" />
              <Area type="monotone" dataKey="tx" stroke="#22c55e" fill="url(#dash-tx)"
                strokeWidth={2} dot={false} name="tx" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div style={{height:200,display:'flex',alignItems:'center',justifyContent:'center',
            color:'#484f58',fontSize:13}}>
            等待流量数据...（每 3 秒采集一次）
          </div>
        )}
      </div>
    </div>
  )
}

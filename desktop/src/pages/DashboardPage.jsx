import React, { useEffect, useState, useCallback } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Cpu, HardDrive, Wifi, Clock, RefreshCw, Power } from 'lucide-react'

function fmtBytes(b) {
  if (!b || b < 0) return '0 B'
  const k = 1024, s = ['B','KB','MB','GB']
  const i = Math.min(Math.floor(Math.log(b) / Math.log(k)), s.length - 1)
  return `${(b / Math.pow(k, i)).toFixed(1)} ${s[i]}`
}

export default function DashboardPage({ client }) {
  const [info,    setInfo]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState([])
  const [error,   setError]   = useState('')

  const fetchInfo = useCallback(async () => {
    if (!client) return
    setLoading(true)
    setError('')
    try {
      const sysInfo = await client.getSystemInfo()
      setInfo(sysInfo)
      try {
        const ifaces = await client.getNetworkInterfaces()
        const eth = ifaces.find(i => i.name === 'wan' || i.ifname === 'eth0' || i.up)
        if (eth) {
          setHistory(h => [...h, {
            rx: eth.rxBytes || 0,
            tx: eth.txBytes || 0,
            ts: Date.now()
          }].slice(-60))
        }
      } catch {}
    } catch(e) {
      setError(e.message || '获取数据失败')
      console.error('DashboardPage fetchInfo error:', e)
    }
    setLoading(false)
  }, [client])

  useEffect(() => {
    fetchInfo()
    const t = setInterval(fetchInfo, 15000)
    return () => clearInterval(t)
  }, [fetchInfo])

  const chartData = history.slice(-30).map((s, i, arr) => ({
    i,
    rx: i > 0 ? Math.max(0, Math.round((s.rx - arr[i-1].rx) / 1024)) : 0,
    tx: i > 0 ? Math.max(0, Math.round((s.tx - arr[i-1].tx) / 1024)) : 0,
  }))

  const handleReboot = () => {
    if (!confirm('确定重启路由器？重启后约需 1-2 分钟恢复')) return
    client.reboot().catch(e => alert('重启失败：' + e.message))
  }

  const stats = info ? [
    { label: 'CPU 负载',  value: info.load?.[0] ?? '--',    sub: `5m: ${info.load?.[1] ?? '--'}`, color: '#4f8ef7' },
    { label: '内存使用',  value: `${info.memory?.usagePct ?? 0}%`, sub: fmtBytes((info.memory?.used || 0) * 1024), color: '#7c5af7' },
    { label: '运行时间',  value: info.uptimeFmt?.split(' ')?.[0] ?? '--', sub: info.uptimeFmt ?? '--', color: '#f59e0b' },
    { label: '系统版本',  value: (info.release || '--').substring(0, 14), sub: info.hostname ?? '--', color: '#22c55e' },
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
          padding:'10px 14px',color:'#f87171',fontSize:13}}>
          ⚠ {error} — <button onClick={fetchInfo}
            style={{background:'none',border:'none',color:'#4f8ef7',cursor:'pointer',fontSize:13}}>
            重试
          </button>
        </div>
      )}

      {info && (
        <div className="info-banner">
          <span className="hostname">{info.hostname}</span>
          <span className="divider">·</span>
          <span>{info.release}</span>
          <span className="divider">·</span>
          <Clock size={13} />
          <span>{info.uptimeFmt}</span>
        </div>
      )}

      {stats.length > 0 && (
        <div className="stats-grid">
          {stats.map(c => (
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
        <div style={{textAlign:'center',color:'#8b949e',padding:40}}>
          加载中...
        </div>
      )}

      <div className="card">
        <div className="card-header"><h2>实时流量（KB/s）</h2></div>
        {chartData.length > 1 ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{top:8,right:16,left:0,bottom:0}}>
              <defs>
                <linearGradient id="rx-g" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#4f8ef7" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#4f8ef7" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="tx-g" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="i" hide />
              <YAxis tickFormatter={v => v+'K'} width={48} tick={{fontSize:11}} />
              <Tooltip formatter={(v, n) => [`${v} KB/s`, n==='rx'?'↓下行':'↑上行']} />
              <Area type="monotone" dataKey="rx" stroke="#4f8ef7" fill="url(#rx-g)"
                strokeWidth={2} dot={false} name="rx" />
              <Area type="monotone" dataKey="tx" stroke="#22c55e" fill="url(#tx-g)"
                strokeWidth={2} dot={false} name="tx" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div style={{height:200,display:'flex',alignItems:'center',justifyContent:'center',
            color:'#484f58',fontSize:13}}>
            {loading ? '正在获取流量数据...' : '暂无流量数据，等待下一次轮询'}
          </div>
        )}
      </div>
    </div>
  )
}

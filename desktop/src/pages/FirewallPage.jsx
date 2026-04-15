import React, { useEffect, useState, useCallback } from 'react'
import { Shield, Plus, Trash2, RefreshCw } from 'lucide-react'

export function FirewallPage({ client }) {
  const [rules,    setRules]    = useState([])
  const [zones,    setZones]    = useState([])
  const [redirects,setRedirects]= useState([])
  const [loading,  setLoading]  = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [tab,      setTab]      = useState('rules')
  const [form,     setForm]     = useState({
    name:'', src:'wan', dest:'lan', proto:'tcp', destPort:'', target:'ACCEPT'
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const loadData = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res  = await client.call('uci', 'get', { config: 'firewall' })
      const vals = res.values || {}

      const rules = [], zones = [], redirects = []

      // ubus uci get 返回的是 section 对象，用 .type 判断类型
      Object.entries(vals).forEach(([, sec]) => {
        if (!sec || typeof sec !== 'object') return
        const t = sec['.type']
        if (t === 'rule')       rules.push(sec)
        else if (t === 'zone')  zones.push(sec)
        else if (t === 'redirect') redirects.push(sec)
      })

      // 按 .index 排序
      const byIndex = arr => arr.sort((a,b) => (a['.index']||0) - (b['.index']||0))

      setRules(byIndex(rules))
      setZones(byIndex(zones))
      setRedirects(byIndex(redirects))

      if (rules.length + zones.length + redirects.length === 0) {
        setError('未读取到防火墙配置，请确认 rpcd ACL 已配置 uci read 权限')
      }
    } catch(e) {
      setError('加载失败：' + e.message)
    }
    setLoading(false)
  }, [client])

  useEffect(() => { loadData() }, [loadData])

  const addRule = async () => {
    if (!form.name) { alert('请填写规则名称'); return }
    setSaving(true)
    try {
      const r = await client.call('uci', 'add', { config: 'firewall', type: 'rule' })
      const values = { name:form.name, src:form.src, dest:form.dest,
                       proto:form.proto, target:form.target }
      if (form.destPort) values.dest_port = form.destPort
      await client.call('uci', 'set', { config:'firewall', section:r.section, values })
      await client.call('uci', 'commit', { config:'firewall' })
      await client.execCommand('/etc/init.d/firewall', ['reload']).catch(() => {})
      setShowForm(false); loadData()
    } catch(e) { alert('添加失败：' + e.message) }
    setSaving(false)
  }

  const delRule = async (name) => {
    if (!confirm('删除此规则？')) return
    try {
      await client.call('uci', 'delete', { config:'firewall', section: name })
      await client.call('uci', 'commit', { config:'firewall' })
      loadData()
    } catch(e) { alert('删除失败：' + e.message) }
  }

  const set = (k,v) => setForm(f => ({...f, [k]:v}))

  const TABS = [
    { key:'rules',     label:`规则 (${rules.length})` },
    { key:'zones',     label:`区域 (${zones.length})` },
    { key:'redirects', label:`端口转发 (${redirects.length})` },
  ]

  return (
    <div className="page">
      <div className="page-header">
        <h1><Shield size={18}/> 防火墙</h1>
        <div className="page-actions">
          <div style={{display:'flex',gap:6}}>
            {TABS.map(t => (
              <button key={t.key}
                className={tab===t.key ? 'btn-primary' : 'btn-ghost'}
                style={{padding:'5px 12px',fontSize:12}}
                onClick={() => setTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
          <button className="btn-icon" onClick={loadData}>
            <RefreshCw size={15} className={loading?'spin':''}/>
          </button>
          {tab==='rules' && (
            <button className="btn-primary" onClick={() => setShowForm(v=>!v)}>
              <Plus size={14}/> 新增规则
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{background:'#1e2530',border:'1px solid #30363d',borderRadius:8,
          padding:'10px 14px',color:'#8b949e',fontSize:13,marginBottom:12}}>
          ℹ {error}
        </div>
      )}

      {showForm && tab==='rules' && (
        <div className="card form-card" style={{marginBottom:12}}>
          <h3 style={{marginBottom:14}}>新增防火墙规则</h3>
          <div className="form-grid">
            <label>规则名称<input value={form.name} onChange={e=>set('name',e.target.value)} placeholder="如：开放 HTTP"/></label>
            <label>来源区域<select value={form.src} onChange={e=>set('src',e.target.value)}><option>wan</option><option>lan</option><option value="*">任意</option></select></label>
            <label>目标区域<select value={form.dest} onChange={e=>set('dest',e.target.value)}><option>lan</option><option>wan</option><option value="*">任意</option></select></label>
            <label>协议<select value={form.proto} onChange={e=>set('proto',e.target.value)}><option>tcp</option><option>udp</option><option>tcpudp</option><option>icmp</option></select></label>
            <label>目标端口<input value={form.destPort} onChange={e=>set('destPort',e.target.value)} placeholder="如 80 或 8080-8090"/></label>
            <label>动作<select value={form.target} onChange={e=>set('target',e.target.value)}><option>ACCEPT</option><option>DROP</option><option>REJECT</option></select></label>
          </div>
          <div className="form-actions">
            <button className="btn-primary" onClick={addRule} disabled={saving}>{saving?'保存中...':'保存规则'}</button>
            <button className="btn-ghost" onClick={()=>setShowForm(false)}>取消</button>
          </div>
        </div>
      )}

      {/* 规则 Tab */}
      {tab==='rules' && (
        <div className="card">
          <table className="data-table">
            <thead><tr><th>名称</th><th>来源</th><th>目标</th><th>协议</th><th>端口</th><th>动作</th><th></th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={7} style={{textAlign:'center',padding:28,color:'#8b949e'}}>加载中...</td></tr>}
              {!loading && rules.length===0 && <tr><td colSpan={7} style={{textAlign:'center',padding:28,color:'#484f58'}}>暂无自定义规则</td></tr>}
              {rules.map((r,i) => (
                <tr key={r['.name']||i}>
                  <td>{r.name||r['.name']||'未命名'}</td>
                  <td><span className="badge badge-blue">{r.src||'-'}</span></td>
                  <td><span className="badge badge-purple">{r.dest||'-'}</span></td>
                  <td>{r.proto||'any'}</td>
                  <td><code>{r.dest_port||'-'}</code></td>
                  <td><span className={`badge ${(r.target||'ACCEPT')==='ACCEPT'?'badge-green':'badge-red'}`}>{r.target||'ACCEPT'}</span></td>
                  <td><button className="btn-danger-sm" onClick={()=>delRule(r['.name'])}><Trash2 size={12}/></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 区域 Tab */}
      {tab==='zones' && (
        <div className="card">
          <table className="data-table">
            <thead><tr><th>区域名</th><th>网络</th><th>入站</th><th>出站</th><th>转发</th><th>NAT</th></tr></thead>
            <tbody>
              {zones.length===0 && <tr><td colSpan={6} style={{textAlign:'center',padding:28,color:'#484f58'}}>暂无区域配置</td></tr>}
              {zones.map((z,i) => (
                <tr key={z['.name']||i}>
                  <td><strong>{z.name||z['.name']}</strong></td>
                  <td style={{fontSize:11}}>{Array.isArray(z.network)?z.network.join(', '):(z.network||'-')}</td>
                  <td><span className={`badge ${z.input==='ACCEPT'?'badge-green':'badge-red'}`}>{z.input||'-'}</span></td>
                  <td><span className={`badge ${z.output==='ACCEPT'?'badge-green':'badge-red'}`}>{z.output||'-'}</span></td>
                  <td><span className={`badge ${z.forward==='ACCEPT'?'badge-green':'badge-red'}`}>{z.forward||'-'}</span></td>
                  <td>{z.masq==='1'||z.masq===true?<span className="badge badge-blue">是</span>:'-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 端口转发 Tab */}
      {tab==='redirects' && (
        <div className="card">
          <table className="data-table">
            <thead><tr><th>名称</th><th>协议</th><th>来源端口</th><th>目标IP</th><th>目标端口</th><th>状态</th></tr></thead>
            <tbody>
              {redirects.length===0 && <tr><td colSpan={6} style={{textAlign:'center',padding:28,color:'#484f58'}}>暂无端口转发</td></tr>}
              {redirects.map((r,i) => (
                <tr key={r['.name']||i}>
                  <td>{r.name||r['.name']||'-'}</td>
                  <td>{r.proto||'tcp'}</td>
                  <td><code>{r.src_dport||'-'}</code></td>
                  <td><code>{r.dest_ip||'-'}</code></td>
                  <td><code>{r.dest_port||r.src_dport||'-'}</code></td>
                  <td>
                    {r.enabled==='0'
                      ? <span className="badge badge-red">禁用</span>
                      : <span className="badge badge-green">启用</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
export default FirewallPage

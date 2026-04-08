// FirewallPage.jsx
import React, { useEffect, useState } from 'react'
import { Shield, Plus, Trash2, RefreshCw } from 'lucide-react'

export function FirewallPage({ client }) {
  const [rules, setRules]     = useState([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name:'',src:'wan',dest:'lan',proto:'tcp',destPort:'',target:'ACCEPT' })
  const [saving, setSaving]   = useState(false)

  const fetch = async () => {
    setLoading(true)
    try {
      const res = await client.call('uci','get',{config:'firewall'})
      const vals = res.values||{}
      const map = {}
      Object.entries(vals).forEach(([k,v])=>{
        const m = k.match(/^firewall\.@rule\[(\d+)\]\.(\w+)$/)
        if(m) { if(!map[m[1]]) map[m[1]]={_idx:+m[1]}; map[m[1]][m[2]]=v }
      })
      setRules(Object.values(map).sort((a,b)=>a._idx-b._idx))
    } catch{}
    setLoading(false)
  }
  useEffect(()=>{ fetch() },[client])

  const add = async () => {
    if(!form.name) return
    setSaving(true)
    try {
      const r = await client.call('uci','add',{config:'firewall',type:'rule'})
      const values = {name:form.name,src:form.src,dest:form.dest,proto:form.proto,target:form.target}
      if(form.destPort) values.dest_port=form.destPort
      await client.call('uci','set',{config:'firewall',section:r.section,values})
      await client.call('uci','commit',{config:'firewall'})
      await client.execCommand('/etc/init.d/firewall',['reload']).catch(()=>{})
      setShowForm(false); fetch()
    } catch(e){ alert('添加失败: '+e.message) }
    setSaving(false)
  }

  const del = async (idx) => {
    if(!confirm('删除此规则？')) return
    try {
      await client.call('uci','delete',{config:'firewall',type:'rule',match:{'.index':idx}})
      await client.call('uci','commit',{config:'firewall'})
      fetch()
    } catch(e){ alert('删除失败: '+e.message) }
  }

  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  return (
    <div className="page">
      <div className="page-header">
        <h1><Shield size={18}/> 防火墙规则</h1>
        <div className="page-actions">
          <button className="btn-icon" onClick={fetch}><RefreshCw size={15} className={loading?'spin':''}/></button>
          <button className="btn-primary" onClick={()=>setShowForm(v=>!v)}><Plus size={14}/> 新增规则</button>
        </div>
      </div>
      {showForm&&(
        <div className="card form-card">
          <h3>新增防火墙规则</h3>
          <div className="form-grid">
            <label>规则名称<input value={form.name} onChange={e=>set('name',e.target.value)} placeholder="如：开放 HTTP"/></label>
            <label>来源区域<select value={form.src} onChange={e=>set('src',e.target.value)}><option value="wan">WAN</option><option value="lan">LAN</option></select></label>
            <label>目标区域<select value={form.dest} onChange={e=>set('dest',e.target.value)}><option value="lan">LAN</option><option value="wan">WAN</option></select></label>
            <label>协议<select value={form.proto} onChange={e=>set('proto',e.target.value)}><option>tcp</option><option>udp</option><option>tcpudp</option></select></label>
            <label>目标端口<input value={form.destPort} onChange={e=>set('destPort',e.target.value)} placeholder="如 80 或 8080-8090"/></label>
            <label>动作<select value={form.target} onChange={e=>set('target',e.target.value)}><option>ACCEPT</option><option>DROP</option><option>REJECT</option></select></label>
          </div>
          <div className="form-actions">
            <button className="btn-primary" onClick={add} disabled={saving}>{saving?'保存中...':'保存规则'}</button>
            <button className="btn-ghost" onClick={()=>setShowForm(false)}>取消</button>
          </div>
        </div>
      )}
      <div className="card">
        <table className="data-table">
          <thead><tr><th>名称</th><th>来源</th><th>目标</th><th>协议</th><th>端口</th><th>动作</th><th></th></tr></thead>
          <tbody>
            {rules.length===0&&<tr><td colSpan={7} style={{textAlign:'center',color:'#666',padding:28}}>暂无规则</td></tr>}
            {rules.map(r=>(
              <tr key={r._idx}>
                <td>{r.name||'未命名'}</td>
                <td><span className="badge badge-blue">{r.src||'-'}</span></td>
                <td><span className="badge badge-purple">{r.dest||'-'}</span></td>
                <td>{r.proto||'any'}</td>
                <td><code>{r.dest_port||'-'}</code></td>
                <td><span className={`badge ${(r.target||'ACCEPT')==='ACCEPT'?'badge-green':'badge-red'}`}>{r.target||'ACCEPT'}</span></td>
                <td><button className="btn-danger-sm" onClick={()=>del(r._idx)}><Trash2 size={12}/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
export default FirewallPage

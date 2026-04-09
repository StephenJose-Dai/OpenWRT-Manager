import React, { useEffect, useState, useCallback } from 'react'
import { Shield, Plus, Trash2, RefreshCw } from 'lucide-react'

export function FirewallPage({ client }) {
  const [rules,    setRules]    = useState([])
  const [loading,  setLoading]  = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form,     setForm]     = useState({
    name:'', src:'wan', dest:'lan', proto:'tcp', destPort:'', target:'ACCEPT'
  })
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  const loadRules = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await client.call('uci', 'get', { config: 'firewall' })
      const vals = res.values || {}
      const map = {}

      Object.entries(vals).forEach(([k, v]) => {
        // 格式1: "firewall.@rule[0].name"
        let m = k.match(/^firewall\.@rule\[(\d+)\]\.(\w+)$/)
        if (m) {
          if (!map[m[1]]) map[m[1]] = { _idx: +m[1] }
          map[m[1]][m[2]] = v
          return
        }
        // 格式2: 匿名 section，如 "cfg123456.name"（OpenWrt 某些版本）
        m = k.match(/^([a-f0-9]+)\.(\w+)$/)
        if (m && vals[m[1] + '..type'] === 'rule') {
          if (!map[m[1]]) map[m[1]] = { _idx: m[1] }
          map[m[1]][m[2]] = v
        }
      })

      const list = Object.values(map).sort((a, b) =>
        typeof a._idx === 'number' && typeof b._idx === 'number' ? a._idx - b._idx : 0
      )
      setRules(list)

      if (list.length === 0) {
        setError('未找到防火墙规则（当前显示 UCI rule 类型规则）')
      }
    } catch(e) {
      setError('加载失败：' + e.message)
    }
    setLoading(false)
  }, [client])

  useEffect(() => { loadRules() }, [loadRules])

  const addRule = async () => {
    if (!form.name) { alert('请填写规则名称'); return }
    setSaving(true)
    try {
      const r = await client.call('uci', 'add', { config: 'firewall', type: 'rule' })
      const values = {
        name: form.name, src: form.src, dest: form.dest,
        proto: form.proto, target: form.target
      }
      if (form.destPort) values.dest_port = form.destPort
      await client.call('uci', 'set', { config: 'firewall', section: r.section, values })
      await client.call('uci', 'commit', { config: 'firewall' })
      await client.execCommand('/etc/init.d/firewall', ['reload']).catch(() => {})
      setShowForm(false)
      loadRules()
    } catch(e) { alert('添加失败：' + e.message) }
    setSaving(false)
  }

  const delRule = async (idx) => {
    if (!confirm('删除此规则？')) return
    try {
      await client.call('uci', 'delete', { config: 'firewall', type: 'rule', match: { '.index': idx } })
      await client.call('uci', 'commit', { config: 'firewall' })
      loadRules()
    } catch(e) { alert('删除失败：' + e.message) }
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="page">
      <div className="page-header">
        <h1><Shield size={18}/> 防火墙规则</h1>
        <div className="page-actions">
          <button className="btn-icon" onClick={loadRules}>
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
          </button>
          <button className="btn-primary" onClick={() => setShowForm(v => !v)}>
            <Plus size={14}/> 新增规则
          </button>
        </div>
      </div>

      {error && (
        <div style={{background:'#1e2530',border:'1px solid #30363d',borderRadius:8,
          padding:'10px 14px',color:'#8b949e',fontSize:13,marginBottom:12}}>
          ℹ {error}
        </div>
      )}

      {showForm && (
        <div className="card form-card" style={{marginBottom:12}}>
          <h3 style={{marginBottom:14}}>新增防火墙规则</h3>
          <div className="form-grid">
            <label>规则名称
              <input value={form.name} onChange={e => set('name', e.target.value)}
                placeholder="如：开放 HTTP" />
            </label>
            <label>来源区域
              <select value={form.src} onChange={e => set('src', e.target.value)}>
                <option value="wan">WAN</option>
                <option value="lan">LAN</option>
                <option value="*">任意</option>
              </select>
            </label>
            <label>目标区域
              <select value={form.dest} onChange={e => set('dest', e.target.value)}>
                <option value="lan">LAN</option>
                <option value="wan">WAN</option>
                <option value="*">任意</option>
              </select>
            </label>
            <label>协议
              <select value={form.proto} onChange={e => set('proto', e.target.value)}>
                <option>tcp</option><option>udp</option><option>tcpudp</option><option>icmp</option>
              </select>
            </label>
            <label>目标端口
              <input value={form.destPort} onChange={e => set('destPort', e.target.value)}
                placeholder="如 80 或 8080-8090" />
            </label>
            <label>动作
              <select value={form.target} onChange={e => set('target', e.target.value)}>
                <option>ACCEPT</option><option>DROP</option><option>REJECT</option>
              </select>
            </label>
          </div>
          <div className="form-actions">
            <button className="btn-primary" onClick={addRule} disabled={saving}>
              {saving ? '保存中...' : '保存规则'}
            </button>
            <button className="btn-ghost" onClick={() => setShowForm(false)}>取消</button>
          </div>
        </div>
      )}

      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>名称</th><th>来源</th><th>目标</th>
              <th>协议</th><th>端口</th><th>动作</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} style={{textAlign:'center',padding:28,color:'#8b949e'}}>
                加载中...
              </td></tr>
            )}
            {!loading && rules.length === 0 && (
              <tr><td colSpan={7} style={{textAlign:'center',padding:28,color:'#484f58'}}>
                暂无规则
              </td></tr>
            )}
            {rules.map((r, i) => (
              <tr key={r._idx ?? i}>
                <td>{r.name || '未命名'}</td>
                <td><span className="badge badge-blue">{r.src || '-'}</span></td>
                <td><span className="badge badge-purple">{r.dest || '-'}</span></td>
                <td>{r.proto || 'any'}</td>
                <td><code>{r.dest_port || '-'}</code></td>
                <td>
                  <span className={`badge ${(r.target||'ACCEPT')==='ACCEPT' ? 'badge-green' : 'badge-red'}`}>
                    {r.target || 'ACCEPT'}
                  </span>
                </td>
                <td>
                  <button className="btn-danger-sm" onClick={() => delRule(r._idx)}>
                    <Trash2 size={12}/>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
export default FirewallPage

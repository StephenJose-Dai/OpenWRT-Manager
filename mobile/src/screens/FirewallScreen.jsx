import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Alert, TextInput, ScrollView, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAppStore } from '../store'
import { usePolling } from '../hooks/usePolling'

const C = { bg:'#0d1117', bg2:'#161b22', bg3:'#21262d', border:'#30363d', text:'#e6edf3', muted:'#8b949e', blue:'#4f8ef7', green:'#22c55e', red:'#f85149' }

export default function FirewallScreen() {
  const { client } = useAppStore()
  const [tab,       setTab]       = useState('rules')
  const [rules,     setRules]     = useState([])
  const [zones,     setZones]     = useState([])
  const [redirects, setRedirects] = useState([])
  const [showForm,  setShowForm]  = useState(false)
  const [refreshing,setRefreshing]= useState(false)
  const [saving,    setSaving]    = useState(false)
  const [form, setForm] = useState({ name:'', src:'wan', dest:'lan', proto:'tcp', destPort:'', target:'ACCEPT' })

  const fetch = async () => {
    if (!client) return
    try {
      const data = await client.getFirewallData()
      setRules(data.rules); setZones(data.zones); setRedirects(data.redirects)
    } catch {}
  }
  usePolling(fetch, 30000, [client])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const addRule = async () => {
    if (!form.name) { Alert.alert('提示', '请填写规则名称'); return }
    setSaving(true)
    try {
      const r = await client.call('uci', 'add', { config: 'firewall', type: 'rule' })
      const values = { name: form.name, src: form.src, dest: form.dest, proto: form.proto, target: form.target }
      if (form.destPort) values.dest_port = form.destPort
      await client.call('uci', 'set', { config: 'firewall', section: r.section, values })
      await client.call('uci', 'commit', { config: 'firewall' })
      await client.execCommandFull('/etc/init.d/firewall', ['reload']).catch(() => {})
      setShowForm(false); fetch(); Alert.alert('', '规则已添加')
    } catch (e) { Alert.alert('失败', e.message) }
    setSaving(false)
  }

  const deleteRule = (sec) => {
    Alert.alert('删除规则', '确定删除？', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => {
        try {
          const sectionName = sec['.name'] || sec._s
          if (sectionName) {
            await client.call('uci', 'delete', { config: 'firewall', section: sectionName })
          } else {
            await client.call('uci', 'delete', { config: 'firewall', type: 'rule', match: { '.index': sec._idx } })
          }
          await client.call('uci', 'commit', { config: 'firewall' })
          fetch()
        } catch (e) { Alert.alert('失败', e.message) }
      }}
    ])
  }

  const TABS = [
    { key:'rules',     label:`规则 (${rules.length})` },
    { key:'zones',     label:`区域 (${zones.length})` },
    { key:'redirects', label:`转发 (${redirects.length})` },
  ]

  return (
    <SafeAreaView style={s.safe}>
      {/* Tab bar */}
      <View style={s.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={[s.tab, tab===t.key && s.tabActive]} onPress={() => setTab(t.key)}>
            <Text style={[s.tabText, tab===t.key && s.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
        {tab === 'rules' && (
          <TouchableOpacity style={s.addBtn} onPress={() => setShowForm(v => !v)}>
            <Text style={s.addBtnText}>{showForm ? '取消' : '＋'}</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async()=>{setRefreshing(true);await fetch();setRefreshing(false)}} tintColor={C.blue}/>}>

        {/* 新增规则表单 */}
        {tab === 'rules' && showForm && (
          <View style={s.formCard}>
            {[['规则名称','name','如：允许HTTP'],['来源','src','wan'],['目标','dest','lan'],['协议','proto','tcp'],['目标端口','destPort','80']].map(([l,k,ph]) => (
              <View key={k} style={s.field}>
                <Text style={s.label}>{l}</Text>
                <TextInput style={s.input} placeholder={ph} placeholderTextColor={C.muted} value={form[k]} onChangeText={v=>set(k,v)} />
              </View>
            ))}
            <View style={s.field}>
              <Text style={s.label}>动作</Text>
              <View style={s.row}>
                {['ACCEPT','DROP','REJECT'].map(t => (
                  <TouchableOpacity key={t} style={[s.targetBtn, form.target===t && s.targetBtnActive]} onPress={() => set('target', t)}>
                    <Text style={[s.targetBtnText, form.target===t && s.targetBtnTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={s.formBtns}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowForm(false)}><Text style={{color:C.muted}}>取消</Text></TouchableOpacity>
              <TouchableOpacity style={[s.saveBtn, saving&&s.dim]} onPress={addRule} disabled={saving}>
                <Text style={{color:'#fff',fontWeight:'600'}}>{saving?'保存中...':'保存规则'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* 规则列表 */}
        {tab === 'rules' && (
          <>
            {rules.length === 0 && <Text style={s.empty}>暂无自定义规则</Text>}
            {rules.map((r, i) => (
              <View key={r['.name'] || i} style={s.card}>
                <View style={s.cardHeader}>
                  <Text style={s.cardName} numberOfLines={1}>{r.name || r['.name'] || '未命名'}</Text>
                  <View style={s.cardHeaderRight}>
                    <View style={[s.badge, (r.target||'ACCEPT')==='ACCEPT' ? s.badgeGreen : s.badgeRed]}>
                      <Text style={[s.badgeText, (r.target||'ACCEPT')==='ACCEPT' ? {color:'#4ade80'} : {color:'#f87171'}]}>{r.target||'ACCEPT'}</Text>
                    </View>
                    <TouchableOpacity style={s.deleteBtn} onPress={() => deleteRule(r)}>
                      <Text style={s.deleteText}>删除</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={s.cardMeta}>
                  {r.src||'any'} → {r.dest||'any'} · {r.proto||'any'}{r.dest_port ? ':'+r.dest_port : ''}
                </Text>
              </View>
            ))}
          </>
        )}

        {/* 区域列表 */}
        {tab === 'zones' && (
          <>
            {zones.length === 0 && <Text style={s.empty}>暂无区域配置</Text>}
            {zones.map((z, i) => (
              <View key={z['.name'] || i} style={s.card}>
                <Text style={s.cardName}>{z.name || z['.name'] || '未知区域'}</Text>
                <View style={s.zoneRow}>
                  {[['入站',z.input],['出站',z.output],['转发',z.forward]].map(([l,v]) => (
                    <View key={l} style={s.zoneItem}>
                      <Text style={s.zoneLabel}>{l}</Text>
                      <View style={[s.badge, v==='ACCEPT'?s.badgeGreen:s.badgeRed]}>
                        <Text style={[s.badgeText, v==='ACCEPT'?{color:'#4ade80'}:{color:'#f87171'}]}>{v||'-'}</Text>
                      </View>
                    </View>
                  ))}
                  {(z.masq==='1'||z.masq===true) && (
                    <View style={s.zoneItem}>
                      <Text style={s.zoneLabel}>NAT</Text>
                      <View style={s.badgeBlue}><Text style={[s.badgeText,{color:'#60a5fa'}]}>是</Text></View>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </>
        )}

        {/* 端口转发 */}
        {tab === 'redirects' && (
          <>
            {redirects.length === 0 && <Text style={s.empty}>暂无端口转发</Text>}
            {redirects.map((r, i) => (
              <View key={r['.name'] || i} style={s.card}>
                <Text style={s.cardName}>{r.name || r['.name'] || '未命名'}</Text>
                <Text style={s.cardMeta}>{r.proto||'tcp'} · 外部:{r.src_dport||'-'} → {r.dest_ip||'-'}:{r.dest_port||r.src_dport||'-'}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:    { flex:1, backgroundColor:C.bg },
  tabBar:  { flexDirection:'row', alignItems:'center', backgroundColor:C.bg2, borderBottomWidth:1, borderColor:C.border, paddingHorizontal:4 },
  tab:     { flex:1, paddingVertical:12, alignItems:'center' },
  tabActive:{ borderBottomWidth:2, borderColor:C.blue },
  tabText: { fontSize:12, color:C.muted },
  tabTextActive: { color:C.blue, fontWeight:'600' },
  addBtn:  { backgroundColor:C.blue, paddingHorizontal:14, paddingVertical:8, borderRadius:8, marginRight:8 },
  addBtnText: { color:'#fff', fontSize:16, fontWeight:'600' },
  content: { padding:14, paddingBottom:40 },
  formCard:{ backgroundColor:C.bg2, borderWidth:1, borderColor:C.border, borderRadius:10, padding:14, marginBottom:14 },
  field:   { marginBottom:10 },
  label:   { fontSize:12, color:C.muted, marginBottom:4 },
  input:   { backgroundColor:C.bg, borderWidth:1, borderColor:C.border, borderRadius:8, color:C.text, paddingHorizontal:10, paddingVertical:9, fontSize:14 },
  row:     { flexDirection:'row', gap:8 },
  targetBtn: { flex:1, padding:9, backgroundColor:C.bg3, borderRadius:8, alignItems:'center', borderWidth:1, borderColor:C.border },
  targetBtnActive: { backgroundColor:C.blue, borderColor:C.blue },
  targetBtnText: { fontSize:13, color:C.muted },
  targetBtnTextActive: { color:'#fff', fontWeight:'600' },
  formBtns:{ flexDirection:'row', gap:10, marginTop:8 },
  cancelBtn:{ flex:1, padding:10, backgroundColor:C.bg3, borderRadius:8, alignItems:'center', borderWidth:1, borderColor:C.border },
  saveBtn: { flex:2, padding:10, backgroundColor:C.blue, borderRadius:8, alignItems:'center' },
  empty:   { textAlign:'center', color:C.muted, marginTop:40, fontSize:14 },
  card:    { backgroundColor:C.bg2, borderWidth:1, borderColor:C.border, borderRadius:10, padding:14, marginBottom:10 },
  cardHeader: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:6 },
  cardHeaderRight: { flexDirection:'row', alignItems:'center', gap:8 },
  cardName:{ fontSize:15, fontWeight:'600', color:C.text, flex:1, marginRight:8 },
  cardMeta:{ fontSize:12, color:C.muted },
  badge:   { paddingHorizontal:9, paddingVertical:3, borderRadius:8 },
  badgeGreen: { backgroundColor:'#14532d33' },
  badgeRed:   { backgroundColor:'#7f1d1d33' },
  badgeBlue:  { backgroundColor:'#1f4a8f33', paddingHorizontal:9, paddingVertical:3, borderRadius:8 },
  badgeText:  { fontSize:11, fontWeight:'500' },
  deleteBtn:  { paddingHorizontal:8, paddingVertical:3, backgroundColor:'#2a101022', borderRadius:6, borderWidth:1, borderColor:'#f8514933' },
  deleteText: { color:C.red, fontSize:12 },
  zoneRow:    { flexDirection:'row', gap:8, flexWrap:'wrap', marginTop:8 },
  zoneItem:   { flexDirection:'row', alignItems:'center', gap:4 },
  zoneLabel:  { fontSize:12, color:C.muted },
  dim:        { opacity:0.5 },
})

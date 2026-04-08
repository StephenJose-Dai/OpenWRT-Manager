import React, { useState } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, TextInput, ScrollView, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAppStore } from '../store'
import { usePolling } from '../hooks/usePolling'

const C = { bg:'#0d1117', bg2:'#161b22', border:'#30363d', text:'#e6edf3', muted:'#8b949e', blue:'#4f8ef7', green:'#22c55e', red:'#f85149' }

export default function FirewallScreen() {
  const { client } = useAppStore()
  const [rules,    setRules]    = useState([])
  const [showForm, setShowForm] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name:'', src:'wan', dest:'lan', proto:'tcp', destPort:'', target:'ACCEPT' })

  const fetch = async () => {
    if (!client) return
    try { setRules(await client.getFirewallRules()) } catch {}
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
      await client.execCommand('/etc/init.d/firewall', ['reload']).catch(() => {})
      setShowForm(false); fetch()
      Alert.alert('', '规则已添加')
    } catch (e) { Alert.alert('失败', e.message) }
    setSaving(false)
  }

  const deleteRule = (idx) => {
    Alert.alert('删除规则', '确定删除？', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => {
        try {
          await client.call('uci', 'delete', { config: 'firewall', type: 'rule', match: { '.index': idx } })
          await client.call('uci', 'commit', { config: 'firewall' })
          fetch()
        } catch (e) { Alert.alert('失败', e.message) }
      }}
    ])
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.topBar}>
        <Text style={s.topTitle}>防火墙规则</Text>
        <TouchableOpacity style={s.addBtn} onPress={() => setShowForm(v => !v)}>
          <Text style={s.addBtnText}>{showForm ? '取消' : '＋ 新增'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async()=>{setRefreshing(true);await fetch();setRefreshing(false)}} tintColor={C.blue}/>}>

        {showForm && (
          <View style={s.formCard}>
            {[['规则名称','name','如：允许HTTP'],['来源区域','src','wan'],['目标区域','dest','lan'],['协议','proto','tcp'],['目标端口','destPort','如 80']].map(([l,k,ph]) => (
              <View key={k} style={s.field}>
                <Text style={s.label}>{l}</Text>
                <TextInput style={s.input} placeholder={ph} placeholderTextColor={C.muted} value={form[k]} onChangeText={v=>set(k,v)} />
              </View>
            ))}
            <View style={s.btns}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowForm(false)}><Text style={{color:C.muted,fontSize:14}}>取消</Text></TouchableOpacity>
              <TouchableOpacity style={[s.saveBtn, saving&&{opacity:.5}]} onPress={addRule} disabled={saving}><Text style={{color:'#fff',fontSize:14,fontWeight:'600'}}>{saving?'保存中...':'保存规则'}</Text></TouchableOpacity>
            </View>
          </View>
        )}

        {rules.length === 0 && <Text style={s.empty}>暂无防火墙规则</Text>}
        {rules.map(r => (
          <View key={r._idx} style={s.ruleCard}>
            <View style={s.ruleHeader}>
              <Text style={s.ruleName}>{r.name || '未命名'}</Text>
              <View style={[s.targetBadge, r.target==='ACCEPT'?s.badgeGreen:s.badgeRed]}>
                <Text style={[s.targetText, r.target==='ACCEPT'?{color:'#4ade80'}:{color:'#f87171'}]}>{r.target||'ACCEPT'}</Text>
              </View>
            </View>
            <Text style={s.ruleMeta}>{r.src||'?'} → {r.dest||'?'} · {r.proto||'any'}{r.dest_port?':'+r.dest_port:''}</Text>
            <TouchableOpacity style={s.deleteBtn} onPress={() => deleteRule(r._idx)}>
              <Text style={s.deleteText}>删除</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:    { flex:1, backgroundColor: C.bg },
  topBar:  { flexDirection:'row', alignItems:'center', justifyContent:'space-between', padding:14, backgroundColor:C.bg2, borderBottomWidth:1, borderColor:C.border },
  topTitle:{ fontSize:17, fontWeight:'700', color:C.text },
  addBtn:  { backgroundColor:C.blue, paddingHorizontal:16, paddingVertical:8, borderRadius:8 },
  addBtnText:{ color:'#fff', fontSize:13, fontWeight:'500' },
  content: { padding:14, paddingBottom:40 },
  formCard:{ backgroundColor:C.bg2, borderWidth:1, borderColor:C.border, borderRadius:10, padding:14, marginBottom:14 },
  field:   { marginBottom:12 },
  label:   { fontSize:12, color:C.muted, marginBottom:4 },
  input:   { backgroundColor:C.bg, borderWidth:1, borderColor:C.border, borderRadius:7, color:C.text, paddingHorizontal:10, paddingVertical:9, fontSize:14 },
  btns:    { flexDirection:'row', gap:10, marginTop:4 },
  cancelBtn:{ flex:1, padding:10, backgroundColor:'#21262d', borderRadius:8, alignItems:'center', borderWidth:1, borderColor:C.border },
  saveBtn: { flex:2, padding:10, backgroundColor:C.blue, borderRadius:8, alignItems:'center' },
  empty:   { textAlign:'center', color:C.muted, marginTop:40, fontSize:14 },
  ruleCard:{ backgroundColor:C.bg2, borderWidth:1, borderColor:C.border, borderRadius:10, padding:14, marginBottom:10, position:'relative' },
  ruleHeader:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:6 },
  ruleName:{ fontSize:15, fontWeight:'600', color:C.text, flex:1, marginRight:8 },
  targetBadge:{ paddingHorizontal:10, paddingVertical:3, borderRadius:8 },
  badgeGreen:{ backgroundColor:'#14532d33' },
  badgeRed:{ backgroundColor:'#7f1d1d33' },
  targetText:{ fontSize:12, fontWeight:'500' },
  ruleMeta:{ fontSize:12, color:C.muted },
  deleteBtn:{ position:'absolute', top:12, right:12, padding:4 },
  deleteText:{ color:C.red, fontSize:12 },
})

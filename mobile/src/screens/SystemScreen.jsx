import React, { useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, TextInput, Switch, RefreshControl
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAppStore } from '../store'
import { usePolling } from '../hooks/usePolling'

const C = { bg:'#0d1117', bg2:'#161b22', border:'#30363d', text:'#e6edf3', muted:'#8b949e', blue:'#4f8ef7', green:'#22c55e', red:'#f85149', yellow:'#f59e0b' }

export default function SystemScreen() {
  const { client, sysInfo, setSysInfo } = useAppStore()
  const [tab, setTab]           = useState('info')    // info | wifi | log
  const [log, setLog]           = useState([])
  const [wifi, setWifi]         = useState([])
  const [wifiIface, setWifiIface] = useState('')
  const [wifiPwd, setWifiPwd]   = useState('')
  const [showPwd, setShowPwd]   = useState(false)
  const [wifiMsg, setWifiMsg]   = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const fetchInfo = async () => {
    if (!client) return
    try { setSysInfo(await client.getSystemInfo()) } catch {}
  }
  usePolling(fetchInfo, 30000, [client])

  const loadLog = async () => {
    try { setLog(await client.getLog()) } catch {}
  }

  const loadWifi = async () => {
    try {
      const res  = await client.call('uci', 'get', { config: 'wireless' })
      const vals = res.values || {}
      const map  = {}
      Object.entries(vals).forEach(([k, v]) => {
        const p = k.split('.')
        if (p.length === 3 && p[0] === 'wireless') {
          if (!map[p[1]]) map[p[1]] = { _s: p[1] }
          map[p[1]][p[2]] = v
        }
      })
      const nets = Object.values(map).filter(n => n.ssid || n.mode === 'ap')
      setWifi(nets)
      if (nets[0]) setWifiIface(nets[0]._s)
    } catch {}
  }

  const switchTab = (t) => {
    setTab(t)
    if (t === 'log'  && log.length === 0)   loadLog()
    if (t === 'wifi' && wifi.length === 0)  loadWifi()
  }

  const saveWifiPwd = async () => {
    if (wifiPwd.length < 8) { Alert.alert('提示', 'WiFi 密码至少 8 位'); return }
    try {
      await client.call('uci', 'set', { config: 'wireless', section: wifiIface, values: { key: wifiPwd } })
      await client.call('uci', 'commit', { config: 'wireless' })
      await client.execCommand('wifi').catch(() => {})
      setWifiMsg('✅ 密码已更新，设备需重新连接')
      setWifiPwd('')
    } catch (e) { setWifiMsg('❌ ' + e.message) }
  }

  const reboot = () => Alert.alert('重启路由器', `确定重启 ${sysInfo?.hostname || '路由器'}？`, [
    { text: '取消', style: 'cancel' },
    { text: '重启', style: 'destructive', onPress: () => client?.reboot().catch(e => Alert.alert('', e.message)) }
  ])

  const checkUpgrade = async () => {
    Alert.alert('检查更新', '正在检查...')
    try {
      const r = await client.execCommand('opkg', ['list-upgradable'])
      const out = r.stdout?.trim()
      Alert.alert('软件升级', out || '当前已是最新版本')
    } catch (e) { Alert.alert('失败', e.message) }
  }

  return (
    <SafeAreaView style={s.safe}>
      {/* Tabs */}
      <View style={s.tabs}>
        {[['info','系统信息'], ['wifi','WiFi 设置'], ['log','系统日志']].map(([k,l]) => (
          <TouchableOpacity key={k} style={[s.tab, tab===k&&s.tabActive]} onPress={() => switchTab(k)}>
            <Text style={[s.tabText, tab===k&&s.tabTextActive]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async()=>{setRefreshing(true);await fetchInfo();setRefreshing(false)}} tintColor={C.blue}/>}>

        {/* ─ System Info ─ */}
        {tab === 'info' && (
          <>
            <View style={s.card}>
              {[['主机名',sysInfo?.hostname],['型号',sysInfo?.model],['系统版本',sysInfo?.release],
                ['内核',sysInfo?.kernel],['运行时间',sysInfo?.uptimeFmt],
                ['CPU 负载',sysInfo?.load?.join(' / ')],
                ['内存使用',sysInfo ? `${sysInfo.memory.usagePct}%` : '--'],
              ].map(([l,v]) => (
                <View key={l} style={s.row}>
                  <Text style={s.rowLabel}>{l}</Text>
                  <Text style={s.rowVal} numberOfLines={1}>{v || '--'}</Text>
                </View>
              ))}
            </View>

            {/* Memory bar */}
            {sysInfo && (
              <View style={s.card}>
                <Text style={s.cardTitle}>内存使用 {sysInfo.memory.usagePct}%</Text>
                <View style={s.progressBg}>
                  <View style={[s.progressFill, {
                    width: `${sysInfo.memory.usagePct}%`,
                    backgroundColor: sysInfo.memory.usagePct > 80 ? C.red : sysInfo.memory.usagePct > 60 ? C.yellow : C.green
                  }]} />
                </View>
              </View>
            )}

            {/* Actions */}
            <View style={s.card}>
              <TouchableOpacity style={s.actionRow} onPress={reboot}>
                <Text style={s.actionLabel}>⟳  重启路由器</Text>
                <Text style={[s.actionDesc, {color:C.red}]}>重新启动，约需 1-2 分钟</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.actionRow, {borderTopWidth:1,borderColor:C.border}]} onPress={checkUpgrade}>
                <Text style={s.actionLabel}>↑  检查软件升级</Text>
                <Text style={s.actionDesc}>检查 opkg 可更新的软件包</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.actionRow, {borderTopWidth:1,borderColor:C.border}]} onPress={fetchInfo}>
                <Text style={s.actionLabel}>↻  刷新信息</Text>
                <Text style={s.actionDesc}>重新获取系统状态</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ─ WiFi ─ */}
        {tab === 'wifi' && (
          <>
            {/* WiFi network list */}
            {wifi.map(n => (
              <TouchableOpacity key={n._s} style={[s.wifiItem, wifiIface===n._s&&s.wifiItemActive]} onPress={() => setWifiIface(n._s)}>
                <Text style={s.wifiSsid}>{n.ssid || '（隐藏网络）'}</Text>
                <Text style={s.wifiSec}>{n._s}</Text>
                {wifiIface === n._s && <Text style={s.wifiCheck}>✓</Text>}
              </TouchableOpacity>
            ))}

            {wifi.length === 0 && <Text style={s.empty}>未检测到 WiFi 接口</Text>}

            {wifi.length > 0 && (
              <View style={s.card}>
                <Text style={s.cardTitle}>修改 WiFi 密码（至少 8 位）</Text>
                <View style={s.pwdRow}>
                  <TextInput style={[s.input, {flex:1}]} placeholder="输入新的 WiFi 密码" placeholderTextColor={C.muted}
                    value={wifiPwd} onChangeText={setWifiPwd} secureTextEntry={!showPwd} />
                  <TouchableOpacity style={s.showBtn} onPress={() => setShowPwd(v => !v)}>
                    <Text style={s.showBtnText}>{showPwd ? '隐藏' : '显示'}</Text>
                  </TouchableOpacity>
                </View>
                {wifiMsg !== '' && <Text style={s.wifiMsg}>{wifiMsg}</Text>}
                <TouchableOpacity style={s.saveBtn} onPress={saveWifiPwd}>
                  <Text style={s.saveBtnText}>更新密码</Text>
                </TouchableOpacity>
                <Text style={s.warnText}>⚠ 修改后所有设备将断开 WiFi 连接</Text>
              </View>
            )}
          </>
        )}

        {/* ─ Log ─ */}
        {tab === 'log' && (
          <>
            <TouchableOpacity style={s.refreshLogBtn} onPress={loadLog}>
              <Text style={s.refreshLogText}>↻  刷新日志</Text>
            </TouchableOpacity>
            <View style={s.logViewer}>
              {log.length === 0
                ? <Text style={s.logLine}>加载中...</Text>
                : log.slice(-100).map((l, i) => (
                    <Text key={i} style={[s.logLine,
                      l.includes('err') || l.includes('ERR') ? s.logErr :
                      l.includes('warn') || l.includes('WARN') ? s.logWarn : null
                    ]} numberOfLines={3}>{l}</Text>
                  ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:    { flex:1, backgroundColor: C.bg },
  tabs:    { flexDirection:'row', backgroundColor:C.bg2, borderBottomWidth:1, borderColor:C.border },
  tab:     { flex:1, paddingVertical:12, alignItems:'center' },
  tabActive:{ borderBottomWidth:2, borderColor:C.blue },
  tabText: { fontSize:13, color:C.muted },
  tabTextActive: { color:C.blue, fontWeight:'600' },
  content: { padding:14, paddingBottom:50 },

  card:    { backgroundColor:C.bg2, borderWidth:1, borderColor:C.border, borderRadius:10, padding:14, marginBottom:12 },
  cardTitle:{ fontSize:12, color:C.muted, fontWeight:'600', textTransform:'uppercase', letterSpacing:1, marginBottom:10 },
  row:     { flexDirection:'row', alignItems:'center', paddingVertical:8, borderBottomWidth:1, borderColor:'#21262d' },
  rowLabel:{ width:90, fontSize:13, color:C.muted },
  rowVal:  { flex:1, fontSize:13, color:C.text },

  progressBg:   { height:8, backgroundColor:'#21262d', borderRadius:4, overflow:'hidden' },
  progressFill: { height:'100%', borderRadius:4 },

  actionRow:  { paddingVertical:12 },
  actionLabel:{ fontSize:15, color:C.text, marginBottom:2 },
  actionDesc: { fontSize:12, color:C.muted },

  wifiItem:   { backgroundColor:C.bg2, borderWidth:1, borderColor:C.border, borderRadius:10, padding:14, marginBottom:8, flexDirection:'row', alignItems:'center' },
  wifiItemActive: { borderColor:C.blue, backgroundColor:'#1f4a8f22' },
  wifiSsid:   { flex:1, fontSize:15, fontWeight:'500', color:C.text },
  wifiSec:    { fontSize:12, color:C.muted },
  wifiCheck:  { color:C.blue, fontWeight:'700', fontSize:16, marginLeft:8 },

  input:    { backgroundColor:C.bg, borderWidth:1, borderColor:C.border, borderRadius:8, color:C.text, paddingHorizontal:12, paddingVertical:10, fontSize:14 },
  pwdRow:   { flexDirection:'row', alignItems:'center', gap:8, marginBottom:10 },
  showBtn:  { paddingHorizontal:10 },
  showBtnText: { fontSize:13, color:C.blue },
  wifiMsg:  { fontSize:13, marginBottom:10 },
  saveBtn:  { backgroundColor:C.blue, borderRadius:8, padding:12, alignItems:'center', marginBottom:10 },
  saveBtnText: { color:'#fff', fontSize:14, fontWeight:'600' },
  warnText: { fontSize:12, color:C.yellow },

  empty:     { textAlign:'center', color:C.muted, marginTop:40, fontSize:14 },
  refreshLogBtn: { backgroundColor:C.bg2, borderWidth:1, borderColor:C.border, borderRadius:8, padding:10, alignItems:'center', marginBottom:10 },
  refreshLogText: { fontSize:13, color:C.muted },
  logViewer: { backgroundColor:'#0a0e14', borderRadius:8, borderWidth:1, borderColor:C.border, padding:10 },
  logLine:   { fontSize:11, color:'#7ee787', fontFamily:'monospace', marginBottom:2, lineHeight:16 },
  logErr:    { color:C.red },
  logWarn:   { color:C.yellow },
})

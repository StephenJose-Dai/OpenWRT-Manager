// DashboardScreen.jsx
import React, { useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAppStore } from '../store'
import { usePolling } from '../hooks/usePolling'
import { routerManager, OpenWrtClient } from '../services/openwrt'

const C = { bg:'#0d1117', bg2:'#161b22', bg3:'#21262d', border:'#30363d', text:'#e6edf3', muted:'#8b949e', blue:'#4f8ef7', green:'#22c55e', red:'#f85149', yellow:'#f59e0b' }

export default function DashboardScreen({ navigation }) {
  const { client, config, online, sysInfo, interfaces, setSysInfo, setInterfaces, setOnline, disconnect } = useAppStore()
  const [refreshing, setRefreshing] = useState(false)
  const [showSwitcher, setShowSwitcher] = useState(false)
  const [routers, setRouters] = useState([])

  const fetchAll = async () => {
    if (!client) return
    try {
      const [info, ifaces] = await Promise.all([client.getSystemInfo(), client.getNetworkInterfaces()])
      setSysInfo(info); setInterfaces(ifaces); setOnline(true)
    } catch { setOnline(false) }
  }

  usePolling(fetchAll, 15000, [client])

  const onRefresh = async () => { setRefreshing(true); await fetchAll(); setRefreshing(false) }

  const openSwitcher = async () => {
    await routerManager.load()
    setRouters(routerManager.list())
    setShowSwitcher(true)
  }

  const switchRouter = async (id) => {
    const cfg = routerManager.get(id)
    if (!cfg) return
    setShowSwitcher(false)
    try {
      const newClient = new OpenWrtClient({
        ...cfg,
        https:     cfg.https || false,
        ignoreSSL: cfg.ignoreSSL !== undefined ? cfg.ignoreSSL : (cfg.https || false)
      })
      await newClient.login()
      newClient.checkACL().then(ok => { if (!ok) newClient.setupACL().catch(() => {}) })
      useAppStore.getState().setConnection(newClient, cfg)
    } catch (e) { Alert.alert('切换失败', e.message) }
  }

  const reboot = () => Alert.alert('重启路由器', `确定重启 ${sysInfo?.hostname || '路由器'}？`, [
    { text: '取消', style: 'cancel' },
    { text: '重启', style: 'destructive', onPress: () => client?.reboot().catch(e => Alert.alert('', e.message)) }
  ])

  const wan = interfaces.find(i => i.name === 'wan')

  return (
    <SafeAreaView style={s.safe}>
      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.switcherBtn} onPress={openSwitcher}>
          <View style={[s.dot, { backgroundColor: online ? C.green : C.red }]} />
          <Text style={s.switcherLabel}>{config?.label || config?.host || '路由器'}</Text>
          <Text style={s.chevron}>▾</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={s.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.blue}/>}>
        {!online && <View style={s.offlineBanner}><Text style={s.offlineText}>路由器离线，下拉刷新重试</Text></View>}

        {/* System info card */}
        {sysInfo && (
          <View style={s.card}>
            {[['型号', sysInfo.model], ['系统版本', sysInfo.release], ['运行时间', sysInfo.uptimeFmt], ['CPU 负载', sysInfo.load?.join(' / ')], ['内存', `${sysInfo.memory?.usagePct}%`]].map(([l,v]) => (
              <View key={l} style={s.infoRow}>
                <Text style={s.infoLabel}>{l}</Text>
                <Text style={s.infoVal}>{v || '--'}</Text>
              </View>
            ))}
          </View>
        )}

        {/* WAN interface */}
        {wan && (
          <View style={s.card}>
            <Text style={s.cardTitle}>WAN 接口</Text>
            <View style={s.infoRow}><Text style={s.infoLabel}>IP</Text><Text style={s.infoVal}>{wan.ip || '--'}</Text></View>
            <View style={s.infoRow}><Text style={s.infoLabel}>累计下载</Text><Text style={[s.infoVal, {color:C.blue}]}>{(wan.rxBytes/1048576).toFixed(1)} MB</Text></View>
            <View style={s.infoRow}><Text style={s.infoLabel}>累计上传</Text><Text style={[s.infoVal, {color:C.green}]}>{(wan.txBytes/1048576).toFixed(1)} MB</Text></View>
          </View>
        )}

        {/* Quick actions */}
        <View style={s.grid}>
          {[
            { label:'重启路由器', onPress: reboot, danger: true },
            { label:'断开连接',   onPress: () => { disconnect(); navigation.replace('Index') }, danger: false },
          ].map(a => (
            <TouchableOpacity key={a.label} style={[s.actionBtn, a.danger && s.actionDanger]} onPress={a.onPress}>
              <Text style={[s.actionText, a.danger && s.actionTextDanger]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Router switcher modal */}
      {showSwitcher && (
        <TouchableOpacity style={s.overlay} onPress={() => setShowSwitcher(false)}>
          <View style={s.switcherModal}>
            <Text style={s.switcherTitle}>切换路由器</Text>
            {routers.map(r => (
              <TouchableOpacity key={r.id} style={[s.switcherItem, r.id === config?.id && s.switcherActive]} onPress={() => switchRouter(r.id)}>
                <Text style={s.switcherItemLabel}>{r.label || r.host}</Text>
                <Text style={s.switcherItemHost}>{r.host}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.switcherAdd} onPress={() => { setShowSwitcher(false); navigation.navigate('Add') }}>
              <Text style={{ color: C.blue, fontSize: 14 }}>＋ 添加路由器</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  scroll:  { flex: 1, padding: 16 },
  topBar:  { flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: C.bg2, borderBottomWidth: 1, borderColor: C.border },
  switcherBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  switcherLabel: { fontSize: 15, fontWeight: '600', color: C.text },
  chevron: { color: C.muted, fontSize: 12 },
  dot:     { width: 8, height: 8, borderRadius: 4 },
  offlineBanner: { backgroundColor: '#2a1010', borderRadius: 8, padding: 12, marginBottom: 12, alignItems: 'center' },
  offlineText:   { color: C.red, fontSize: 13 },
  card:     { backgroundColor: C.bg2, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 14, marginBottom: 12 },
  cardTitle:{ fontSize: 12, fontWeight: '600', color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  infoRow:  { flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 1, borderColor: '#21262d' },
  infoLabel:{ width: 90, fontSize: 13, color: C.muted },
  infoVal:  { flex: 1, fontSize: 13, color: C.text },
  grid:     { flexDirection: 'row', gap: 10, marginBottom: 20 },
  actionBtn:{ flex: 1, backgroundColor: C.bg2, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 14, alignItems: 'center' },
  actionDanger: { borderColor: '#7f1d1d55', backgroundColor: '#2a101022' },
  actionText: { fontSize: 13, color: C.text },
  actionTextDanger: { color: C.red },
  overlay:  { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,.5)', justifyContent: 'flex-start' },
  switcherModal: { backgroundColor: C.bg2, borderBottomWidth: 1, borderColor: C.border, paddingBottom: 8 },
  switcherTitle: { fontSize: 13, color: C.muted, padding: 14, borderBottomWidth: 1, borderColor: C.border },
  switcherItem:  { padding: 14, borderBottomWidth: 1, borderColor: C.border },
  switcherActive:{ backgroundColor: '#1f4a8f22' },
  switcherItemLabel: { fontSize: 15, fontWeight: '500', color: C.text },
  switcherItemHost:  { fontSize: 12, color: C.muted, marginTop: 2 },
  switcherAdd: { padding: 14 },
})

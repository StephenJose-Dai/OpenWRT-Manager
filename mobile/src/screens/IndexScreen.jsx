import React, { useEffect, useState, useCallback } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView, Modal, TextInput, Switch } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { routerManager, scanLAN, OpenWrtClient } from '../services/openwrt'
import { useTablet } from '../hooks/useTablet'
import { useAppStore } from '../store'

const C = { bg:'#0d1117', bg2:'#161b22', bg3:'#21262d', border:'#30363d', text:'#e6edf3', muted:'#8b949e', blue:'#4f8ef7', green:'#22c55e', red:'#f85149', yellow:'#f59e0b' }

export default function IndexScreen({ navigation }) {
  const [routers,    setRouters]    = useState([])
  const [found,      setFound]      = useState([])
  const [scanning,   setScanning]   = useState(false)
  const [loading,    setLoading]    = useState(null)
  const [quickConn,  setQuickConn]  = useState(null)
  const { isTablet, width } = useTablet() // { host, port, https, isOpenWrt }
  const [qcPwd,      setQcPwd]      = useState('')
  const [qcProto,    setQcProto]    = useState('http')
  const [qcPort,     setQcPort]     = useState('80')
  const [qcSSL,      setQcSSL]      = useState(false)
  const [qcLoading,  setQcLoading]  = useState(false)
  const [qcError,    setQcError]    = useState('')
  const setConnection = useAppStore(s => s.setConnection)

  // useFocusEffect 确保每次回到此页面都重新加载路由器列表
  useFocusEffect(useCallback(() => {
    routerManager.load().then(() => {
      const list = routerManager.list()
      setRouters(list)
      // 自动登录（仅第一次）
      if (list.length > 0 && routers.length === 0) {
        const auto = list.find(r => r.autoLogin && r.rememberPassword && r.password)
        if (auto) connect(auto)
      }
    })
  }, []))

  const connect = useCallback(async (router) => {
    setLoading(router.id || 'new')
    try {
      const client = new OpenWrtClient(router)
      await client.login()
      // 自动配置 ACL（静默）
      client.checkACL().then(ok => { if (!ok) client.setupACL().catch(() => {}) })
      setConnection(client, router)
      navigation.replace('Main')
    } catch (e) {
      Alert.alert('连接失败', e.message)
      setLoading(null)
    }
  }, [navigation, setConnection])

  const handleRouterPress = (router) => {
    if (router.rememberPassword && router.password) {
      connect(router)
    } else {
      setPwdInput('')
      setPwdModal(router)
    }
  }

  const handleDelete = (id) => {
    Alert.alert('删除路由器', '确定删除？', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => {
        await routerManager.remove(id); setRouters(routerManager.list())
      }}
    ])
  }

  const startScan = async () => {
    setScanning(true); setFound([])
    await scanLAN(item => setFound(f => [...f, item]), 2000)
    setScanning(false)
  }

  const openQuickConn = (item) => {
    const isHttps = item.https || false
    setQcProto(isHttps ? 'https' : 'http')
    setQcPort(String(item.port || (isHttps ? 443 : 80)))
    setQcSSL(isHttps)
    setQcPwd(''); setQcError('')
    setQuickConn(item)
  }

  const doQuickConn = async () => {
    if (!qcPwd) { setQcError('请输入密码'); return }
    setQcLoading(true); setQcError('')
    try {
      const cfg = { host: quickConn.host, port: +qcPort, https: qcProto === 'https', ignoreSSL: qcSSL, username: 'root', password: qcPwd }
      const client = new OpenWrtClient(cfg)
      await client.login()
      client.checkACL().then(ok => { if (!ok) client.setupACL().catch(() => {}) })
      setQuickConn(null)
      setConnection(client, cfg)
      navigation.replace('Main')
    } catch (e) { setQcError(e.message) }
    setQcLoading(false)
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.header}>
          <Text style={s.title}>OpenWrt Manager</Text>
          <Text style={s.subtitle}>路由器管理工具</Text>
        </View>

        {/* 已保存的路由器 */}
        {routers.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>已保存的路由器</Text>
            <View style={isTablet ? {flexDirection:'row',flexWrap:'wrap',gap:10} : null}>
            {routers.map(r => (
              <TouchableOpacity key={r.id} style={isTablet ? {width:'48%'} : null} style={[s.card, loading===r.id && s.cardActive]}
                onPress={() => handleRouterPress(r)} onLongPress={() => handleDelete(r.id)}>
                <View style={s.cardIcon}><Text style={s.cardIconText}>⊞</Text></View>
                <View style={s.cardBody}>
                  <Text style={s.cardLabel}>{r.label || r.host}</Text>
                  <Text style={s.cardHost}>{r.https ? 'https' : 'http'}://{r.host}{((r.https&&r.port===443)||(r.port===80&&!r.https)) ? '' : ':'+r.port}</Text>
                  <View style={s.tags}>
                    <Text style={s.tag}>{r.username}</Text>
                    {r.https      && <Text style={[s.tag, s.tagYellow]}>HTTPS</Text>}
                    {r.autoLogin  && <Text style={[s.tag, s.tagGreen]}>自动登录</Text>}
                    {r.rememberPassword && <Text style={[s.tag, s.tagBlue]}>记住密码</Text>}
                  </View>
                </View>
                {loading===r.id ? <ActivityIndicator color={C.blue}/> : <Text style={s.arrow}>→</Text>}
              </TouchableOpacity>
            ))}
            </View>
            <TouchableOpacity style={s.addMore} onPress={() => navigation.navigate('Add')}>
              <Text style={s.addMoreText}>＋ 添加路由器</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 局域网扫描 */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>局域网自动发现</Text>
            <TouchableOpacity style={[s.scanBtn, scanning && s.dim]} onPress={startScan} disabled={scanning}>
              <Text style={s.scanBtnText}>{scanning ? '扫描中...' : '开始扫描'}</Text>
            </TouchableOpacity>
          </View>
          {scanning && (
            <View style={s.scanAnim}>
              <ActivityIndicator color={C.blue} size="large" />
              <Text style={s.scanText}>正在探测局域网（HTTP/HTTPS）...</Text>
            </View>
          )}
          {found.map(item => (
            <TouchableOpacity key={item.host+item.port} style={s.foundCard} onPress={() => openQuickConn(item)}>
              <View style={[s.foundDot, {backgroundColor: item.isOpenWrt ? C.green : C.yellow}]} />
              <View style={s.foundBody}>
                <Text style={s.foundHost}>{item.host}</Text>
                <Text style={s.foundSub}>
                  {item.isOpenWrt ? '✓ OpenWrt 路由器' : '响应设备'} · {item.https ? 'HTTPS' : 'HTTP'}:{item.port}
                </Text>
              </View>
              <Text style={[s.arrow, {color:C.green}]}>连接</Text>
            </TouchableOpacity>
          ))}
          {!scanning && found.length === 0 && routers.length === 0 && (
            <View style={s.empty}>
              <Text style={s.emptyText}>点击「开始扫描」发现局域网路由器</Text>
              <Text style={s.emptyText}>支持 HTTP 和 HTTPS</Text>
            </View>
          )}
        </View>

        {routers.length === 0 && (
          <TouchableOpacity style={s.manualBtn} onPress={() => navigation.navigate('Add')}>
            <Text style={s.manualBtnText}>手动添加路由器</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* 密码输入弹窗（替代 iOS 专用的 Alert.prompt）*/}
      <Modal visible={!!pwdModal} transparent animationType="fade" onRequestClose={() => setPwdModal(null)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setPwdModal(null)}>
          <TouchableOpacity activeOpacity={1} style={s.modal} onPress={() => {}}>
            <Text style={s.modalTitle}>输入密码</Text>
            <View style={[s.modalHostBar, {marginBottom:12}]}>
              <Text style={[s.modalHost, {color:C.muted}]}>{pwdModal?.label || pwdModal?.host}</Text>
            </View>
            <TextInput
              style={[s.input, {marginBottom:14}]}
              placeholder="路由器密码"
              placeholderTextColor={C.muted}
              value={pwdInput}
              onChangeText={setPwdInput}
              secureTextEntry
              autoFocus
            />
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setPwdModal(null)}>
                <Text style={{color:C.muted,fontSize:14}}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.connectBtn} onPress={() => {
                const r = pwdModal
                setPwdModal(null)
                connect({ ...r, password: pwdInput })
              }}>
                <Text style={{color:'#fff',fontSize:14,fontWeight:'600'}}>连接</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* 快速连接弹窗 */}
      <Modal visible={!!quickConn} transparent animationType="fade" onRequestClose={() => setQuickConn(null)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setQuickConn(null)}>
          <TouchableOpacity activeOpacity={1} style={s.modal} onPress={() => {}}>
            <Text style={s.modalTitle}>连接路由器</Text>
            <View style={s.modalHostBar}>
              <Text style={s.modalHost}>{qcProto}://{quickConn?.host}</Text>
            </View>
            {qcError !== '' && <Text style={s.modalErr}>{qcError}</Text>}

            {/* 协议 + 端口 */}
            <View style={[s.row, {marginBottom:10}]}>
              <View style={s.protoSwitch}>
                {['http','https'].map(p => (
                  <TouchableOpacity key={p} style={[s.protoBtn, qcProto===p && s.protoBtnActive]}
                    onPress={() => { setQcProto(p); setQcPort(p==='https'?'443':'80'); setQcSSL(p==='https') }}>
                    <Text style={[s.protoBtnText, qcProto===p && s.protoBtnTextActive]}>{p.toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput style={[s.input, {width:72}]} placeholder="端口" placeholderTextColor={C.muted}
                value={qcPort} onChangeText={setQcPort} keyboardType="number-pad" />
            </View>

            {/* SSL */}
            {qcProto === 'https' && (
              <View style={[s.sslCard, {marginBottom:10}]}>
                <Text style={[s.sslTitle, {flex:1}]}>忽略 SSL 证书错误</Text>
                <Switch value={qcSSL} onValueChange={setQcSSL} trackColor={{ true: C.yellow }} thumbColor="#fff" />
              </View>
            )}

            {/* 密码 */}
            <TextInput style={[s.input, {marginBottom:14}]} placeholder="root 密码" placeholderTextColor={C.muted}
              value={qcPwd} onChangeText={setQcPwd} secureTextEntry autoFocus />

            <View style={s.modalBtns}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setQuickConn(null)}>
                <Text style={{color:C.muted,fontSize:14}}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.connectBtn, qcLoading && s.dim]} onPress={doQuickConn} disabled={qcLoading}>
                <Text style={{color:'#fff',fontSize:14,fontWeight:'600'}}>{qcLoading ? '连接中...' : '连接'}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:    { flex:1, backgroundColor:C.bg },
  content: { padding:20, paddingBottom:60 },
  header:  { marginBottom:28 },
  title:   { fontSize:26, fontWeight:'700', color:C.text },
  subtitle:{ fontSize:13, color:C.muted, marginTop:2 },
  section: { marginBottom:24 },
  sectionTitle: { fontSize:11, fontWeight:'600', color:C.muted, textTransform:'uppercase', letterSpacing:1, marginBottom:10 },
  sectionHeader:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:10 },
  card:      { backgroundColor:C.bg2, borderWidth:1, borderColor:C.border, borderRadius:10, flexDirection:'row', alignItems:'center', gap:12, padding:14, marginBottom:8 },
  cardActive:{ borderColor:C.blue },
  cardIcon:  { width:40, height:40, borderRadius:9, backgroundColor:'#1f4a8f33', alignItems:'center', justifyContent:'center' },
  cardIconText: { fontSize:20, color:C.blue },
  cardBody:  { flex:1 },
  cardLabel: { fontSize:15, fontWeight:'600', color:C.text },
  cardHost:  { fontSize:11, color:C.muted, marginTop:2, fontFamily:'monospace' },
  tags:      { flexDirection:'row', gap:5, marginTop:5, flexWrap:'wrap' },
  tag:       { fontSize:11, color:C.muted, backgroundColor:C.bg3, paddingHorizontal:7, paddingVertical:2, borderRadius:8 },
  tagBlue:   { color:'#60a5fa', backgroundColor:'#1f4a8f33' },
  tagGreen:  { color:'#4ade80', backgroundColor:'#14532d33' },
  tagYellow: { color:'#fbbf24', backgroundColor:'#78350f33' },
  arrow:     { color:C.muted, fontSize:16 },
  addMore:   { borderWidth:1, borderStyle:'dashed', borderColor:C.border, borderRadius:10, padding:12, alignItems:'center' },
  addMoreText: { color:C.muted, fontSize:13 },
  scanBtn:   { backgroundColor:C.bg3, borderWidth:1, borderColor:C.border, borderRadius:8, paddingHorizontal:14, paddingVertical:7 },
  scanBtnText:{ color:C.text, fontSize:13 },
  scanAnim:  { backgroundColor:C.bg2, borderWidth:1, borderColor:C.border, borderRadius:10, padding:24, alignItems:'center', gap:10, marginBottom:8 },
  scanText:  { color:C.muted, fontSize:13 },
  foundCard: { backgroundColor:'#0e2a1e', borderWidth:1, borderColor:'#1a4a30', borderRadius:10, flexDirection:'row', alignItems:'center', gap:12, padding:14, marginBottom:8 },
  foundDot:  { width:10, height:10, borderRadius:5 },
  foundBody: { flex:1 },
  foundHost: { fontSize:15, fontWeight:'600', color:C.text },
  foundSub:  { fontSize:12, color:C.muted, marginTop:2 },
  empty:     { padding:24, alignItems:'center', gap:6, borderWidth:1, borderStyle:'dashed', borderColor:C.border, borderRadius:10 },
  emptyText: { fontSize:13, color:C.muted },
  manualBtn: { backgroundColor:C.blue, borderRadius:12, padding:16, alignItems:'center', marginTop:8 },
  manualBtnText: { color:'#fff', fontSize:16, fontWeight:'600' },
  dim:       { opacity:0.5 },
  row:       { flexDirection:'row', gap:8, alignItems:'center' },
  input:     { backgroundColor:C.bg2, borderWidth:1, borderColor:C.border, borderRadius:8, color:C.text, paddingHorizontal:12, paddingVertical:10, fontSize:14 },
  protoSwitch: { flexDirection:'row', backgroundColor:C.bg3, borderRadius:8, borderWidth:1, borderColor:C.border, overflow:'hidden' },
  protoBtn:    { paddingHorizontal:12, paddingVertical:10 },
  protoBtnActive: { backgroundColor:C.blue },
  protoBtnText:   { fontSize:12, color:C.muted, fontWeight:'600' },
  protoBtnTextActive: { color:'#fff' },
  sslCard:   { backgroundColor:'#1a2332', borderWidth:1, borderColor:'#2d3748', borderRadius:8, padding:12, flexDirection:'row', alignItems:'center' },
  sslTitle:  { fontSize:13, color:C.text },
  overlay:   { flex:1, backgroundColor:'rgba(0,0,0,.6)', justifyContent:'center', alignItems:'center', padding:20 },
  modal:     { backgroundColor:C.bg2, borderRadius:14, padding:20, width:'100%', borderWidth:1, borderColor:C.border },
  modalTitle:{ fontSize:18, fontWeight:'700', color:C.text, marginBottom:12 },
  modalHostBar: { backgroundColor:'#0e2a1e', borderRadius:8, padding:10, marginBottom:12 },
  modalHost: { fontSize:13, color:C.green, fontFamily:'monospace' },
  modalErr:  { fontSize:13, color:C.red, marginBottom:10 },
  modalBtns: { flexDirection:'row', gap:10, marginTop:4 },
  cancelBtn: { flex:1, padding:12, backgroundColor:C.bg3, borderRadius:8, alignItems:'center', borderWidth:1, borderColor:C.border },
  connectBtn:{ flex:2, padding:12, backgroundColor:C.blue, borderRadius:8, alignItems:'center' },
})

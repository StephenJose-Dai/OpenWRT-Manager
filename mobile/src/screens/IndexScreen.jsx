import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, ScrollView, RefreshControl
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { routerManager, scanLAN, OpenWrtClient } from '../services/openwrt'
import { useAppStore } from '../store'

const C = {
  bg: '#0d1117', bg2: '#161b22', border: '#30363d',
  text: '#e6edf3', muted: '#8b949e', blue: '#4f8ef7',
  green: '#22c55e', red: '#f85149'
}

export default function IndexScreen({ navigation }) {
  const [routers,  setRouters]  = useState([])
  const [found,    setFound]    = useState([])
  const [scanning, setScanning] = useState(false)
  const [loading,  setLoading]  = useState(null)   // router id being connected
  const setConnection = useAppStore(s => s.setConnection)

  useEffect(() => {
    routerManager.load().then(() => {
      const list = routerManager.list()
      setRouters(list)
      const auto = list.find(r => r.autoLogin && r.rememberPassword)
      if (auto) connect(auto)
    })
  }, [])

  const connect = useCallback(async (router) => {
    setLoading(router.id || 'new')
    try {
      const client = new OpenWrtClient(router)
      await client.login()
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
      Alert.prompt(
        `连接 ${router.label || router.host}`,
        '请输入密码',
        [
          { text: '取消', style: 'cancel' },
          { text: '连接', onPress: (pwd) => connect({ ...router, password: pwd }) }
        ],
        'secure-text'
      )
    }
  }

  const handleDelete = (id) => {
    Alert.alert('删除路由器', '确定要删除这个路由器配置吗？', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => {
        await routerManager.remove(id)
        setRouters(routerManager.list())
      }}
    ])
  }

  const startScan = async () => {
    setScanning(true); setFound([])
    await scanLAN(item => setFound(f => [...f, item]), 1500)
    setScanning(false)
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>OpenWrt Manager</Text>
          <Text style={s.subtitle}>路由器管理</Text>
        </View>

        {/* Saved routers */}
        {routers.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>已保存的路由器</Text>
            {routers.map(r => (
              <TouchableOpacity key={r.id} style={[s.card, loading === r.id && s.cardActive]}
                onPress={() => handleRouterPress(r)} onLongPress={() => handleDelete(r.id)}>
                <View style={s.cardIcon}><Text style={s.cardIconText}>⊞</Text></View>
                <View style={s.cardBody}>
                  <Text style={s.cardLabel}>{r.label || r.host}</Text>
                  <Text style={s.cardHost}>{r.host}{r.port !== 80 ? `:${r.port}` : ''}</Text>
                  <View style={s.tags}>
                    <Text style={s.tag}>{r.username}</Text>
                    {r.autoLogin && <Text style={[s.tag, s.tagGreen]}>自动登录</Text>}
                    {r.rememberPassword && <Text style={[s.tag, s.tagBlue]}>记住密码</Text>}
                  </View>
                </View>
                {loading === r.id
                  ? <ActivityIndicator color={C.blue} />
                  : <Text style={s.arrow}>→</Text>}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.addMore} onPress={() => navigation.navigate('Add')}>
              <Text style={s.addMoreText}>＋ 添加路由器</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* LAN Scan */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>局域网自动发现</Text>
            <TouchableOpacity style={[s.scanBtn, scanning && s.scanBtnDim]} onPress={startScan} disabled={scanning}>
              <Text style={s.scanBtnText}>{scanning ? '扫描中...' : '开始扫描'}</Text>
            </TouchableOpacity>
          </View>

          {scanning && (
            <View style={s.scanAnim}>
              <ActivityIndicator color={C.blue} size="large" />
              <Text style={s.scanText}>正在探测局域网路由器...</Text>
            </View>
          )}

          {found.map(item => (
            <TouchableOpacity key={item.host} style={s.foundCard}
              onPress={() => navigation.navigate('Add', { host: item.host })}>
              <View style={s.foundDot} />
              <View style={s.foundBody}>
                <Text style={s.foundHost}>{item.host}</Text>
                <Text style={s.foundSub}>OpenWrt 路由器 · 点击连接</Text>
              </View>
              <Text style={[s.arrow, { color: C.green }]}>→</Text>
            </TouchableOpacity>
          ))}

          {!scanning && found.length === 0 && routers.length === 0 && (
            <View style={s.empty}>
              <Text style={s.emptyText}>点击"开始扫描"发现局域网路由器</Text>
              <Text style={s.emptyText}>或手动添加</Text>
            </View>
          )}
        </View>

        {/* Manual add button (when no routers) */}
        {routers.length === 0 && (
          <TouchableOpacity style={s.manualBtn} onPress={() => navigation.navigate('Add')}>
            <Text style={s.manualBtnText}>手动添加路由器</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  scroll:  { flex: 1 },
  content: { padding: 20, paddingBottom: 60 },
  header:  { marginBottom: 28 },
  title:   { fontSize: 26, fontWeight: '700', color: C.text },
  subtitle:{ fontSize: 13, color: C.muted, marginTop: 2 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 11, fontWeight: '600', color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },

  card:      { backgroundColor: C.bg2, borderWidth: 1, borderColor: C.border, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 8 },
  cardActive:{ borderColor: C.blue },
  cardIcon:  { width: 40, height: 40, borderRadius: 9, backgroundColor: '#1f4a8f33', alignItems: 'center', justifyContent: 'center' },
  cardIconText: { fontSize: 20, color: C.blue },
  cardBody:  { flex: 1 },
  cardLabel: { fontSize: 15, fontWeight: '600', color: C.text },
  cardHost:  { fontSize: 12, color: C.muted, marginTop: 2 },
  tags:      { flexDirection: 'row', gap: 6, marginTop: 5 },
  tag:       { fontSize: 11, color: C.muted, backgroundColor: '#21262d', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  tagBlue:   { color: '#60a5fa', backgroundColor: '#1f4a8f33' },
  tagGreen:  { color: '#4ade80', backgroundColor: '#14532d33' },
  arrow:     { color: C.muted, fontSize: 18 },

  addMore:     { borderWidth: 1, borderStyle: 'dashed', borderColor: C.border, borderRadius: 10, padding: 12, alignItems: 'center' },
  addMoreText: { color: C.muted, fontSize: 13 },

  scanBtn:    { backgroundColor: '#21262d', borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  scanBtnDim: { opacity: 0.5 },
  scanBtnText:{ color: C.text, fontSize: 13 },
  scanAnim:   { backgroundColor: C.bg2, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 24, alignItems: 'center', gap: 12, marginBottom: 8 },
  scanText:   { color: C.muted, fontSize: 13 },

  foundCard: { backgroundColor: '#0e2a1e', borderWidth: 1, borderColor: '#1a4a30', borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 8 },
  foundDot:  { width: 10, height: 10, borderRadius: 5, backgroundColor: C.green },
  foundBody: { flex: 1 },
  foundHost: { fontSize: 15, fontWeight: '600', color: C.text },
  foundSub:  { fontSize: 12, color: C.muted, marginTop: 2 },

  empty:    { padding: 24, alignItems: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: C.border, borderRadius: 10 },
  emptyText:{ fontSize: 13, color: C.muted },

  manualBtn:     { backgroundColor: C.blue, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  manualBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
})

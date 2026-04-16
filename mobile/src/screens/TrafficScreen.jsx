// TrafficScreen.jsx
import React, { useState, useRef } from 'react'
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAppStore } from '../store'
import { usePolling } from '../hooks/usePolling'

const C = { bg:'#0d1117', bg2:'#161b22', border:'#30363d', text:'#e6edf3', muted:'#8b949e', blue:'#4f8ef7', green:'#22c55e' }

function fmtSpeed(bps) {
  if (bps < 1024) return `${Math.round(bps)} B/s`
  if (bps < 1048576) return `${(bps/1024).toFixed(1)} KB/s`
  return `${(bps/1048576).toFixed(2)} MB/s`
}

export default function TrafficScreen() {
  const { client, interfaces, trafficHistory, addTrafficSnapshot } = useAppStore()
  const [activeIface, setActiveIface] = useState('wan')
  const [refreshing, setRefreshing]   = useState(false)
  const prev = useRef(null)

  const poll = async () => {
    if (!client) return
    try {
      // 用 /proc/net/dev 获取精确流量数据
      const stats = await client.getNetworkStats()
      const keys = Object.keys(stats).filter(k => k !== 'lo')
      const wanKey = keys.find(k => k === activeIface || k.includes('wan') || k === 'pppoe-wan')
        || keys.reduce((a, b) => ((stats[a]?.rxBytes||0) + (stats[a]?.txBytes||0)) > ((stats[b]?.rxBytes||0) + (stats[b]?.txBytes||0)) ? a : b, keys[0])
      if (!wanKey || !stats[wanKey]) return
      const now = { rx: stats[wanKey].rxBytes, tx: stats[wanKey].txBytes, ts: Date.now() }
      let rxRate = 0, txRate = 0
      if (prev.current) {
        const dt = (now.ts - prev.current.ts) / 1000
        if (dt > 0) {
          rxRate = Math.max(0, (now.rx - prev.current.rx) / dt)
          txRate = Math.max(0, (now.tx - prev.current.tx) / dt)
        }
      }
      prev.current = now
      addTrafficSnapshot({ rx: rxRate, tx: txRate, ts: now.ts })
    } catch {}
  }
  usePolling(poll, 3000, [client, activeIface])

  const cur = trafficHistory.at(-1)

  // Simple bar chart — just use proportional widths
  const maxVal = Math.max(...trafficHistory.map(s => Math.max(s.rx, s.tx)), 1)

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async()=>{setRefreshing(true);await poll();setRefreshing(false)}} tintColor={C.blue}/>}>

        {/* Interface tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabs}>
          {interfaces.map(i => (
            <TouchableOpacity key={i.name} style={[s.tab, i.name === activeIface && s.tabActive]}
              onPress={() => { setActiveIface(i.name); prev.current = null }}>
              <Text style={[s.tabText, i.name === activeIface && s.tabTextActive]}>{i.name}</Text>
              <View style={[s.tabDot, { backgroundColor: i.up ? C.green : '#555' }]} />
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Speed cards */}
        <View style={s.speedRow}>
          <View style={s.speedCard}>
            <Text style={s.speedLabel}>↓ 下行</Text>
            <Text style={[s.speedVal, {color: C.blue}]}>{cur ? fmtSpeed(cur.rx) : '--'}</Text>
          </View>
          <View style={[s.speedCard, {borderLeftWidth: 1, borderColor: C.border}]}>
            <Text style={s.speedLabel}>↑ 上行</Text>
            <Text style={[s.speedVal, {color: C.green}]}>{cur ? fmtSpeed(cur.tx) : '--'}</Text>
          </View>
        </View>

        {/* Simple sparkline bars */}
        <View style={s.chart}>
          <Text style={s.chartTitle}>实时速率（最近 {trafficHistory.length} 次采样）</Text>
          <View style={s.bars}>
            {trafficHistory.slice(-20).map((snap, i) => (
              <View key={i} style={s.barGroup}>
                <View style={[s.bar, { height: Math.max(2, (snap.rx/maxVal)*60), backgroundColor: C.blue }]} />
                <View style={[s.bar, { height: Math.max(2, (snap.tx/maxVal)*60), backgroundColor: C.green }]} />
              </View>
            ))}
          </View>
          <View style={s.legend}>
            <View style={s.legendItem}><View style={[s.legendDot, {backgroundColor: C.blue}]}/><Text style={s.legendText}>下行</Text></View>
            <View style={s.legendItem}><View style={[s.legendDot, {backgroundColor: C.green}]}/><Text style={s.legendText}>上行</Text></View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:    { flex:1, backgroundColor: C.bg },
  scroll:  { flex:1 },
  content: { padding: 14, paddingBottom: 40 },
  tabs:    { marginBottom: 14 },
  tab:     { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: C.bg2, borderRadius: 20, marginRight: 8, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', gap: 5 },
  tabActive: { borderColor: C.blue, backgroundColor: '#1f4a8f22' },
  tabText:   { fontSize: 13, color: C.muted },
  tabTextActive: { color: C.blue },
  tabDot:    { width: 6, height: 6, borderRadius: 3 },
  speedRow:  { flexDirection: 'row', backgroundColor: C.bg2, borderWidth: 1, borderColor: C.border, borderRadius: 10, overflow: 'hidden', marginBottom: 14 },
  speedCard: { flex:1, padding: 18, alignItems: 'center' },
  speedLabel:{ fontSize: 12, color: C.muted },
  speedVal:  { fontSize: 22, fontWeight: '700', marginTop: 4, fontVariant: ['tabular-nums'] },
  chart:     { backgroundColor: C.bg2, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 14 },
  chartTitle:{ fontSize: 11, color: C.muted, marginBottom: 12 },
  bars:      { flexDirection: 'row', alignItems: 'flex-end', height: 64, gap: 3 },
  barGroup:  { flex:1, flexDirection: 'row', alignItems: 'flex-end', gap: 1 },
  bar:       { flex:1, borderRadius: 2 },
  legend:    { flexDirection: 'row', gap: 16, marginTop: 10 },
  legendItem:{ flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText:{ fontSize: 12, color: C.muted },
})

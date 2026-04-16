// DevicesScreen.jsx
import React, { useState } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, Alert, RefreshControl, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAppStore } from '../store'
import { useTablet } from '../hooks/useTablet'
import { usePolling } from '../hooks/usePolling'

const C = { bg:'#0d1117', bg2:'#161b22', border:'#30363d', text:'#e6edf3', muted:'#8b949e', blue:'#4f8ef7', red:'#f85149' }

export default function DevicesScreen() {
  const { client, devices, setDevices } = useAppStore()
  const [search, setSearch] = useState('')
  const { isTablet, contentWidth } = useTablet()
  const [kicking,   setKicking]   = useState(null)
  const [refreshing,setRefreshing]= useState(false)

  const fetch = async () => {
    if (!client) return
    try { setDevices(await client.getDHCPLeases()) } catch {}
  }
  usePolling(fetch, 15000, [client])

  const kick = async (mac, name) => {
    Alert.alert('踢出设备', `确定踢出「${name || mac}」？`, [
      { text: '取消', style: 'cancel' },
      { text: '踢出', style: 'destructive', onPress: async () => {
        setKicking(mac)
        try {
          await client.execCommand('iptables', ['-I','FORWARD','-m','mac','--mac-source',mac,'-j','DROP'])
          setDevices(devices.filter(d => d.mac !== mac))
          Alert.alert('', '设备已踢出')
        } catch (e) { Alert.alert('失败', e.message) }
        setKicking(null)
      }}
    ])
  }

  const filtered = devices.filter(d =>
    !search || d.ip.includes(search) || (d.hostname||'').toLowerCase().includes(search.toLowerCase()) || d.mac.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.searchBar}>
        <TextInput style={s.searchInput} placeholder="搜索 IP / MAC / 主机名" placeholderTextColor={C.muted} value={search} onChangeText={setSearch} />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={d => d.mac || d.ip}
        numColumns={isTablet ? 2 : 1}
        key={isTablet ? 'tablet' : 'phone'}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async()=>{setRefreshing(true);await fetch();setRefreshing(false)}} tintColor={C.blue}/>}
        ListHeaderComponent={<Text style={s.count}>在线设备 {devices.length} 台</Text>}
        ListEmptyComponent={<Text style={s.empty}>暂无设备</Text>}
        renderItem={({ item: d }) => (
          <View style={s.card}>
            <View style={s.avatar}><Text style={s.avatarText}>{(d.hostname||d.ip).charAt(0).toUpperCase()}</Text></View>
            <View style={s.info}>
              <Text style={s.name}>{d.hostname || '未知设备'}</Text>
              <Text style={s.ip}>{d.ip}</Text>
              <Text style={s.mac}>{d.mac}</Text>
            </View>
            <TouchableOpacity style={[s.kickBtn, kicking===d.mac&&s.dim]} disabled={kicking===d.mac} onPress={()=>kick(d.mac,d.hostname)}>
              {kicking===d.mac ? <ActivityIndicator color={C.red} size="small"/> : <Text style={s.kickText}>踢出</Text>}
            </TouchableOpacity>
          </View>
        )}
        contentContainerStyle={{ padding: 14 }}
      />
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:       { flex:1, backgroundColor: C.bg },
  searchBar:  { padding: 12, borderBottomWidth: 1, borderColor: C.border },
  searchInput:{ backgroundColor: C.bg2, borderRadius: 8, color: C.text, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, borderWidth: 1, borderColor: C.border },
  count:      { fontSize: 12, color: C.muted, marginBottom: 10 },
  empty:      { textAlign: 'center', color: C.muted, marginTop: 40, fontSize: 14 },
  card:       { backgroundColor: C.bg2, borderWidth: 1, borderColor: C.border, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginBottom: 8 },
  avatar:     { width: 40, height: 40, borderRadius: 9, backgroundColor: '#1f4a8f33', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '700', color: C.blue },
  info:       { flex: 1 },
  name:       { fontSize: 14, fontWeight: '600', color: C.text },
  ip:         { fontSize: 12, color: C.muted, marginTop: 2, fontFamily: 'monospace' },
  mac:        { fontSize: 11, color: '#484f58', marginTop: 1, fontFamily: 'monospace' },
  kickBtn:    { backgroundColor: '#2a101022', borderWidth: 1, borderColor: '#f8514933', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  kickText:   { fontSize: 13, color: C.red },
  dim:        { opacity: 0.5 },
})

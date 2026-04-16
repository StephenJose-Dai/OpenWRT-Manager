import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAppStore } from '../store'

const C = {
  bg: '#0d1117', bg2: '#161b22', bg3: '#21262d',
  border: '#30363d', text: '#e6edf3', muted: '#8b949e',
  blue: '#4f8ef7', green: '#22c55e', red: '#f85149'
}

const NAV_ITEMS = [
  { key: '控制台', icon: '⊞', label: '控制台' },
  { key: '设备',   icon: '⊙', label: '设备管理' },
  { key: '流量',   icon: '≋', label: '流量统计' },
  { key: '防火墙', icon: '⛉', label: '防火墙' },
  { key: '系统',   icon: '⚙', label: '系统设置' },
]

export default function TabletSidebar({ activeTab, onTabChange, navigation }) {
  const { config, online, disconnect } = useAppStore()

  return (
    <View style={s.sidebar}>
      {/* Logo */}
      <View style={s.brand}>
        <Text style={s.brandTitle}>OpenWrt</Text>
        <Text style={s.brandSub}>Manager</Text>
      </View>

      {/* 当前路由器 */}
      <TouchableOpacity style={s.routerCard}
        onPress={() => navigation?.navigate('Index')}>
        <View style={[s.dot, { backgroundColor: online ? C.green : C.red }]} />
        <View style={{ flex: 1 }}>
          <Text style={s.routerLabel} numberOfLines={1}>{config?.label || config?.host || '路由器'}</Text>
          <Text style={s.routerHost} numberOfLines={1}>{config?.host}</Text>
        </View>
        <Text style={s.switchText}>切换</Text>
      </TouchableOpacity>

      {/* 导航项 */}
      <ScrollView style={{ flex: 1 }}>
        {NAV_ITEMS.map(item => (
          <TouchableOpacity
            key={item.key}
            style={[s.navItem, activeTab === item.key && s.navItemActive]}
            onPress={() => onTabChange(item.key)}>
            <Text style={[s.navIcon, activeTab === item.key && s.navIconActive]}>{item.icon}</Text>
            <Text style={[s.navLabel, activeTab === item.key && s.navLabelActive]}>{item.label}</Text>
            {activeTab === item.key && <View style={s.activeBar} />}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* 底部断开 */}
      <TouchableOpacity style={s.disconnectBtn}
        onPress={() => { disconnect(); navigation?.replace('Index') }}>
        <Text style={s.disconnectText}>⇠ 断开连接</Text>
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  sidebar: {
    width: 220,
    backgroundColor: C.bg2,
    borderRightWidth: 1,
    borderColor: C.border,
    flexDirection: 'column',
  },
  brand: {
    padding: 20,
    paddingTop: 24,
    borderBottomWidth: 1,
    borderColor: C.border,
  },
  brandTitle: { fontSize: 18, fontWeight: '800', color: C.text },
  brandSub:   { fontSize: 11, color: C.muted, marginTop: 1 },
  routerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderBottomWidth: 1,
    borderColor: C.border,
    backgroundColor: C.bg3,
  },
  dot:          { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  routerLabel:  { fontSize: 13, fontWeight: '600', color: C.text },
  routerHost:   { fontSize: 11, color: C.muted, marginTop: 1 },
  switchText:   { fontSize: 11, color: C.blue },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    position: 'relative',
  },
  navItemActive: { backgroundColor: '#1f4a8f22' },
  navIcon:       { fontSize: 16, color: C.muted, width: 22, textAlign: 'center' },
  navIconActive: { color: C.blue },
  navLabel:      { fontSize: 14, color: C.muted },
  navLabelActive:{ color: C.text, fontWeight: '600' },
  activeBar: {
    position: 'absolute', left: 0, top: 4, bottom: 4,
    width: 3, backgroundColor: C.blue, borderRadius: 2,
  },
  disconnectBtn: {
    padding: 16,
    borderTopWidth: 1,
    borderColor: C.border,
  },
  disconnectText: { fontSize: 13, color: C.muted },
})

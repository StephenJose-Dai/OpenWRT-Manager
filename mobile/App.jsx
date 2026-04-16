import React, { useState } from 'react'
import { StatusBar, StyleSheet, View } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'

import IndexScreen     from './src/screens/IndexScreen'
import AddScreen       from './src/screens/AddScreen'
import DashboardScreen from './src/screens/DashboardScreen'
import DevicesScreen   from './src/screens/DevicesScreen'
import TrafficScreen   from './src/screens/TrafficScreen'
import FirewallScreen  from './src/screens/FirewallScreen'
import SystemScreen    from './src/screens/SystemScreen'
import TabletSidebar   from './src/components/TabletSidebar'
import { useTablet }   from './src/hooks/useTablet'

const Stack = createNativeStackNavigator()
const Tab   = createBottomTabNavigator()

const COLORS = {
  bg: '#0d1117', bg2: '#161b22', border: '#30363d',
  text: '#e6edf3', muted: '#8b949e', blue: '#4f8ef7',
}

const SCREENS = {
  '控制台': DashboardScreen,
  '设备':   DevicesScreen,
  '流量':   TrafficScreen,
  '防火墙': FirewallScreen,
  '系统':   SystemScreen,
}

// 平板专用：侧边栏 + 内容区
function TabletLayout({ navigation }) {
  const [activeTab, setActiveTab] = useState('控制台')
  const Screen = SCREENS[activeTab] || DashboardScreen

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: COLORS.bg }}>
      <TabletSidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        navigation={navigation}
      />
      <View style={{ flex: 1 }}>
        <Screen navigation={navigation} />
      </View>
    </View>
  )
}

// 手机专用：底部 Tab
function PhoneTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.bg2,
          borderTopColor: COLORS.border,
          height: 56,
        },
        tabBarActiveTintColor:   COLORS.blue,
        tabBarInactiveTintColor: COLORS.muted,
        tabBarLabelStyle: { fontSize: 11, marginBottom: 4 },
      }}
    >
      <Tab.Screen name="控制台"  component={DashboardScreen} />
      <Tab.Screen name="设备"    component={DevicesScreen} />
      <Tab.Screen name="流量"    component={TrafficScreen} />
      <Tab.Screen name="防火墙"  component={FirewallScreen} />
      <Tab.Screen name="系统"    component={SystemScreen} />
    </Tab.Navigator>
  )
}

// 自适应主界面：平板用侧边栏，手机用底部Tab
function MainScreen({ navigation }) {
  const { isTablet } = useTablet()
  return isTablet
    ? <TabletLayout navigation={navigation} />
    : <PhoneTabs />
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
        <NavigationContainer
          theme={{
            dark: true,
            colors: {
              primary:      COLORS.blue,
              background:   COLORS.bg,
              card:         COLORS.bg2,
              text:         COLORS.text,
              border:       COLORS.border,
              notification: COLORS.blue,
            }
          }}
        >
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Index" component={IndexScreen} />
            <Stack.Screen name="Add"   component={AddScreen} />
            <Stack.Screen name="Main"  component={MainScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

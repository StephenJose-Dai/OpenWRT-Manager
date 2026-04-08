import React, { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ConnectionManager from './components/ConnectionManager.jsx'
import Layout from './components/Layout.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import DevicesPage from './pages/DevicesPage.jsx'
import TrafficPage from './pages/TrafficPage.jsx'
import FirewallPage from './pages/FirewallPage.jsx'
import VPNPage from './pages/VPNPage.jsx'
import SystemPage from './pages/SystemPage.jsx'
import TerminalPage from './pages/TerminalPage.jsx'

export default function App() {
  // client = OpenWrtClient 实例，null 表示未连接
  const [client, setClient] = useState(null)
  const [routerConfig, setRouterConfig] = useState(null)
  const [routerManager, setRouterManager] = useState(null)

  const handleConnected = ({ client, config, manager }) => {
    setClient(client)
    setRouterConfig(config)
    setRouterManager(manager)
  }

  const handleDisconnect = () => {
    setClient(null)
    setRouterConfig(null)
  }

  if (!client) {
    return (
      <div style={{ height: '100vh', overflow: 'auto' }}>
        <ConnectionManager onConnected={handleConnected} />
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={
          <Layout
            client={client}
            config={routerConfig}
            manager={routerManager}
            onDisconnect={handleDisconnect}
            onSwitchRouter={handleConnected}
          />
        }>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage client={client} />} />
          <Route path="devices"   element={<DevicesPage   client={client} />} />
          <Route path="traffic"   element={<TrafficPage   client={client} />} />
          <Route path="firewall"  element={<FirewallPage  client={client} />} />
          <Route path="vpn"       element={<VPNPage       client={client} />} />
          <Route path="system"    element={<SystemPage    client={client} />} />
          <Route path="terminal"  element={<TerminalPage  client={client} config={routerConfig} />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

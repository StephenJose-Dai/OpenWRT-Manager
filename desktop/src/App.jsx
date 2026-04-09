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

// ── 错误边界：捕获渲染错误，显示详情而不是黑屏 ──────────
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null, info: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    this.setState({ info })
    console.error('[ErrorBoundary]', error, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          height: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#0d1117', color: '#e6edf3', padding: 40, gap: 16
        }}>
          <div style={{fontSize: 32}}>⚠</div>
          <div style={{fontSize: 18, fontWeight: 600, color: '#f87171'}}>
            渲染错误
          </div>
          <div style={{
            background: '#161b22', border: '1px solid #30363d',
            borderRadius: 8, padding: '14px 18px', maxWidth: 700,
            fontSize: 12, fontFamily: 'monospace', color: '#f87171',
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            maxHeight: 300, overflow: 'auto'
          }}>
            {this.state.error?.toString()}
            {'\n\n'}
            {this.state.info?.componentStack}
          </div>
          <button
            onClick={() => this.setState({ error: null, info: null })}
            style={{
              background: '#4f8ef7', border: 'none', borderRadius: 8,
              color: '#fff', padding: '8px 20px', cursor: 'pointer', fontSize: 14
            }}
          >
            重试
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: 'transparent', border: '1px solid #30363d',
              borderRadius: 8, color: '#8b949e', padding: '8px 20px',
              cursor: 'pointer', fontSize: 14
            }}
          >
            重载页面
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const [client,       setClient]       = useState(null)
  const [routerConfig, setRouterConfig] = useState(null)
  const [routerManager,setRouterManager]= useState(null)

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
      <ErrorBoundary>
        <div style={{ height: '100vh', overflow: 'auto' }}>
          <ConnectionManager onConnected={handleConnected} />
        </div>
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
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
            <Route path="dashboard" element={
              <ErrorBoundary><DashboardPage client={client} /></ErrorBoundary>
            } />
            <Route path="devices" element={
              <ErrorBoundary><DevicesPage client={client} /></ErrorBoundary>
            } />
            <Route path="traffic" element={
              <ErrorBoundary><TrafficPage client={client} /></ErrorBoundary>
            } />
            <Route path="firewall" element={
              <ErrorBoundary><FirewallPage client={client} /></ErrorBoundary>
            } />
            <Route path="vpn" element={
              <ErrorBoundary><VPNPage client={client} /></ErrorBoundary>
            } />
            <Route path="system" element={
              <ErrorBoundary><SystemPage client={client} /></ErrorBoundary>
            } />
            <Route path="terminal" element={
              <ErrorBoundary>
                <TerminalPage client={client} config={routerConfig} />
              </ErrorBoundary>
            } />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

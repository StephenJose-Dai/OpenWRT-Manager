import React, { useState } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import ConnectionManager from './components/ConnectionManager.jsx'
import Layout from './components/Layout.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import DevicesPage from './pages/DevicesPage.jsx'
import TrafficPage from './pages/TrafficPage.jsx'
import FirewallPage from './pages/FirewallPage.jsx'
import VPNPage from './pages/VPNPage.jsx'
import SystemPage from './pages/SystemPage.jsx'
import TerminalPage from './pages/TerminalPage.jsx'

// ── 错误边界：捕获渲染错误，显示具体信息而不是黑屏 ──────
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null, info: null }
  }
  static getDerivedStateFromError(error) { return { error } }
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
          <div style={{fontSize: 17, fontWeight: 600, color: '#f87171'}}>渲染错误</div>
          <div style={{
            background: '#161b22', border: '1px solid #30363d', borderRadius: 8,
            padding: '14px 18px', maxWidth: 700, fontSize: 12,
            fontFamily: 'monospace', color: '#f87171',
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            maxHeight: 320, overflow: 'auto'
          }}>
            {String(this.state.error)}
            {'\n'}
            {this.state.info?.componentStack || ''}
          </div>
          <div style={{display:'flex',gap:10}}>
            <button onClick={() => this.setState({ error: null, info: null })}
              style={{background:'#4f8ef7',border:'none',borderRadius:8,
                color:'#fff',padding:'8px 20px',cursor:'pointer',fontSize:14}}>
              重试
            </button>
            <button onClick={() => window.location.reload()}
              style={{background:'transparent',border:'1px solid #30363d',
                borderRadius:8,color:'#8b949e',padding:'8px 20px',
                cursor:'pointer',fontSize:14}}>
              重载
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function SafePage({ children }) {
  return <ErrorBoundary>{children}</ErrorBoundary>
}

export default function App() {
  const [client,        setClient]        = useState(null)
  const [routerConfig,  setRouterConfig]  = useState(null)
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
      <ErrorBoundary>
        <div style={{ height: '100vh', overflow: 'auto' }}>
          <ConnectionManager onConnected={handleConnected} />
        </div>
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
      {/* HashRouter：在 file:// 协议下正确工作（用 #/dashboard 而非 /dashboard） */}
      <HashRouter>
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
            <Route path="dashboard" element={<SafePage><DashboardPage client={client} /></SafePage>} />
            <Route path="devices"   element={<SafePage><DevicesPage   client={client} /></SafePage>} />
            <Route path="traffic"   element={<SafePage><TrafficPage   client={client} /></SafePage>} />
            <Route path="firewall"  element={<SafePage><FirewallPage  client={client} /></SafePage>} />
            <Route path="vpn"       element={<SafePage><VPNPage       client={client} /></SafePage>} />
            <Route path="system"    element={<SafePage><SystemPage    client={client} /></SafePage>} />
            <Route path="terminal"  element={<SafePage><TerminalPage  client={client} config={routerConfig} /></SafePage>} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  )
}

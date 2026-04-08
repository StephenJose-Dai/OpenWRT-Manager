import React, { useState, useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Wifi, BarChart3, Shield, Network,
  Settings, Terminal, LogOut, ChevronLeft, Router,
  ChevronDown, Plus
} from 'lucide-react'
import { createClient } from '../services/openwrt.js'

const NAV = [
  { path: 'dashboard', label: '总览',   Icon: LayoutDashboard },
  { path: 'devices',   label: '设备',   Icon: Wifi },
  { path: 'traffic',   label: '流量',   Icon: BarChart3 },
  { path: 'firewall',  label: '防火墙', Icon: Shield },
  { path: 'vpn',       label: 'VPN',    Icon: Network },
  { path: 'system',    label: '系统',   Icon: Settings },
  { path: 'terminal',  label: '终端',   Icon: Terminal },
]

export default function Layout({ client, config, manager, onDisconnect, onSwitchRouter }) {
  const [collapsed,    setCollapsed]    = useState(false)
  const [online,       setOnline]       = useState(true)
  const [showSwitcher, setShowSwitcher] = useState(false)
  const [routers,      setRouters]      = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    if (manager) setRouters(manager.listRouters())
    const t = setInterval(async () => {
      try   { await client.call('system', 'info'); setOnline(true)  }
      catch { setOnline(false) }
    }, 30000)
    return () => clearInterval(t)
  }, [client, manager])

  const handleSwitch = async (id) => {
    if (!manager) return
    const cfg = manager.getConfig(id)
    if (!cfg) return
    try {
      const newClient = createClient(cfg)
      await newClient.login()
      onSwitchRouter({ client: newClient, config: cfg, manager })
      setShowSwitcher(false)
      navigate('/dashboard')
    } catch (e) {
      alert('连接失败：' + e.message)
    }
  }

  return (
    <div className="layout">
      {/* 自定义标题栏 */}
      <div className="titlebar" style={{ WebkitAppRegion: 'drag' }}>
        <div className="titlebar-left">
          <Router size={15} />
          <span>OpenWrt Manager</span>
        </div>

        <div className="titlebar-center" style={{ WebkitAppRegion: 'no-drag', position: 'relative' }}>
          <button className="router-switcher-btn" onClick={() => setShowSwitcher(v => !v)}>
            <span className={`status-dot ${online ? 'online' : 'offline'}`} />
            <span>{config?.label || config?.host || '路由器'}</span>
            <ChevronDown size={12} />
          </button>

          {showSwitcher && (
            <div className="router-dropdown">
              {routers.map(r => (
                <button
                  key={r.id}
                  className={`dropdown-item ${r.id === config?.id ? 'active' : ''}`}
                  onClick={() => handleSwitch(r.id)}
                >
                  <span className="dropdown-dot" />
                  <span className="dropdown-label">{r.label || r.host}</span>
                  <span className="dropdown-host">{r.host}</span>
                </button>
              ))}
              <button className="dropdown-add"
                onClick={() => { onDisconnect(); setShowSwitcher(false) }}>
                <Plus size={12} /> 添加/管理路由器
              </button>
            </div>
          )}
        </div>

        <div className="titlebar-controls" style={{ WebkitAppRegion: 'no-drag' }}>
          <button onClick={() => window.electron?.minimize()}>─</button>
          <button onClick={() => window.electron?.maximize()}>□</button>
          <button className="close-btn" onClick={() => window.electron?.close()}>✕</button>
        </div>
      </div>

      <div className="main-container">
        <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
          <nav className="sidebar-nav">
            {NAV.map(({ path, label, Icon }) => (
              <NavLink
                key={path}
                to={`/${path}`}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                title={collapsed ? label : undefined}
              >
                <Icon size={17} />
                {!collapsed && <span>{label}</span>}
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-footer">
            <button className="nav-item logout-btn" onClick={onDisconnect} title="断开连接">
              <LogOut size={17} />
              {!collapsed && <span>断开</span>}
            </button>
          </div>
          <button className="collapse-btn" onClick={() => setCollapsed(v => !v)}>
            <ChevronLeft size={14} style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: '.2s' }} />
          </button>
        </aside>

        <main className="content" onClick={() => showSwitcher && setShowSwitcher(false)}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}

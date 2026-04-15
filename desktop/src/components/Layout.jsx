import React, { useState, useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Wifi, BarChart3, Shield, Network,
  Settings, Terminal, LogOut, ChevronLeft, Router,
  ChevronDown, Plus
} from 'lucide-react'
import { createClient } from '../services/openwrt.js'

// 基础菜单（始终显示）
const BASE_NAV = [
  { path: 'dashboard', label: '总览',   Icon: LayoutDashboard },
  { path: 'devices',   label: '设备',   Icon: Wifi },
  { path: 'traffic',   label: '流量',   Icon: BarChart3 },
  { path: 'firewall',  label: '防火墙', Icon: Shield },
]
// 动态菜单（根据路由器实际安装的功能显示）
const OPTIONAL_NAV = [
  { path: 'vpn', label: 'VPN',       Icon: Network, featureKeys: ['vpn','wireguard','openclash','clash','ssr','passwall'] },
]
// 尾部固定菜单
const TAIL_NAV = [
  { path: 'system',   label: '系统', Icon: Settings },
  { path: 'terminal', label: '终端', Icon: Terminal },
]

export default function Layout({ client, config, manager, features = {}, aclReady = null, onDisconnect, onSwitchRouter, onAddRouter }) {
  const [collapsed,    setCollapsed]    = useState(false)
  const [online,       setOnline]       = useState(true)
  const [showSwitcher, setShowSwitcher] = useState(false)
  const [routers,      setRouters]      = useState([])
  const navigate = useNavigate()

  // 动态计算菜单
  const NAV = [
    ...BASE_NAV,
    ...OPTIONAL_NAV.filter(n => {
      if (!n.featureKeys) return true
      return n.featureKeys.some(k => features[k])
    }),
    ...TAIL_NAV,
  ]

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
                onClick={() => { (onAddRouter || onDisconnect)(); setShowSwitcher(false) }}>
                <Plus size={12} /> 添加路由器
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
          {aclReady === false && (
            <div style={{background:'#2d1f00',border:'1px solid #f59e0b',borderRadius:8,
              padding:'10px 16px',marginBottom:16,display:'flex',
              alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
              <div>
                <span style={{color:'#f59e0b',fontWeight:600}}>⚠ rpcd 权限未配置</span>
                <span style={{color:'#d97706',fontSize:12,marginLeft:8}}>
                  设备/防火墙/终端功能受限
                </span>
              </div>
              <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                <pre style={{background:'#1a1000',padding:'8px 10px',borderRadius:4,
                  fontSize:11,color:'#fcd34d',userSelect:'all',cursor:'text',
                  margin:0,overflowX:'auto',whiteSpace:'pre'}}>
{`cat > /usr/share/rpcd/acl.d/owm.json << 'EOF'
{
  "root": {
    "read": {
      "ubus": {"*": ["*"]},
      "uci":  {"*": ["read"]},
      "file": {"*": ["read","exec","list"]}
    },
    "write": {
      "ubus": {"*": ["*"]},
      "uci":  {"*": ["read","write"]},
      "file": {"*": ["read","write","exec","list"]}
    }
  }
}
EOF
/etc/init.d/rpcd restart`}
                </pre>
                <button onClick={async () => {
                    const btn = document.activeElement
                    if (btn) btn.textContent = '配置中...'
                    const r = await client.setupACL()
                    if (r.success) {
                      if (btn) btn.textContent = '✓ 成功，重连中...'
                      setTimeout(() => window.location.reload(), 1800)
                    } else {
                      if (btn) btn.textContent = '自动配置'
                      alert('自动配置失败，请手动复制上方命令在路由器 SSH 执行')
                    }
                  }}
                  style={{background:'#f59e0b',border:'none',borderRadius:6,
                    color:'#000',padding:'5px 12px',cursor:'pointer',fontSize:12,fontWeight:600,whiteSpace:'nowrap'}}>
                  自动配置
                </button>
              </div>
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  )
}

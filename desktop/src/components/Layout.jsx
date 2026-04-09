import React, { useState, useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Wifi, BarChart3, Shield, Network,
  Settings, Terminal, LogOut, ChevronLeft, Router,
  ChevronDown, Plus, Container, Zap
} from 'lucide-react'
import { createClient } from '../services/openwrt.js'

// 固定菜单
const FIXED_NAV = [
  { path: 'dashboard', label: '总览',   icon: <LayoutDashboard size={17}/> },
  { path: 'devices',   label: '设备',   icon: <Wifi size={17}/> },
  { path: 'traffic',   label: '流量',   icon: <BarChart3 size={17}/> },
  { path: 'firewall',  label: '防火墙', icon: <Shield size={17}/> },
  { path: 'vpn',       label: 'VPN',    icon: <Network size={17}/> },
  { path: 'system',    label: '系统',   icon: <Settings size={17}/> },
  { path: 'terminal',  label: '终端',   icon: <Terminal size={17}/> },
]

// 检测动态服务是否存在
async function detectServices(client) {
  const services = []
  try {
    // 检测 Docker
    const dockerCheck = await client.execCommand('which', ['docker']).catch(()=>null)
    if (dockerCheck?.stdout?.trim()) services.push('docker')
  } catch {}
  try {
    // 检测 WireGuard
    const wgCheck = await client.execCommand('which', ['wg']).catch(()=>null)
    if (wgCheck?.stdout?.trim()) services.push('wireguard')
  } catch {}
  try {
    // 检测 PassWall / SSR / OpenClash 等（检查 /etc/init.d/）
    const initCheck = await client.execCommand('ls', ['/etc/init.d/']).catch(()=>null)
    const files = (initCheck?.stdout||'').split('\n').map(s=>s.trim()).filter(Boolean)
    if (files.some(f => /passwall|ssr|shadowsock/i.test(f))) services.push('passwall')
    if (files.some(f => /openclash|clash/i.test(f))) services.push('openclash')
    if (files.some(f => /adguardhome|adguard/i.test(f))) services.push('adguard')
    if (files.some(f => /mosdns/i.test(f))) services.push('mosdns')
  } catch {}
  return services
}

export default function Layout({ client, config, manager, onDisconnect, onSwitchRouter }) {
  const [collapsed,    setCollapsed]    = useState(false)

  // 动态菜单：基础 + 已安装的可选功能 + 尾部
  const NAV = [
    ...BASE_NAV,
    ...OPTIONAL_NAV.filter(n => !n.featureKey || features[n.featureKey]),
    ...TAIL_NAV,
  ]
  const [online,       setOnline]       = useState(true)
  const [showSwitcher, setShowSwitcher] = useState(false)
  const [routers,      setRouters]      = useState([])
  const [dynServices,  setDynServices]  = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    if (manager) setRouters(manager.listRouters())
    // 检测动态服务
    detectServices(client).then(setDynServices).catch(() => {})
    // 心跳检测
    const t = setInterval(async () => {
      try   { await client.call('system', 'info'); setOnline(true) }
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
    } catch (e) { alert('连接失败：' + e.message) }
  }

  // 动态附加菜单
  const extraNav = []
  if (dynServices.includes('docker'))    extraNav.push({ path:'terminal', label:'Docker', icon:<Container size={17}/> })
  if (dynServices.includes('wireguard')) extraNav.push({ path:'vpn', label:'WireGuard', icon:<Network size={17}/> })
  if (dynServices.includes('passwall'))  extraNav.push({ path:'terminal', label:'PassWall', icon:<Zap size={17}/> })

  return (
    <div className="layout">
      <div className="titlebar" style={{ WebkitAppRegion: 'drag' }}>
        <div className="titlebar-left">
          <img src="./assets/icon.png" width="16" height="16" style={{borderRadius:3,flexShrink:0}} alt="" onError={e=>e.target.style.display='none'}/>
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
                <button key={r.id} className={`dropdown-item ${r.id===config?.id?'active':''}`} onClick={()=>handleSwitch(r.id)}>
                  <span className="dropdown-dot"/><span className="dropdown-label">{r.label||r.host}</span><span className="dropdown-host">{r.host}</span>
                </button>
              ))}
              <button className="dropdown-add" onClick={()=>{onDisconnect();setShowSwitcher(false)}}>
                <Plus size={12}/> 添加/管理路由器
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
            {FIXED_NAV.map(({ path, label, icon }) => (
              <NavLink key={path} to={`/${path}`}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                title={collapsed ? label : undefined}>
                {icon}
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

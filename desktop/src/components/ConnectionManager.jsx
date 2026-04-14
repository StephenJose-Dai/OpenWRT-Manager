import React, { useState, useEffect, useCallback } from 'react'
import { OpenWrtClient, LANScanner, RouterManager, CaptchaGenerator, WebStorage } from '@shared/openwrt-client.js'

const mgr = new RouterManager(WebStorage)
let scanner = null

function isNewerVersion(remote, local) {
  const parse = v => (v || '').replace(/^v/, '').split('.').map(n => parseInt(n) || 0)
  const [rMaj, rMin, rPat] = parse(remote)
  const [lMaj, lMin, lPat] = parse(local)
  if (rMaj !== lMaj) return rMaj > lMaj
  if (rMin !== lMin) return rMin > lMin
  return rPat > lPat
}

// ── Bing 每日背景图 Hook ──────────────────────────────────
function useBingWallpaper() {
  const [bgUrl, setBgUrl] = useState('')
  useEffect(() => {
    // 从 Bing API 获取今日图片（通过 cors-proxy 绕过跨域）
    const urls = [
      'https://bing.biturl.top/?resolution=1920&format=json&index=0&mkt=zh-CN',
      'https://api.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN',
    ]
    fetch(urls[0])
      .then(r => r.json())
      .then(d => { if (d.url) setBgUrl(d.url) })
      .catch(() => {
        // fallback: 直接用 Bing 已知的格式
        const date = new Date()
        setBgUrl(`https://www.bing.com/th?id=OHR.${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}_ZH-CN_1920x1080.jpg`)
      })
  }, [])
  return bgUrl
}

// ── About 弹窗 ────────────────────────────────────────────
function AboutModal({ version, onClose }) {
  const open = u => u && window.electron?.openExternal(u)
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>关于 OpenWrt Manager</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="about-logo">
            <img src="./assets/icon.png" width="72" height="72" style={{borderRadius:12}} alt="logo" onError={e=>e.target.style.display='none'}/>
          </div>
          <div className="about-name">OpenWrt Manager</div>
          <div className="about-version">版本 {version || '1.0.0'}</div>
          <div className="about-desc">无后端直连 OpenWrt 路由器管理工具<br/>通过 ubus HTTP JSON-RPC 直连路由器，无需服务器</div>
          <div className="about-links">
            <button className="about-link-btn" onClick={()=>open('https://github.com/YOUR_USERNAME/openwrt-manager')}>🔗 GitHub 项目地址</button>
            <button className="about-link-btn" onClick={()=>open('https://github.com/YOUR_USERNAME/openwrt-manager/issues')}>🐛 反馈问题 / 功能建议</button>
            <button className="about-link-btn" onClick={()=>open('https://github.com/YOUR_USERNAME/openwrt-manager/releases')}>📦 查看所有版本</button>
          </div>
          <div className="about-footer">MIT License · OpenWrt Manager Contributors</div>
        </div>
      </div>
    </div>
  )
}

// ── 更新弹窗 ──────────────────────────────────────────────
function UpdateModal({ currentVersion, updateInfo, checking, onClose, onCheck }) {
  const open = u => u && window.electron?.openExternal(u)
  const hasUpdate = updateInfo && isNewerVersion(updateInfo.tag, currentVersion)
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>检查更新</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="update-current">当前版本：v{currentVersion || '1.0.0'}</div>
          {checking && <div className="update-checking">⟳ 正在检查...</div>}
          {!checking && !updateInfo && <div className="update-msg">无法获取更新信息，请检查网络</div>}
          {!checking && updateInfo && !hasUpdate && <div className="update-ok">✓ 已是最新版本（{updateInfo.tag}）</div>}
          {!checking && updateInfo && hasUpdate && (
            <div className="update-new">
              <div className="update-new-tag">🎉 发现新版本：{updateInfo.tag}</div>
              {updateInfo.body && <div className="update-new-body">{updateInfo.body.substring(0, 400)}</div>}
              {updateInfo.url && <button className="btn-primary" style={{marginTop:12}} onClick={()=>open(updateInfo.url)}>前往下载新版本</button>}
            </div>
          )}
          <button className="about-link-btn" style={{marginTop:12}} onClick={onCheck} disabled={checking}>
            🔄 {checking ? '检查中...' : '重新检查'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 自定义标题栏 ──────────────────────────────────────────
function TitleBar({ version, onAbout, onUpdate, transparent = false, onBack = null }) {
  return (
    <div className="titlebar" style={{
      WebkitAppRegion: 'drag',
      background: transparent ? 'rgba(13,17,23,0.4)' : undefined,
      backdropFilter: transparent ? 'blur(8px)' : undefined,
    }}>
      <div className="titlebar-left" style={{display:'flex',alignItems:'center',gap:6,WebkitAppRegion:'no-drag'}}>
        {onBack && (
          <button onClick={onBack} style={{
            background:'rgba(255,255,255,0.1)',
            border:'1px solid rgba(255,255,255,0.15)', borderRadius:5,
            color:'rgba(255,255,255,0.85)', cursor:'pointer',
            padding:'3px 10px', fontSize:12, flexShrink:0,
            display:'flex', alignItems:'center', gap:4
          }}>← 返回</button>
        )}
        <img src="./assets/icon.png" width="14" height="14" style={{borderRadius:3,flexShrink:0}} alt="" onError={e=>e.target.style.display='none'}/>
        <span style={{WebkitAppRegion:'drag',cursor:'default'}}>OpenWrt Manager</span>
        {version && <span style={{fontSize:10,color:'rgba(255,255,255,0.3)',marginLeft:4,WebkitAppRegion:'drag'}}>v{version}</span>}
      </div>
      <div className="titlebar-right" style={{WebkitAppRegion:'no-drag'}}>
        <button className="titlebar-menu-btn" onClick={onUpdate} title="检查更新">↑</button>
        <button className="titlebar-menu-btn" onClick={onAbout}  title="关于">?</button>
        <button className="titlebar-ctrl-btn" onClick={()=>window.electron?.minimize()}>─</button>
        <button className="titlebar-ctrl-btn" onClick={()=>window.electron?.maximize()}>□</button>
        <button className="titlebar-ctrl-btn close" onClick={()=>window.electron?.close()}>✕</button>
      </div>
    </div>
  )
}

// ── 快速连接弹窗 ──────────────────────────────────────────
function QuickConnectModal({ host, port: initPort = 80, https: initHttps = false, onConnect, onClose }) {
  const [proto,   setProto]   = useState('http')
  const [port,    setPort]    = useState(80)
  const [user,    setUser]    = useState('root')
  const [pass,    setPass]    = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const handleProto = p => { setProto(p); setPort(p==='https'?443:80) }

  const connect = async () => {
    if (!pass) { setError('请输入密码'); return }
    setLoading(true); setError('')
    try {
      const client = new OpenWrtClient({ host, port:+port, https:proto==='https', username:user, password:pass, fetcher:window.fetch.bind(window) })
      await client.login()
      onConnect(client, { host, port:+port, https:proto==='https', username:user, password:pass })
    } catch(e) { setError(e.message||'连接失败') }
    setLoading(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <h2>连接路由器</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{textAlign:'left'}}>
          <div style={{fontFamily:'monospace',fontSize:13,color:'#22c55e',background:'#0e2a1e',borderRadius:6,padding:'6px 12px',marginBottom:14}}>
            {proto}://{host}{(proto==='http'&&port===80)||(proto==='https'&&port===443)?'':':'+port}
          </div>
          {error && <div style={{color:'#f87171',fontSize:13,marginBottom:10}}>⚠ {error}</div>}
          <div style={{display:'flex',gap:6,marginBottom:10}}>
            <select value={proto} onChange={e=>handleProto(e.target.value)} style={{width:85,background:'var(--bg)',border:'1px solid var(--border)',borderRadius:6,color:'var(--text)',padding:'6px 8px',fontSize:12}}>
              <option value="http">HTTP</option>
              <option value="https">HTTPS</option>
            </select>
            <input type="number" value={port} onChange={e=>setPort(+e.target.value)} style={{width:70,background:'var(--bg)',border:'1px solid var(--border)',borderRadius:6,color:'var(--text)',padding:'6px 8px',fontSize:12}}/>
            <input value={user} onChange={e=>setUser(e.target.value)} placeholder="用户名" style={{flex:1,background:'var(--bg)',border:'1px solid var(--border)',borderRadius:6,color:'var(--text)',padding:'6px 8px',fontSize:12}}/>
          </div>
          <div style={{display:'flex',gap:6,marginBottom:14}}>
            <input type={showPwd?'text':'password'} value={pass} onChange={e=>setPass(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&connect()} placeholder="路由器密码" autoFocus
              style={{flex:1,background:'var(--bg)',border:'1px solid var(--border)',borderRadius:6,color:'var(--text)',padding:'6px 8px',fontSize:12}}/>
            <button onClick={()=>setShowPwd(v=>!v)} style={{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:6,color:'var(--muted)',padding:'0 10px',fontSize:12,cursor:'pointer'}}>
              {showPwd?'隐藏':'显示'}
            </button>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={onClose} className="btn-ghost" style={{flex:1}}>取消</button>
            <button onClick={connect} className="btn-primary" style={{flex:2}} disabled={loading}>
              {loading?'连接中...':'连接'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 路由器卡片 ────────────────────────────────────────────
function RouterCard({ config, connecting, onConnect, onDelete }) {
  const [showPwd, setShowPwd] = useState(false)
  const [pwd, setPwd]         = useState('')

  return (
    <div className={`router-card ${connecting?'connecting':''}`}>
      <div className="router-card-main" onClick={() => config.rememberPassword && config.password ? onConnect(config.password) : setShowPwd(true)}>
        <div className="router-icon-wrap">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="2" width="20" height="8" rx="2"/><path d="M6 6h.01M10 6h.01"/>
          </svg>
        </div>
        <div className="router-info">
          <strong>{config.label||config.host}</strong>
          <span>{config.https?'https':'http'}://{config.host}{((config.https&&+config.port===443)||(!config.https&&+config.port===80))?'':`:${config.port}`}</span>
          <span className="router-meta">{config.username}{config.rememberPassword?' · 已记住密码':' · 每次输入密码'}</span>
        </div>
        {connecting ? <span style={{color:'#4f8ef7',fontSize:13}}>连接中...</span> : <span style={{color:'#8b949e',fontSize:16}}>→</span>}
        <button className="router-remove" onClick={e=>{e.stopPropagation();onDelete()}}>✕</button>
      </div>
      {showPwd && (
        <div className="router-pwd-row">
          <div className="pwd-field" style={{flex:1}}>
            <input type="password" placeholder="输入密码" value={pwd} autoFocus
              onChange={e=>setPwd(e.target.value)} onKeyDown={e=>e.key==='Enter'&&pwd&&onConnect(pwd)}/>
          </div>
          <button className="btn-connect-sm" onClick={()=>pwd&&onConnect(pwd)}>连接</button>
          <button className="btn-ghost" style={{padding:'5px 10px',fontSize:12}} onClick={()=>{setShowPwd(false);setPwd('')}}>取消</button>
        </div>
      )}
    </div>
  )
}

// ── 添加路由器表单 ────────────────────────────────────────
function AddForm({ prefillHost, onSaved, onCancel }) {
  const [proto,       setProto]       = useState('http')
  const [host,        setHost]        = useState(prefillHost||'')
  const [port,        setPort]        = useState(80)
  const [username,    setUsername]    = useState('root')
  const [password,    setPassword]    = useState('')
  const [label,       setLabel]       = useState('')
  const [rememberPwd, setRememberPwd] = useState(true)
  const [autoLogin,   setAutoLogin]   = useState(false)
  const [captchaVal,  setCaptchaVal]  = useState('')
  const [captchaCode, setCaptchaCode] = useState('')
  const [captchaImg,  setCaptchaImg]  = useState('')
  const [testing,     setTesting]     = useState(false)
  const [testResult,  setTestResult]  = useState('')
  const [errors,      setErrors]      = useState({})
  const [saving,      setSaving]      = useState(false)
  const [showPwd,     setShowPwd]     = useState(false)
  const [ignoreSSL,   setIgnoreSSL]   = useState(false)

  const handleProto = p => { setProto(p); setPort(p==='https'?443:80) }

  const refreshCaptcha = useCallback(() => {
    try {
      const gen = new CaptchaGenerator(130, 42)
      const code = gen.generateCode(5)
      setCaptchaCode(code); setCaptchaImg(gen.drawToDataURL(code)); setCaptchaVal('')
    } catch {
      const code = Math.random().toString(36).slice(2,7).toUpperCase()
      setCaptchaCode(code); setCaptchaImg(''); setCaptchaVal('')
    }
  }, [])

  useEffect(() => { refreshCaptcha() }, [refreshCaptcha])

  const testConnect = async () => {
    if (!host) { setErrors(e=>({...e,host:'请填写地址'})); return }
    setTesting(true); setTestResult('')
    window.electron?.setSSLIgnore?.(ignoreSSL)
    try {
      const c = new OpenWrtClient({host,port:+port,https:proto==='https',username,password,fetcher:window.fetch.bind(window)})
      await c.login(); setTestResult('ok')
    } catch(e) { setTestResult('fail:' + (() => {
        const m = e.message||'连接失败';
        if (m.includes('fetch')||m.includes('Failed')) return '无法访问路由器。请确认：① IP端口正确 ② 路由器执行过 uci set uhttpd.main.ubus_cors=1 && uci commit uhttpd && /etc/init.d/uhttpd restart';
        if (m.includes('超时')||m.includes('abort')) return '连接超时，请检查IP和端口';
        return m;
      })()) }
    setTesting(false)
  }

  const save = async () => {
    const errs = {}
    if (!host)     errs.host     = '请填写路由器地址'
    if (!password) errs.password = '请填写密码'
    if (captchaCode && captchaVal.toLowerCase()!==captchaCode.toLowerCase()) {
      errs.captcha = '验证码错误'; refreshCaptcha()
    }
    setErrors(errs)
    if (Object.keys(errs).length) return
    setSaving(true)
    window.electron?.setSSLIgnore?.(ignoreSSL)
    try {
      const c = new OpenWrtClient({host,port:+port,https:proto==='https',username,password,fetcher:window.fetch.bind(window)})
      await c.login()
      const id = await mgr.addRouter({label:label||host,host,port:+port,https:proto==='https',username,password:rememberPwd?password:'',rememberPassword:rememberPwd,autoLogin})
      onSaved(id, {password, autoLogin})
    } catch(e) { setErrors(ev=>({...ev,general:e.message||'连接失败，请检查地址和密码'})) }
    setSaving(false)
  }

  return (
    <div className="add-form-wrap">
      <div className="add-form-header">
        <button className="btn-back" onClick={onCancel}>← 返回</button>
        <h2>添加路由器</h2>
      </div>
      {errors.general && <div style={{background:'#2a1010',border:'1px solid #7f1d1d',borderRadius:8,padding:'10px 14px',color:'#f87171',fontSize:13,marginBottom:14}}>⚠ {errors.general}</div>}
      <div className="add-form">
        <label><span>显示名称</span><input placeholder="如：家里的路由器" value={label} onChange={e=>setLabel(e.target.value)}/></label>
        <label className={errors.host?'error':''}>
          <span>路由器地址 <em>*</em></span>
          <div className="input-row" style={{flexWrap:'nowrap',gap:6}}>
            <select value={proto} onChange={e=>handleProto(e.target.value)} style={{width:88,flex:'none',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:6,color:'var(--text)',padding:'6px 8px',fontSize:13}}>
              <option value="http">HTTP</option>
              <option value="https">HTTPS</option>
            </select>
            <input style={{flex:1,minWidth:0}} placeholder="192.168.1.1 或域名" value={host} onChange={e=>setHost(e.target.value)}/>
            <input type="number" value={port} onChange={e=>setPort(+e.target.value)} style={{width:68,flex:'none'}}/>
          </div>
          <span style={{fontSize:11,color:'var(--dim)',marginTop:3,display:'block'}}>
            {proto}://{host||'IP或域名'}{(proto==='http'&&+port===80)||(proto==='https'&&+port===443)?'':':'+port}/ubus
          </span>
          {errors.host && <span className="err-msg">{errors.host}</span>}
        </label>

        {proto === 'https' && (
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
            background:'#161d2a',border:'1px solid #2a3548',borderRadius:8,
            padding:'10px 14px',marginBottom:2}}>
            <div>
              <div style={{fontSize:13,fontWeight:500}}>忽略 SSL 证书错误</div>
              <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>使用自签名证书或证书已过期时开启</div>
            </div>
            <label style={{position:'relative',display:'inline-block',width:40,height:22,cursor:'pointer',flexShrink:0,marginLeft:14}}>
              <input type="checkbox" checked={ignoreSSL} onChange={e=>setIgnoreSSL(e.target.checked)} style={{opacity:0,width:0,height:0}}/>
              <span style={{position:'absolute',inset:0,borderRadius:11,background:ignoreSSL?'#f59e0b':'#30363d',transition:'.25s'}}>
                <span style={{position:'absolute',width:16,height:16,borderRadius:'50%',background:'#fff',top:3,left:ignoreSSL?21:3,transition:'.25s'}}/>
              </span>
            </label>
          </div>
        )}
        <label><span>用户名</span><input value={username} onChange={e=>setUsername(e.target.value)}/></label>
        <label className={errors.password?'error':''}>
          <span>密码 <em>*</em></span>
          <div className="pwd-field">
            <input type={showPwd?'text':'password'} placeholder="路由器登录密码" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&save()}/>
            <button onClick={()=>setShowPwd(v=>!v)}>{showPwd?'隐藏':'显示'}</button>
          </div>
          {errors.password && <span className="err-msg">{errors.password}</span>}
        </label>
        <div className="test-row">
          <button className="btn-test" onClick={testConnect} disabled={testing}>{testing?'测试中...':'测试连接'}</button>
          {testResult==='ok' && <span className="test-ok">✓ 连接成功</span>}
          {testResult.startsWith('fail:') && <span className="test-fail">✗ {testResult.slice(5)}</span>}
        </div>
        <label className={errors.captcha?'error':''}>
          <span>验证码 <em>*</em></span>
          <div className="captcha-row">
            {captchaImg ? (
              <img src={captchaImg} className={`captcha-img ${errors.captcha?'shake':''}`} onClick={refreshCaptcha} title="点击刷新" alt="captcha"/>
            ) : (
              <div onClick={refreshCaptcha} style={{width:130,height:42,background:'#1e2530',borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,fontWeight:700,color:'#4f8ef7',letterSpacing:6,cursor:'pointer',border:'1px solid var(--border)'}}>{captchaCode}</div>
            )}
            <input placeholder="输入验证码" value={captchaVal} onChange={e=>setCaptchaVal(e.target.value)} maxLength={6}/>
          </div>
          {errors.captcha && <span className="err-msg">{errors.captcha}</span>}
          <span className="captcha-hint">点击验证码可刷新</span>
        </label>
        <div className="checkbox-group">
          <label className="checkbox-label">
            <input type="checkbox" checked={rememberPwd} onChange={e=>{setRememberPwd(e.target.checked);if(!e.target.checked)setAutoLogin(false)}}/>记住密码
          </label>
          <label className="checkbox-label" style={{opacity:rememberPwd?1:0.4}}>
            <input type="checkbox" checked={autoLogin} onChange={e=>setAutoLogin(e.target.checked)} disabled={!rememberPwd}/>自动登录 <em>（下次打开自动连接）</em>
          </label>
        </div>
        <details style={{marginBottom:8,background:'#161b22',border:'1px solid #21262d',borderRadius:8,padding:'8px 12px',fontSize:12,color:'#8b949e'}}>
          <summary style={{cursor:'pointer',color:'#58a6ff',userSelect:'none',listStyle:'none',display:'flex',alignItems:'center',gap:6}}>⚙ 连不上？点此查看路由器端必要配置</summary>
          <div style={{marginTop:8,lineHeight:1.8,fontFamily:'monospace',fontSize:11}}>
            <div style={{color:'#f0883e',marginBottom:4}}>在路由器 SSH 或 LuCI 终端执行：</div>
            <div style={{background:'#0d1117',padding:'8px 10px',borderRadius:6,marginBottom:8,color:'#7ee787'}}>
              opkg update && opkg install rpcd-mod-file luci-mod-rpc<br/>
              uci set uhttpd.main.ubus_cors=1 && uci commit uhttpd<br/>
              /etc/init.d/rpcd restart && /etc/init.d/uhttpd restart
            </div>
            <div>① rpcd-mod-file：终端执行权限 ② luci-mod-rpc：设备列表 ③ ubus_cors=1：允许跨域（必须）</div>
          </div>
        </details>
        <div className="form-btns">
          <button className="btn-cancel" onClick={onCancel}>取消</button>
          <button className="btn-save" onClick={save} disabled={saving}>{saving?'连接中...':'保存并连接'}</button>
        </div>
      </div>
    </div>
  )
}

// ── 主组件 ────────────────────────────────────────────────
export default function ConnectionManager({ onConnected, onBack = null }) {
  const [view,         setView]         = useState('home')
  const [routers,      setRouters]      = useState([])
  const [found,        setFound]        = useState([])
  const [scanning,     setScanning]     = useState(false)
  const [activeId,     setActiveId]     = useState(null)
  const [error,        setError]        = useState('')
  const [showAbout,    setShowAbout]    = useState(false)
  const [showUpdate,   setShowUpdate]   = useState(false)
  const [version,      setVersion]      = useState('')
  const [updateInfo,   setUpdateInfo]   = useState(null)
  const [checking,     setChecking]     = useState(false)
  const [allGWs,       setAllGWs]       = useState([])
  const [selectedGWs,  setSelectedGWs]  = useState([])
  const [manualSubnet, setManualSubnet] = useState('')
  const [quickConnect, setQuickConnect] = useState(null)
  const [gwLoading,    setGwLoading]    = useState(false)
  const bgUrl = useBingWallpaper()

  useEffect(() => {
    mgr.load().then(() => {
      const list = mgr.listRouters()
      setRouters(list)
      // 自动登录：找第一个 autoLogin=true 且有密码的路由器
      const autoR = list.find(r => r.autoLogin && r.password)
      if (autoR) {
        // 先设置 SSL 忽略状态，再连接
        window.electron?.setSSLIgnore?.(autoR.ignoreSSL || false)
        connectRouter(autoR.id, autoR.password)
      }
    })
    window.electron?.getVersion?.().then(v => setVersion(v)).catch(() => {})
    window.electron?.onCheckUpdate?.(() => { setShowUpdate(true); doCheckUpdate() })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const doCheckUpdate = useCallback(async () => {
    setChecking(true)
    try { setUpdateInfo(await window.electron?.checkUpdate?.() ?? null) }
    catch { setUpdateInfo(null) }
    setChecking(false)
  }, [])

  useEffect(() => {
    if (!version || !window.electron?.checkUpdate) return
    const t = setTimeout(async () => {
      try {
        const info = await window.electron.checkUpdate()
        if (info && isNewerVersion(info.tag, version)) { setUpdateInfo(info); setShowUpdate(true) }
      } catch {}
    }, 3000)
    return () => clearTimeout(t)
  }, [version])

  const connectRouter = useCallback(async (id, password) => {
    setActiveId(id); setError('')
    try {
      const cfg    = mgr.getConfig(id)
      // 通知主进程该连接是否需要忽略 SSL 证书
      window.electron?.setSSLIgnore?.(cfg.ignoreSSL || false)
      const client = new OpenWrtClient({...cfg, password, https:cfg.https||false, ignoreSSL:cfg.ignoreSSL||false, fetcher:window.fetch.bind(window)})
      await client.login()
      onConnected({ client, config:{...cfg, password}, manager:mgr })
    } catch(e) { setError(e.message||'连接失败') }
    setActiveId(null)
  }, [onConnected])

  const loadGateways = useCallback(async () => {
    setGwLoading(true)
    try {
      const gwInfo = await window.electron?.getGateways?.()
      let gws = gwInfo?.all ?? (Array.isArray(gwInfo) ? gwInfo : [])
      if (manualSubnet.trim()) {
        const p = manualSubnet.trim().replace(/\/$/, '')
        gws = [...new Set([p+'.1', p+'.254', ...gws])]
      }
      setAllGWs(gws); setSelectedGWs(gws)
    } catch { setAllGWs([]); setSelectedGWs([]) }
    setGwLoading(false)
  }, [manualSubnet])

  const startScan = useCallback(async () => {
    setScanning(true); setFound([])

    // 获取网关列表
    let hints = []
    try {
      const gwInfo = await window.electron?.getGateways?.()
      const gwList = gwInfo?.all ?? (Array.isArray(gwInfo) ? gwInfo : [])
      hints = [...gwList]
      if (gwList.length > 0) { setAllGWs(gwList); setSelectedGWs(gwList) }
    } catch {}

    if (manualSubnet.trim()) {
      const p = manualSubnet.trim().replace(/\/$/, '')
      hints = [...new Set([p+'.1', p+'.254', ...hints])]
    }

    // 加上常见默认地址兜底
    const defaults = ['192.168.1.1','192.168.0.1','192.168.31.1','192.168.100.1',
                      '10.0.0.1','10.0.1.1','172.16.0.1','172.16.1.1']
    hints = [...new Set([...hints, ...defaults])]

    // 用主进程代理探测（绕过 CORS），每批 8 个并发
    const batchSize = 8
    for (let i = 0; i < hints.length; i += batchSize) {
      const batch = hints.slice(i, i + batchSize)
      const results = await Promise.allSettled(
        batch.map(host =>
          window.electron?.ubusProbe
            ? window.electron.ubusProbe(host)
            : Promise.resolve(null)
        )
      )
      results.forEach((r, j) => {
        if (r.status === 'fulfilled' && r.value) {
          setFound(f => [...f, { host: batch[j], ...r.value }])
        }
      })
    }
    setScanning(false)
  }, [manualSubnet])

  if (view === 'add') {
    return (
      <div style={{height:'100vh',display:'flex',flexDirection:'column',
        background: bgUrl ? `url(${bgUrl}) center/cover no-repeat` : 'var(--bg)'}}>
        <TitleBar version={version} transparent={!!bgUrl}
          onAbout={()=>setShowAbout(true)}
          onUpdate={()=>{setShowUpdate(true);doCheckUpdate()}}
          onBack={onBack || (() => setView('home'))}/>
        <div style={{flex:1,overflow:'auto',display:'flex',alignItems:'center',justifyContent:'center',padding:24,
          background:bgUrl?'rgba(13,17,23,0.65)':undefined,backdropFilter:bgUrl?'blur(2px)':undefined}}>
          <div style={{width:'100%',maxWidth:520}}>
            <AddForm prefillHost="" onSaved={(id,cfg)=>{setRouters(mgr.listRouters());setView('home');if(cfg.autoLogin)connectRouter(id,cfg.password)}} onCancel={()=>setView('home')}/>
          </div>
        </div>
        {showAbout  && <AboutModal version={version} onClose={()=>setShowAbout(false)}/>}
        {showUpdate && <UpdateModal currentVersion={version} updateInfo={updateInfo} checking={checking} onClose={()=>setShowUpdate(false)} onCheck={doCheckUpdate}/>}
      </div>
    )
  }

  // ── 主页：全屏居中，大气布局 ─────────────────────────────
  return (
    <div style={{height:'100vh',display:'flex',flexDirection:'column',
      background: bgUrl ? `url(${bgUrl}) center/cover no-repeat` : 'var(--bg)'}}>
      <TitleBar version={version} transparent={!!bgUrl}
        onAbout={()=>setShowAbout(true)}
        onUpdate={()=>{setShowUpdate(true);doCheckUpdate()}}/>

      {/* 主内容：垂直居中 */}
      <div style={{
        flex:1, overflow:'auto',
        display:'flex', alignItems:'center', justifyContent:'center',
        padding:'24px 16px',
        background: bgUrl ? 'rgba(13,17,23,0.55)' : undefined,
        backdropFilter: bgUrl ? 'blur(3px)' : undefined,
      }}>
        <div style={{width:'100%',maxWidth:640}}>

          {/* Logo 区域 */}
          <div style={{textAlign:'center',marginBottom:32}}>
            <img src="./assets/icon.png" width="80" height="80" style={{borderRadius:16,marginBottom:12}} alt="logo" onError={e=>e.target.style.display='none'}/>
            <h1 style={{fontSize:28,fontWeight:700,margin:0,letterSpacing:'-0.5px'}}>OpenWrt Manager</h1>
            <p style={{fontSize:14,color:'rgba(255,255,255,0.5)',marginTop:6}}>路由器管理工具</p>
          </div>

          {error && (
            <div style={{background:'rgba(248,81,73,0.15)',border:'1px solid rgba(248,81,73,0.3)',borderRadius:10,padding:'10px 14px',color:'#f87171',fontSize:13,marginBottom:16}}>
              ⚠ {error}
            </div>
          )}

          {/* 已保存的路由器 */}
          {routers.length > 0 && (
            <div style={{background:'rgba(22,27,34,0.85)',border:'1px solid rgba(48,54,61,0.6)',borderRadius:14,padding:20,marginBottom:16,backdropFilter:'blur(12px)'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                <h2 style={{fontSize:13,fontWeight:600,color:'rgba(255,255,255,0.5)',textTransform:'uppercase',letterSpacing:'0.5px',margin:0}}>已保存的路由器</h2>
                <button className="btn-add-more" onClick={()=>setView('add')}>＋ 添加</button>
              </div>
              <div className="router-list">
                {routers.map(r=>(
                  <RouterCard key={r.id} config={r} connecting={activeId===r.id}
                    onConnect={pwd=>connectRouter(r.id,pwd)}
                    onDelete={()=>{mgr.removeRouter(r.id);setRouters(mgr.listRouters())}}/>
                ))}
              </div>
            </div>
          )}

          {/* 局域网扫描 */}
          <div style={{background:'rgba(22,27,34,0.85)',border:'1px solid rgba(48,54,61,0.6)',borderRadius:14,padding:20,backdropFilter:'blur(12px)'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
              <h2 style={{fontSize:13,fontWeight:600,color:'rgba(255,255,255,0.5)',textTransform:'uppercase',letterSpacing:'0.5px',margin:0}}>局域网自动发现</h2>
              <div style={{display:'flex',gap:8}}>
                <button className="btn-ghost" onClick={loadGateways} disabled={gwLoading} style={{fontSize:12,padding:'5px 12px'}}>
                  {gwLoading?'检测中...':'检测网关'}
                </button>
                <button className="btn-scan" onClick={startScan} disabled={scanning}>
                  {scanning?'扫描中...':'开始扫描'}
                </button>
              </div>
            </div>

            {/* 网关选择 */}
            <div style={{marginBottom:12}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                <input className="manual-subnet-input" style={{flex:1}}
                  placeholder="指定网段（可选）如 192.168.123 或 10.8.0"
                  value={manualSubnet} onChange={e=>setManualSubnet(e.target.value)}/>
              </div>
              {allGWs.length > 0 && (
                <div>
                  <div style={{fontSize:11,color:'rgba(255,255,255,0.35)',marginBottom:6}}>选择要扫描的网关：</div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                    {allGWs.map(gw => {
                      const checked = selectedGWs.includes(gw)
                      return (
                        <label key={gw} style={{display:'flex',alignItems:'center',gap:5,padding:'4px 10px',
                          background:checked?'rgba(79,142,247,0.15)':'rgba(33,38,45,0.8)',
                          border:`1px solid ${checked?'rgba(79,142,247,0.5)':'rgba(48,54,61,0.6)'}`,
                          borderRadius:6,cursor:'pointer',fontSize:12,fontFamily:'monospace',
                          color:checked?'#4f8ef7':'rgba(255,255,255,0.45)'}}>
                          <input type="checkbox" checked={checked} style={{margin:0,accentColor:'#4f8ef7'}}
                            onChange={()=>setSelectedGWs(prev=>checked?prev.filter(x=>x!==gw):[...prev,gw])}/>
                          {gw}
                        </label>
                      )
                    })}
                  </div>
                  <div style={{fontSize:11,color:'rgba(255,255,255,0.25)',marginTop:4}}>已选 {selectedGWs.length}/{allGWs.length} 个</div>
                </div>
              )}
            </div>

            {scanning && (
              <div style={{textAlign:'center',padding:'16px 0',color:'rgba(255,255,255,0.5)',fontSize:13}}>
                <div style={{marginBottom:8}}>⟳ 正在探测 OpenWrt 路由器...</div>
                <div style={{fontSize:11,color:'rgba(255,255,255,0.3)'}}>扫描 {selectedGWs.length||'默认'} 个地址</div>
              </div>
            )}

            {/* 扫描结果 - 漂亮的卡片样式 */}
            {found.length > 0 && (
              <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:8}}>
                {found.map(item => (
                  <div key={item.host} style={{
                    display:'flex',alignItems:'center',gap:12,
                    background:'rgba(34,197,94,0.08)',
                    border:'1px solid rgba(34,197,94,0.25)',
                    borderRadius:10,padding:'12px 16px',cursor:'pointer',
                    transition:'all .15s',
                  }}
                  onMouseEnter={e=>e.currentTarget.style.background='rgba(34,197,94,0.15)'}
                  onMouseLeave={e=>e.currentTarget.style.background='rgba(34,197,94,0.08)'}
                  onClick={()=>setQuickConnect({host:item.host})}>
                    <div style={{width:8,height:8,background:'#22c55e',borderRadius:'50%',flexShrink:0,boxShadow:'0 0 6px #22c55e'}}/>
                    <div style={{flex:1}}>
                      <div style={{fontFamily:'monospace',fontSize:14,fontWeight:600,color:'#e6edf3'}}>{item.host}</div>
                      <div style={{fontSize:11,color:'rgba(255,255,255,0.4)',marginTop:2}}>
                        {item.isOpenWrt ? '✓ OpenWrt 路由器' : '有响应的设备'}
                      </div>
                    </div>
                    <button style={{
                      background:'linear-gradient(135deg,#4f8ef7,#7c5af7)',
                      border:'none',borderRadius:8,color:'#fff',
                      padding:'7px 16px',fontSize:13,cursor:'pointer',fontWeight:500,
                      boxShadow:'0 2px 8px rgba(79,142,247,0.4)'
                    }}>连接</button>
                  </div>
                ))}
              </div>
            )}

            {!scanning && found.length === 0 && (
              <div style={{textAlign:'center',padding:'8px 0',color:'rgba(255,255,255,0.3)',fontSize:13}}>
                {allGWs.length===0 ? '点击"检测网关"获取本机网关，再点"开始扫描"' : '未发现路由器，请确认路由器已配置 ubus_cors=1'}
              </div>
            )}
          </div>

          {/* 手动添加按钮（无保存路由器时显示） */}
          {routers.length === 0 && (
            <button onClick={()=>setView('add')} style={{
              width:'100%',marginTop:16,padding:'14px',
              background:'rgba(22,27,34,0.85)',backdropFilter:'blur(12px)',
              border:'1px dashed rgba(48,54,61,0.6)',borderRadius:14,
              color:'rgba(255,255,255,0.45)',fontSize:14,cursor:'pointer',
              transition:'all .15s',
            }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(79,142,247,0.5)';e.currentTarget.style.color='#4f8ef7'}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(48,54,61,0.6)';e.currentTarget.style.color='rgba(255,255,255,0.45)'}}>
              ＋ 手动添加路由器
            </button>
          )}
        </div>
      </div>

      {quickConnect && (
        <QuickConnectModal host={quickConnect.host} port={quickConnect.port} https={quickConnect.https}
          onConnect={(client,config)=>{setQuickConnect(null);onConnected({client,config,manager:mgr})}}
          onClose={()=>setQuickConnect(null)}/>
      )}
      {showAbout  && <AboutModal version={version} onClose={()=>setShowAbout(false)}/>}
      {showUpdate && <UpdateModal currentVersion={version} updateInfo={updateInfo} checking={checking} onClose={()=>setShowUpdate(false)} onCheck={doCheckUpdate}/>}
    </div>
  )
}

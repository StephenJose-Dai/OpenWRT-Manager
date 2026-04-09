import React, { useState, useEffect, useCallback, useRef } from 'react';
import { OpenWrtClient, LANScanner, RouterManager, CaptchaGenerator, WebStorage } from '@shared/openwrt-client.js';

const mgr     = new RouterManager(WebStorage);
let   scanner = null;

// ── 语义化版本比较 ────────────────────────────────────────
// 返回 true 如果 remote > local
function isNewerVersion(remote, local) {
  const parse = v => (v || '').replace(/^v/, '').split('.').map(n => parseInt(n) || 0);
  const [rMaj, rMin, rPat] = parse(remote);
  const [lMaj, lMin, lPat] = parse(local);
  if (rMaj !== lMaj) return rMaj > lMaj;
  if (rMin !== lMin) return rMin > lMin;
  return rPat > lPat;
}

// ── 关于弹窗 ──────────────────────────────────────────────
function AboutModal({ version, onClose }) {
  const open = (url) => { if (url) window.electron?.openExternal(url); };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>关于 OpenWrt Manager</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="about-logo">
            <img src="./assets/icon.png" width="72" height="72"
              style={{borderRadius:12}} alt="logo"
              onError={e => e.target.style.display='none'} />
          </div>
          <div className="about-name">OpenWrt Manager</div>
          <div className="about-version">版本 {version || '1.0.0'}</div>
          <div className="about-desc">
            无后端直连 OpenWrt 路由器管理工具<br/>
            通过 ubus HTTP JSON-RPC 直连路由器，无需服务器
          </div>
          <div className="about-links">
            <button className="about-link-btn"
              onClick={() => open('https://github.com/YOUR_USERNAME/openwrt-manager')}>
              🔗 GitHub 项目地址
            </button>
            <button className="about-link-btn"
              onClick={() => open('https://github.com/YOUR_USERNAME/openwrt-manager/issues')}>
              🐛 反馈问题 / 功能建议
            </button>
            <button className="about-link-btn"
              onClick={() => open('https://github.com/YOUR_USERNAME/openwrt-manager/releases')}>
              📦 查看所有版本
            </button>
          </div>
          <div className="about-footer">MIT License · OpenWrt Manager Contributors</div>
        </div>
      </div>
    </div>
  );
}

// ── 更新弹窗 ──────────────────────────────────────────────
function UpdateModal({ currentVersion, updateInfo, checking, onClose, onCheck }) {
  const open = (url) => { if (url) window.electron?.openExternal(url); };
  const hasUpdate = updateInfo && isNewerVersion(updateInfo.tag, currentVersion);
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
          {!checking && !updateInfo && (
            <div className="update-msg">无法获取更新信息，请检查网络</div>
          )}
          {!checking && updateInfo && !hasUpdate && (
            <div className="update-ok">✓ 已是最新版本（{updateInfo.tag}）</div>
          )}
          {!checking && updateInfo && hasUpdate && (
            <div className="update-new">
              <div className="update-new-tag">🎉 发现新版本：{updateInfo.tag}</div>
              {updateInfo.body && (
                <div className="update-new-body">{updateInfo.body.substring(0, 400)}</div>
              )}
              {updateInfo.url && (
                <button className="btn-primary" style={{marginTop:12}}
                  onClick={() => open(updateInfo.url)}>
                  前往下载新版本
                </button>
              )}
            </div>
          )}
          <button className="about-link-btn" style={{marginTop:12}} onClick={onCheck}
            disabled={checking}>
            🔄 {checking ? '检查中...' : '重新检查'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 自定义标题栏 ─────────────────────────────────────────
function TitleBar({ version, onAbout, onUpdate }) {
  return (
    <div className="titlebar" style={{WebkitAppRegion:'drag'}}>
      <div className="titlebar-left">
        <img src="./assets/icon.png" width="16" height="16"
          style={{borderRadius:3,flexShrink:0}} alt=""
          onError={e => e.target.style.display='none'} />
        <span>OpenWrt Manager</span>
        {version && <span style={{fontSize:10,color:'#484f58',marginLeft:4}}>v{version}</span>}
      </div>
      <div className="titlebar-right" style={{WebkitAppRegion:'no-drag'}}>
        <button className="titlebar-menu-btn" onClick={onUpdate} title="检查更新">↑</button>
        <button className="titlebar-menu-btn" onClick={onAbout}  title="关于">?</button>
        <button className="titlebar-ctrl-btn" onClick={() => window.electron?.minimize()}>─</button>
        <button className="titlebar-ctrl-btn" onClick={() => window.electron?.maximize()}>□</button>
        <button className="titlebar-ctrl-btn close" onClick={() => window.electron?.close()}>✕</button>
      </div>
    </div>
  );
}

// ── 快速连接弹窗（扫描结果点击用）────────────────────────
function QuickConnectModal({ host, onConnect, onClose }) {
  const [proto,    setProto]    = useState('http');
  const [port,     setPort]     = useState(80);
  const [username, setUsername] = useState('root');
  const [password, setPassword] = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const handleProto = (p) => {
    setProto(p);
    setPort(p === 'https' ? 443 : 80);
  };

  const connect = async () => {
    if (!password) { setError('请输入密码'); return; }
    setLoading(true); setError('');
    try {
      const client = new OpenWrtClient({
        host, port: +port, https: proto === 'https',
        username, password, fetcher: window.fetch.bind(window)
      });
      await client.login();
      onConnect(client, { host, port: +port, https: proto === 'https', username, password });
    } catch(e) {
      setError(e.message || '连接失败');
    }
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>连接路由器</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{textAlign:'left'}}>
          <div style={{fontFamily:'monospace',fontSize:13,color:'#22c55e',
            background:'#0e2a1e',borderRadius:6,padding:'6px 12px',marginBottom:14}}>
            {proto}://{host}{(proto==='http'&&port===80)||(proto==='https'&&port===443)?'':':'+port}
          </div>

          {error && <div style={{color:'#f87171',fontSize:13,marginBottom:10}}>⚠ {error}</div>}

          <div style={{display:'flex',gap:6,marginBottom:10}}>
            <select value={proto} onChange={e => handleProto(e.target.value)}
              style={{width:85,background:'var(--bg)',border:'1px solid var(--border)',
                borderRadius:6,color:'var(--text)',padding:'6px 8px',fontSize:12}}>
              <option value="http">HTTP</option>
              <option value="https">HTTPS</option>
            </select>
            <input type="number" value={port} onChange={e => setPort(+e.target.value)}
              style={{width:70,background:'var(--bg)',border:'1px solid var(--border)',
                borderRadius:6,color:'var(--text)',padding:'6px 8px',fontSize:12}} />
            <input value={username} onChange={e => setUsername(e.target.value)}
              placeholder="用户名" style={{flex:1,background:'var(--bg)',border:'1px solid var(--border)',
                borderRadius:6,color:'var(--text)',padding:'6px 8px',fontSize:12}} />
          </div>

          <div style={{display:'flex',gap:6,marginBottom:14}}>
            <input type={showPwd ? 'text' : 'password'}
              value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && connect()}
              placeholder="路由器密码" autoFocus
              style={{flex:1,background:'var(--bg)',border:'1px solid var(--border)',
                borderRadius:6,color:'var(--text)',padding:'6px 8px',fontSize:12}} />
            <button onClick={() => setShowPwd(v=>!v)}
              style={{background:'var(--bg3)',border:'1px solid var(--border)',
                borderRadius:6,color:'var(--muted)',padding:'0 10px',fontSize:12,cursor:'pointer'}}>
              {showPwd ? '隐藏' : '显示'}
            </button>
          </div>

          <div style={{display:'flex',gap:8}}>
            <button onClick={onClose} className="btn-ghost" style={{flex:1}}>取消</button>
            <button onClick={connect} className="btn-primary" style={{flex:2}}
              disabled={loading}>
              {loading ? '连接中...' : '连接'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 路由器卡片 ───────────────────────────────────────────
function RouterCard({ config, connecting, onConnect, onDelete }) {
  const [showPwd, setShowPwd] = useState(false);
  const [pwd, setPwd]         = useState('');

  const handleConnect = () => {
    if (config.rememberPassword && config.password) {
      onConnect(config.password);
    } else {
      setShowPwd(true);
    }
  };

  return (
    <div className={`router-card ${connecting ? 'connecting' : ''}`}>
      <div className="router-card-main" onClick={handleConnect}>
        <div className="router-icon-wrap">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2">
            <rect x="2" y="2" width="20" height="8" rx="2"/>
            <path d="M6 6h.01M10 6h.01"/>
          </svg>
        </div>
        <div className="router-info">
          <strong>{config.label || config.host}</strong>
          <span>
            {config.https ? 'https' : 'http'}://{config.host}
            {((config.https && +config.port === 443) || (!config.https && +config.port === 80))
              ? '' : `:${config.port}`}
          </span>
          <span className="router-meta">
            {config.username}
            {config.rememberPassword ? ' · 已记住密码' : ' · 每次输入密码'}
          </span>
        </div>
        {connecting
          ? <span style={{color:'#4f8ef7',fontSize:13}}>连接中...</span>
          : <span style={{color:'#8b949e',fontSize:16}}>→</span>
        }
        <button className="router-remove" title="删除"
          onClick={e => { e.stopPropagation(); onDelete(); }}>✕</button>
      </div>
      {showPwd && (
        <div className="router-pwd-row">
          <div className="pwd-field" style={{flex:1}}>
            <input type="password" placeholder="输入密码" value={pwd}
              autoFocus
              onChange={e => setPwd(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && pwd && onConnect(pwd)} />
          </div>
          <button className="btn-connect-sm" onClick={() => pwd && onConnect(pwd)}>连接</button>
          <button className="btn-ghost" style={{padding:'5px 10px',fontSize:12}}
            onClick={() => { setShowPwd(false); setPwd(''); }}>取消</button>
        </div>
      )}
    </div>
  );
}

// ── 添加路由器表单 ───────────────────────────────────────
function AddForm({ prefillHost, onSaved, onCancel }) {
  // 所有 useState 放在顶部，顺序固定
  const [proto,      setProto]      = useState('http');
  const [host,       setHost]       = useState(prefillHost || '');
  const [port,       setPort]       = useState(80);
  const [username,   setUsername]   = useState('root');
  const [password,   setPassword]   = useState('');
  const [label,      setLabel]      = useState('');
  const [rememberPwd,setRememberPwd]= useState(true);
  const [autoLogin,  setAutoLogin]  = useState(false);
  const [captchaVal, setCaptchaVal] = useState('');
  const [captchaCode,setCaptchaCode]= useState('');
  const [captchaImg, setCaptchaImg] = useState('');
  const [testing,    setTesting]    = useState(false);
  const [testResult, setTestResult] = useState('');
  const [errors,     setErrors]     = useState({});
  const [saving,     setSaving]     = useState(false);
  const [showPwd,    setShowPwd]    = useState(false);

  const handleProto = (p) => {
    setProto(p);
    setPort(p === 'https' ? 443 : 80);
  };

  const refreshCaptcha = useCallback(() => {
    try {
      const gen  = new CaptchaGenerator(130, 42);
      const code = gen.generateCode(5);
      setCaptchaCode(code);
      setCaptchaImg(gen.drawToDataURL(code));
      setCaptchaVal('');
    } catch(e) {
      // Canvas 不可用时生成简单数字验证码
      const code = Math.random().toString(36).slice(2, 7).toUpperCase();
      setCaptchaCode(code);
      setCaptchaImg('');
    }
  }, []);

  useEffect(() => { refreshCaptcha(); }, [refreshCaptcha]);

  const testConnect = async () => {
    if (!host) { setErrors(e => ({...e, host: '请填写地址'})); return; }
    setTesting(true); setTestResult('');
    try {
      const c = new OpenWrtClient({
        host, port: +port, https: proto === 'https',
        username, password, fetcher: window.fetch.bind(window)
      });
      await c.login();
      setTestResult('ok');
    } catch(e) {
      setTestResult('fail:' + (e.message || '连接失败'));
    }
    setTesting(false);
  };

  const save = async () => {
    const errs = {};
    if (!host)     errs.host     = '请填写路由器地址';
    if (!password) errs.password = '请填写密码';
    if (captchaCode && captchaVal.toLowerCase() !== captchaCode.toLowerCase()) {
      errs.captcha = '验证码错误';
      refreshCaptcha();
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      const c = new OpenWrtClient({
        host, port: +port, https: proto === 'https',
        username, password, fetcher: window.fetch.bind(window)
      });
      await c.login();
      const id = await mgr.addRouter({
        label: label || host, host, port: +port,
        https: proto === 'https', username,
        password: rememberPwd ? password : '',
        rememberPassword: rememberPwd, autoLogin
      });
      onSaved(id, { password, autoLogin });
    } catch(e) {
      setErrors(prev => ({...prev, general: e.message || '连接失败，请检查地址和密码'}));
    }
    setSaving(false);
  };

  return (
    <div className="add-form-wrap">
      <div className="add-form-header">
        <button className="btn-back" onClick={onCancel}>← 返回</button>
        <h2>添加路由器</h2>
      </div>

      {errors.general && (
        <div style={{background:'#2a1010',border:'1px solid #7f1d1d',borderRadius:8,
          padding:'10px 14px',color:'#f87171',fontSize:13,marginBottom:14}}>
          ⚠ {errors.general}
        </div>
      )}

      <div className="add-form">
        <label>
          <span>显示名称</span>
          <input placeholder="如：家里的路由器" value={label}
            onChange={e => setLabel(e.target.value)} />
        </label>

        <label className={errors.host ? 'error' : ''}>
          <span>路由器地址 <em>*</em></span>
          <div className="input-row" style={{flexWrap:'nowrap',gap:6}}>
            <select value={proto} onChange={e => handleProto(e.target.value)}
              style={{width:88,flex:'none',background:'var(--bg)',border:'1px solid var(--border)',
                borderRadius:6,color:'var(--text)',padding:'6px 8px',fontSize:13}}>
              <option value="http">HTTP</option>
              <option value="https">HTTPS</option>
            </select>
            <input style={{flex:1,minWidth:0}} placeholder="192.168.1.1 或域名"
              value={host} onChange={e => setHost(e.target.value)} />
            <input type="number" value={port} onChange={e => setPort(+e.target.value)}
              style={{width:68,flex:'none'}} />
          </div>
          <span style={{fontSize:11,color:'var(--dim)',marginTop:3,display:'block'}}>
            {proto}://{host || 'IP或域名'}{(proto==='http'&&+port===80)||(proto==='https'&&+port===443)?'':':'+port}/ubus
          </span>
          {errors.host && <span className="err-msg">{errors.host}</span>}
        </label>

        <label>
          <span>用户名</span>
          <input value={username} onChange={e => setUsername(e.target.value)} />
        </label>

        <label className={errors.password ? 'error' : ''}>
          <span>密码 <em>*</em></span>
          <div className="pwd-field">
            <input type={showPwd ? 'text' : 'password'}
              placeholder="路由器登录密码" value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && save()} />
            <button onClick={() => setShowPwd(v => !v)}>
              {showPwd ? '隐藏' : '显示'}
            </button>
          </div>
          {errors.password && <span className="err-msg">{errors.password}</span>}
        </label>

        <div className="test-row">
          <button className="btn-test" onClick={testConnect} disabled={testing}>
            {testing ? '测试中...' : '测试连接'}
          </button>
          {testResult === 'ok' && <span className="test-ok">✓ 连接成功</span>}
          {testResult.startsWith('fail:') && (
            <span className="test-fail">✗ {testResult.slice(5)}</span>
          )}
        </div>

        <label className={errors.captcha ? 'error' : ''}>
          <span>验证码 <em>*</em></span>
          <div className="captcha-row">
            {captchaImg ? (
              <img src={captchaImg} className={`captcha-img ${errors.captcha ? 'shake' : ''}`}
                onClick={refreshCaptcha} title="点击刷新" alt="captcha" />
            ) : (
              <div onClick={refreshCaptcha}
                style={{width:130,height:42,background:'#1e2530',borderRadius:6,
                  display:'flex',alignItems:'center',justifyContent:'center',
                  fontSize:22,fontWeight:700,color:'#4f8ef7',letterSpacing:6,
                  cursor:'pointer',border:'1px solid var(--border)'}}>
                {captchaCode}
              </div>
            )}
            <input placeholder="输入验证码" value={captchaVal}
              onChange={e => setCaptchaVal(e.target.value)} maxLength={6} />
          </div>
          {errors.captcha && <span className="err-msg">{errors.captcha}</span>}
          <span className="captcha-hint">点击验证码可刷新</span>
        </label>

        <div className="checkbox-group">
          <label className="checkbox-label">
            <input type="checkbox" checked={rememberPwd}
              onChange={e => { setRememberPwd(e.target.checked); if (!e.target.checked) setAutoLogin(false); }} />
            记住密码
          </label>
          <label className="checkbox-label" style={{opacity: rememberPwd ? 1 : 0.4}}>
            <input type="checkbox" checked={autoLogin}
              onChange={e => setAutoLogin(e.target.checked)} disabled={!rememberPwd} />
            自动登录 <em>（下次打开自动连接）</em>
          </label>
        </div>

        <div className="form-btns">
          <button className="btn-cancel" onClick={onCancel}>取消</button>
          <button className="btn-save" onClick={save} disabled={saving}>
            {saving ? '连接中...' : '保存并连接'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 主组件 ───────────────────────────────────────────────
export default function ConnectionManager({ onConnected }) {
  const [view,          setView]          = useState('home');
  const [routers,       setRouters]       = useState([]);
  const [found,         setFound]         = useState([]);
  const [scanning,      setScanning]      = useState(false);
  const [activeId,      setActiveId]      = useState(null);
  const [error,         setError]         = useState('');
  const [showAbout,     setShowAbout]     = useState(false);
  const [showUpdate,    setShowUpdate]    = useState(false);
  const [version,       setVersion]       = useState('');
  const [updateInfo,    setUpdateInfo]    = useState(null);
  const [checking,      setChecking]      = useState(false);
  const [allGWs,        setAllGWs]        = useState([]);   // 所有检测到的网关
  const [selectedGWs,   setSelectedGWs]   = useState([]);   // 用户勾选的
  const [manualSubnet,  setManualSubnet]  = useState('');
  const [quickConnect,  setQuickConnect]  = useState(null); // { host }
  const [gwLoading,     setGwLoading]     = useState(false);

  useEffect(() => {
    mgr.load().then(() => setRouters(mgr.listRouters()));
    window.electron?.getVersion?.().then(v => setVersion(v)).catch(() => {});
    window.electron?.onCheckUpdate?.(() => { setShowUpdate(true); doCheckUpdate(); });
  }, []);

  const doCheckUpdate = useCallback(async () => {
    setChecking(true);
    try {
      const info = await window.electron?.checkUpdate?.();
      setUpdateInfo(info || null);
    } catch { setUpdateInfo(null); }
    setChecking(false);
  }, []);

  // 启动后静默检查更新
  useEffect(() => {
    if (!version || !window.electron?.checkUpdate) return;
    const t = setTimeout(async () => {
      try {
        const info = await window.electron.checkUpdate();
        if (info && isNewerVersion(info.tag, version)) {
          setUpdateInfo(info);
          setShowUpdate(true);
        }
      } catch {}
    }, 3000);
    return () => clearTimeout(t);
  }, [version]);

  const connectRouter = useCallback(async (id, password) => {
    setActiveId(id); setError('');
    try {
      const cfg    = mgr.getConfig(id);
      const client = new OpenWrtClient({
        ...cfg, password, https: cfg.https || false,
        fetcher: window.fetch.bind(window)
      });
      await client.login();
      onConnected({ client, config: { ...cfg, password }, manager: mgr });
    } catch(e) {
      setError(e.message || '连接失败');
    } finally { setActiveId(null); }
  }, [onConnected]);

  // 加载本机网关列表（显示给用户选择）
  const loadGateways = useCallback(async () => {
    setGwLoading(true);
    try {
      const gwInfo = await window.electron?.getGateways?.();
      let gws = [];
      if (gwInfo?.all)           gws = gwInfo.all;
      else if (Array.isArray(gwInfo)) gws = gwInfo;
      if (manualSubnet.trim()) {
        const p = manualSubnet.trim().replace(/\/$/, '');
        gws = [...new Set([p+'.1', p+'.254', ...gws])];
      }
      setAllGWs(gws);
      setSelectedGWs(gws);   // 默认全选
    } catch { setAllGWs([]); setSelectedGWs([]); }
    setGwLoading(false);
  }, [manualSubnet]);

  const startScan = useCallback(async () => {
    let hints = selectedGWs.length > 0 ? [...selectedGWs] : [];
    if (hints.length === 0) {
      try {
        const gwInfo = await window.electron?.getGateways?.();
        if (gwInfo?.all) hints = gwInfo.all;
        else if (Array.isArray(gwInfo)) hints = gwInfo;
      } catch {}
      if (manualSubnet.trim()) {
        const p = manualSubnet.trim().replace(/\/$/, '');
        hints = [...new Set([p+'.1', p+'.254', ...hints])];
      }
    }
    setScanning(true); setFound([]);
    scanner = new LANScanner(window.fetch.bind(window), 3000);
    await scanner.scan(item => setFound(f => [...f, item]), hints);
    setScanning(false);
  }, [selectedGWs, manualSubnet]);


  // ── 渲染 ─────────────────────────────────────────────
  if (view === 'add') {
    return (
      <div style={{height:'100vh',display:'flex',flexDirection:'column'}}>
        <TitleBar version={version}
          onAbout={() => setShowAbout(true)}
          onUpdate={() => { setShowUpdate(true); doCheckUpdate(); }} />
        <div style={{flex:1,overflow:'auto'}}>
          <AddForm
            prefillHost=""
            onSaved={(id, cfg) => {
              setRouters(mgr.listRouters());
              setView('home');
              if (cfg.autoLogin) connectRouter(id, cfg.password);
            }}
            onCancel={() => setView('home')}
          />
        </div>
        {showAbout && <AboutModal version={version} onClose={() => setShowAbout(false)} />}
        {showUpdate && (
          <UpdateModal currentVersion={version} updateInfo={updateInfo}
            checking={checking} onClose={() => setShowUpdate(false)} onCheck={doCheckUpdate} />
        )}
      </div>
    );
  }

  return (
    <div style={{height:'100vh',display:'flex',flexDirection:'column'}}>
      <TitleBar version={version}
        onAbout={() => setShowAbout(true)}
        onUpdate={() => { setShowUpdate(true); doCheckUpdate(); }} />

      <div className="conn-manager" style={{flex:1,overflow:'auto'}}>
        <div className="conn-header">
          <div className="conn-logo">
            <img src="./assets/icon.png" width="52" height="52"
              style={{borderRadius:10,objectFit:'contain'}} alt="logo"
              onError={e => e.target.style.display='none'} />
            <div><h1>OpenWrt Manager</h1><p>路由器管理</p></div>
          </div>
        </div>

        {error && (
          <div style={{background:'#2a1010',border:'1px solid #7f1d1d',borderRadius:8,
            padding:'10px 14px',color:'#f87171',fontSize:13,marginBottom:14}}>
            ⚠ {error}
          </div>
        )}

        {routers.length > 0 && (
          <section className="conn-section">
            <h2>已保存的路由器</h2>
            <div className="router-list">
              {routers.map(r => (
                <RouterCard key={r.id} config={r}
                  connecting={activeId === r.id}
                  onConnect={(pwd) => connectRouter(r.id, pwd)}
                  onDelete={() => { mgr.removeRouter(r.id); setRouters(mgr.listRouters()); }}
                />
              ))}
            </div>
            <button className="btn-add-more" onClick={() => setView('add')}>＋ 添加路由器</button>
          </section>
        )}

        <section className="conn-section">
          <div className="section-header">
            <h2>局域网自动发现</h2>
            <button className="btn-scan" onClick={startScan} disabled={scanning}>
              {scanning ? '扫描中...' : '开始扫描'}
            </button>
          </div>

          {/* 网关选择区 */}
          <div className="scan-config">
            <div className="manual-subnet-row">
              <span className="manual-subnet-label">指定网段</span>
              <input className="manual-subnet-input"
                placeholder="如 192.168.123 或 10.8.0（可选）"
                value={manualSubnet}
                onChange={e => setManualSubnet(e.target.value)} />
              <button
                onClick={loadGateways}
                disabled={gwLoading}
                style={{flexShrink:0,padding:'5px 10px',background:'var(--bg3)',
                  border:'1px solid var(--border)',borderRadius:6,color:'var(--text)',
                  fontSize:12,cursor:'pointer',whiteSpace:'nowrap'}}>
                {gwLoading ? '检测中...' : '检测网关'}
              </button>
            </div>
            {allGWs.length > 0 && (
              <div style={{marginTop:8}}>
                <div style={{fontSize:11,color:'var(--muted)',marginBottom:5}}>
                  选择要扫描的网关（全选或取消勾选不需要的）：
                </div>
                <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                  {allGWs.map(gw => {
                    const checked = selectedGWs.includes(gw);
                    return (
                      <label key={gw}
                        style={{display:'flex',alignItems:'center',gap:5,
                          padding:'3px 9px',background: checked ? '#1f4a8f22' : 'var(--bg)',
                          border:`1px solid ${checked ? '#4f8ef7' : 'var(--border)'}`,
                          borderRadius:6,cursor:'pointer',fontSize:12,
                          fontFamily:'monospace',color: checked ? '#4f8ef7' : 'var(--muted)'}}>
                        <input type="checkbox" checked={checked} style={{margin:0,accentColor:'#4f8ef7'}}
                          onChange={() => setSelectedGWs(prev =>
                            checked ? prev.filter(x => x !== gw) : [...prev, gw]
                          )} />
                        {gw}
                      </label>
                    );
                  })}
                </div>
                <div style={{fontSize:11,color:'var(--dim)',marginTop:4}}>
                  已选 {selectedGWs.length} / {allGWs.length} 个网关 · 点击开始扫描
                </div>
              </div>
            )}
          </div>

          {scanning && (
            <div className="scan-progress">
              <div className="scan-wave" />
              <p>正在探测 OpenWrt 路由器... 扫描 {selectedGWs.length} 个地址</p>
            </div>
          )}

          {/* 扫描结果 */}
          {found.map(item => (
            <div key={item.host} className="found-card"
              onClick={() => setQuickConnect({ host: item.host })}>
              <div className="found-dot" />
              <div>
                <strong>{item.host}</strong>
                <span>
                  {item.isOpenWrt ? '✓ OpenWrt 路由器' : '有响应的设备'}
                  {' · 点击连接'}
                </span>
              </div>
              <span style={{color:'#22c55e',fontSize:18}}>→</span>
            </div>
          ))}

          {!scanning && found.length === 0 && (
            <div className="scan-empty">
              {allGWs.length === 0
                ? '点击"检测网关"获取本机网关，再点"开始扫描"'
                : '未发现 OpenWrt 路由器，请检查路由器是否已配置 ubus_cors=1'}
            </div>
          )}
        </section>

        {routers.length === 0 && (
          <button className="btn-manual" onClick={() => setView('add')}>手动添加路由器</button>
        )}
      </div>

      {/* 快速连接弹窗 */}
      {quickConnect && (
        <QuickConnectModal
          host={quickConnect.host}
          onConnect={(client, config) => {
            setQuickConnect(null);
            onConnected({ client, config, manager: mgr });
          }}
          onClose={() => setQuickConnect(null)}
        />
      )}

      {showAbout && <AboutModal version={version} onClose={() => setShowAbout(false)} />}
      {showUpdate && (
        <UpdateModal currentVersion={version} updateInfo={updateInfo}
          checking={checking} onClose={() => setShowUpdate(false)} onCheck={doCheckUpdate} />
      )}
    </div>
  );
}

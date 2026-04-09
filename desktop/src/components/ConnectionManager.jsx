import React, { useState, useEffect, useCallback, useRef } from 'react';
import { OpenWrtClient, LANScanner, RouterManager, CaptchaGenerator, WebStorage } from '@shared/openwrt-client.js';

// ── 全局单例 ──────────────────────────────────────────────
const mgr     = new RouterManager(WebStorage);
const captcha = new CaptchaGenerator(130, 42);
let   scanner = null;

// ── 关于弹窗 ──────────────────────────────────────────────
function AboutModal({ version, onClose }) {
  const open = (url) => window.electron?.openExternal(url);
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
              onError={e => { e.target.style.display='none' }} alt="logo" />
          </div>
          <div className="about-name">OpenWrt Manager</div>
          <div className="about-version">版本 {version || '1.0.0'}</div>
          <div className="about-desc">
            无后端直连 OpenWrt 路由器管理工具<br/>
            通过 ubus HTTP JSON-RPC 直连路由器，无需服务器
          </div>
          <div className="about-links">
            <button className="about-link-btn" onClick={() => open('https://github.com/YOUR_USERNAME/openwrt-manager')}>
              🔗 GitHub 项目地址
            </button>
            <button className="about-link-btn" onClick={() => open('https://github.com/YOUR_USERNAME/openwrt-manager/issues')}>
              🐛 反馈问题 / 功能建议
            </button>
            <button className="about-link-btn" onClick={() => open('https://github.com/YOUR_USERNAME/openwrt-manager/releases')}>
              📦 查看所有版本
            </button>
          </div>
          <div className="about-footer">
            MIT License · OpenWrt Manager Contributors
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 更新弹窗 ──────────────────────────────────────────────
function UpdateModal({ currentVersion, updateInfo, checking, onClose, onCheck }) {
  const open = (url) => window.electron?.openExternal(url);
  const hasUpdate = updateInfo && updateInfo.tag !== `v${currentVersion}` &&
                    updateInfo.tag !== currentVersion;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>检查更新</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="update-current">当前版本：{currentVersion || '1.0.0'}</div>
          {checking && <div className="update-checking">⟳ 正在检查...</div>}
          {!checking && !updateInfo && (
            <div className="update-msg">点击下方按钮检查最新版本</div>
          )}
          {!checking && updateInfo && !hasUpdate && (
            <div className="update-ok">✓ 已是最新版本（{updateInfo.tag}）</div>
          )}
          {!checking && updateInfo && hasUpdate && (
            <div className="update-new">
              <div className="update-new-tag">🎉 发现新版本：{updateInfo.tag}</div>
              <div className="update-new-body">{(updateInfo.body || '').substring(0, 300)}</div>
              <button className="btn-primary" style={{marginTop:12}}
                onClick={() => open(updateInfo.url)}>
                前往下载新版本
              </button>
            </div>
          )}
          {!checking && (
            <button className="about-link-btn" style={{marginTop:12}} onClick={onCheck}>
              🔄 重新检查
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 主组件 ───────────────────────────────────────────────
export default function ConnectionManager({ onConnected }) {
  const [view,      setView]      = useState('home');
  const [routers,   setRouters]   = useState([]);
  const [found,     setFound]     = useState([]);
  const [scanning,  setScanning]  = useState(false);
  const [activeId,  setActiveId]  = useState(null);
  const [error,     setError]     = useState('');
  const [showAbout, setShowAbout] = useState(false);
  const [showUpdate,setShowUpdate]= useState(false);
  const [version,   setVersion]   = useState('');
  const [updateInfo,setUpdateInfo]= useState(null);
  const [checking,  setChecking]  = useState(false);

  useEffect(() => {
    mgr.load().then(() => setRouters(mgr.listRouters()));
    window.electron?.getVersion().then(v => setVersion(v)).catch(() => {});
    // 主进程触发检查更新
    window.electron?.onCheckUpdate?.(() => { setShowUpdate(true); doCheckUpdate(); });
  }, []);

  const doCheckUpdate = useCallback(async () => {
    setChecking(true);
    const info = await window.electron?.checkUpdate();
    setUpdateInfo(info);
    setChecking(false);
  }, []);

  // 启动时静默检查更新
  useEffect(() => {
    if (!window.electron?.checkUpdate) return;
    setTimeout(async () => {
      const info = await window.electron.checkUpdate();
      if (info) {
        const cv = version || '1.0.0';
        const hasUpdate = info.tag !== `v${cv}` && info.tag !== cv;
        if (hasUpdate) { setUpdateInfo(info); setShowUpdate(true); }
      }
    }, 3000);
  }, [version]);

  const connectRouter = useCallback(async (id, password) => {
    setActiveId(id); setView('connecting'); setError('');
    try {
      const cfg    = mgr.getConfig(id);
      const client = new OpenWrtClient({ ...cfg, password, https: cfg.https || false, fetcher: window.fetch.bind(window) });
      await client.login();
      onConnected({ client, config: { ...cfg, password }, manager: mgr });
    } catch(e) {
      setError(e.message || '连接失败');
      setView('home');
    } finally { setActiveId(null); }
  }, [onConnected]);

  const [detectedGateways, setDetectedGateways] = useState([]);
  const [manualSubnet, setManualSubnet] = useState('');

  const startScan = useCallback(async () => {
    setScanning(true); setFound([]);

    // 获取系统智能网关检测结果
    let hints = [];
    let gwInfo = null;
    try {
      gwInfo = await window.electron?.getGateways();
      if (gwInfo && gwInfo.all) {
        hints = gwInfo.all;
        // 展示路由表直接读到的网关（最准确）
        setDetectedGateways(gwInfo.primary.length > 0 ? gwInfo.primary : gwInfo.all.slice(0, 2));
      } else if (Array.isArray(gwInfo)) {
        hints = gwInfo;
      }
    } catch(e) {}

    // 用户手动指定的子网前缀（如 "192.168.123"）
    if (manualSubnet.trim()) {
      const prefix = manualSubnet.trim().replace(/\/$/, '');
      hints = [prefix + '.1', prefix + '.254', ...hints];
    }

    scanner = new LANScanner(window.fetch.bind(window), 1500);
    await scanner.scan(item => setFound(f => [...f, item]), hints);
    setScanning(false);
  }, [manualSubnet]);

  const addAndConnect = useCallback(async (host) => {
    setView('add-quick');
    sessionStorage.setItem('quick_host', host);
  }, []);

  if (view === 'connecting') {
    return (
      <div style={{height:'100vh',display:'flex',flexDirection:'column'}}>
        <TitleBar version={version} onAbout={()=>setShowAbout(true)} onUpdate={()=>{setShowUpdate(true);doCheckUpdate();}} />
        <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:16}}>
          <div style={{color:'#4f8ef7',fontSize:32}}>⟳</div>
          <div style={{color:'#e6edf3',fontSize:15}}>正在连接路由器...</div>
          <div style={{color:'#8b949e',fontSize:12}}>请稍候</div>
          <button onClick={() => setView('home')} style={{marginTop:8,padding:'6px 18px',background:'#21262d',border:'1px solid #30363d',borderRadius:7,color:'#8b949e',cursor:'pointer',fontSize:13}}>取消</button>
        </div>
      </div>
    );
  }

  if (view === 'add' || view === 'add-quick') {
    const prefillHost = view === 'add-quick' ? (sessionStorage.getItem('quick_host') || '') : '';
    return (
      <div style={{height:'100vh',display:'flex',flexDirection:'column'}}>
        <TitleBar version={version} onAbout={()=>setShowAbout(true)} onUpdate={()=>{setShowUpdate(true);doCheckUpdate();}} />
        <div style={{flex:1,overflow:'auto'}}>
          <AddForm
            prefillHost={prefillHost}
            onSaved={(id, cfg) => {
              setRouters(mgr.listRouters());
              setView('home');
              if (cfg.autoLogin) connectRouter(id, cfg.password);
            }}
            onCancel={() => setView('home')}
          />
        </div>
        {showAbout  && <AboutModal version={version} onClose={()=>setShowAbout(false)} />}
        {showUpdate && <UpdateModal currentVersion={version} updateInfo={updateInfo} checking={checking} onClose={()=>setShowUpdate(false)} onCheck={doCheckUpdate} />}
      </div>
    );
  }

  return (
    <div style={{height:'100vh',display:'flex',flexDirection:'column'}}>
      <TitleBar version={version} onAbout={()=>setShowAbout(true)} onUpdate={()=>{setShowUpdate(true);doCheckUpdate();}} />

      <div className="conn-manager" style={{flex:1,overflow:'auto'}}>
        <div className="conn-header">
          <div className="conn-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/>
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1"/>
            </svg>
            <div><h1>OpenWrt Manager</h1><p>路由器管理</p></div>
          </div>
        </div>

        {error && <div style={{background:'#2a1010',border:'1px solid #7f1d1d',borderRadius:8,padding:'10px 14px',color:'#f87171',fontSize:13,marginBottom:14}}>⚠ {error}</div>}

        {/* 已保存的路由器 */}
        {routers.length > 0 && (
          <section className="conn-section">
            <h2>已保存的路由器</h2>
            <div className="router-list">
              {routers.map(r => (
                <RouterCard
                  key={r.id} config={r}
                  connecting={activeId === r.id}
                  onConnect={(pwd) => connectRouter(r.id, pwd)}
                  onDelete={() => { mgr.removeRouter(r.id); setRouters(mgr.listRouters()); }}
                />
              ))}
            </div>
            <button className="btn-add-more" onClick={() => setView('add')}>＋ 添加路由器</button>
          </section>
        )}

        {/* 局域网扫描 */}
        <section className="conn-section">
          <div className="section-header">
            <h2>局域网自动发现</h2>
            <button className="btn-scan" onClick={startScan} disabled={scanning}>
              {scanning ? '扫描中...' : '开始扫描'}
            </button>
          </div>

          {/* 网关提示 + 手动输入 */}
          <div className="scan-config">
            {detectedGateways.length > 0 && (
              <div className="detected-gw">
                <span className="detected-gw-label">检测到网关：</span>
                {detectedGateways.map(gw => (
                  <span key={gw} className="detected-gw-tag">{gw}</span>
                ))}
              </div>
            )}
            <div className="manual-subnet-row">
              <span className="manual-subnet-label">指定网段（可选）</span>
              <input
                className="manual-subnet-input"
                placeholder="如 192.168.123 或 10.8.0"
                value={manualSubnet}
                onChange={e => setManualSubnet(e.target.value)}
                title="输入子网前三段，例如 192.168.100，扫描该网段的 .1 和 .254"
              />
            </div>
          </div>

          {scanning && (
            <div className="scan-progress">
              <div className="scan-wave" />
              <p>正在探测路由器... {detectedGateways.length > 0 ? `优先扫描 ${detectedGateways[0]}` : ''}</p>
            </div>
          )}

          {found.map(item => (
            <div key={item.host} className="found-card" onClick={() => addAndConnect(item.host)}>
              <div className="found-dot" />
              <div><strong>{item.host}</strong><span>OpenWrt 路由器 · 点击连接</span></div>
              <span style={{color:'#22c55e',fontSize:18}}>→</span>
            </div>
          ))}

          {!scanning && found.length === 0 && (
            <div className="scan-empty">点击"开始扫描"自动发现局域网路由器，或手动添加</div>
          )}
        </section>

        {routers.length === 0 && (
          <button className="btn-manual" onClick={() => setView('add')}>手动添加路由器</button>
        )}
      </div>

      {showAbout  && <AboutModal version={version} onClose={()=>setShowAbout(false)} />}
      {showUpdate && <UpdateModal currentVersion={version} updateInfo={updateInfo} checking={checking} onClose={()=>setShowUpdate(false)} onCheck={doCheckUpdate} />}
    </div>
  );
}

// ── 自定义标题栏 ─────────────────────────────────────────
function TitleBar({ version, onAbout, onUpdate }) {
  return (
    <div className="titlebar" style={{WebkitAppRegion:'drag'}}>
      <div className="titlebar-left">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
          <circle cx="12" cy="20" r="1"/>
        </svg>
        <span>OpenWrt Manager</span>
        {version && <span style={{fontSize:10,color:'#484f58',marginLeft:4}}>v{version}</span>}
      </div>
      <div className="titlebar-right" style={{WebkitAppRegion:'no-drag',display:'flex',alignItems:'center',gap:2}}>
        <button className="titlebar-menu-btn" onClick={onUpdate} title="检查更新">↑</button>
        <button className="titlebar-menu-btn" onClick={onAbout}  title="关于">?</button>
        <button className="titlebar-ctrl-btn" onClick={() => window.electron?.minimize()} title="最小化">─</button>
        <button className="titlebar-ctrl-btn" onClick={() => window.electron?.maximize()} title="最大化">□</button>
        <button className="titlebar-ctrl-btn close" onClick={() => window.electron?.close()} title="关闭">✕</button>
      </div>
    </div>
  );
}

// ── 路由器卡片 ───────────────────────────────────────────
function RouterCard({ config, connecting, onConnect, onDelete }) {
  const [showPwd, setShowPwd] = useState(false);
  const [pwd, setPwd]         = useState(config.password || '');

  const handleConnect = () => {
    if (config.rememberPassword && pwd) { onConnect(pwd); return; }
    setShowPwd(true);
  };

  return (
    <div className={`router-card ${connecting ? 'connecting' : ''}`}>
      <div className="router-card-main" onClick={handleConnect}>
        <div className="router-icon-wrap">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
            <path d="M6 6h.01M10 6h.01"/>
          </svg>
        </div>
        <div className="router-info">
          <strong>{config.label || config.host}</strong>
          <span>
            {config.https ? 'https' : 'http'}://{config.host}
            {((config.https && config.port === 443) || (!config.https && config.port === 80)) ? '' : `:${config.port}`}
          </span>
          <span className="router-meta">{config.username} · {config.rememberPassword ? '已记住密码' : '每次输入密码'}</span>
        </div>
        {connecting
          ? <span style={{color:'#4f8ef7',fontSize:13}}>连接中...</span>
          : <span style={{color:'#8b949e',fontSize:16}}>→</span>
        }
        <button className="router-remove" title="删除" onClick={e=>{e.stopPropagation();onDelete();}}>✕</button>
      </div>
      {showPwd && !config.rememberPassword && (
        <div className="router-pwd-row">
          <div className="pwd-field" style={{flex:1}}>
            <input type="password" placeholder="输入密码" value={pwd}
              onChange={e => setPwd(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && onConnect(pwd)} />
          </div>
          <button className="btn-connect-sm" onClick={() => onConnect(pwd)}>连接</button>
          <button className="btn-ghost" style={{padding:'5px 10px',fontSize:12}} onClick={() => setShowPwd(false)}>取消</button>
        </div>
      )}
    </div>
  );
}

// ── 添加路由器表单 ───────────────────────────────────────
function AddForm({ prefillHost, onSaved, onCancel }) {
  const [proto,    setProto]    = useState('http');   // http | https
  const [host,     setHost]     = useState(prefillHost || '');
  const [port,     setPort]     = useState(80);
  const [username, setUsername] = useState('root');

  // 切换协议时，自动更新默认端口
  const handleProtoChange = (p) => {
    setProto(p);
    setPort(p === 'https' ? 443 : 80);
  };
  const [password, setPassword] = useState('');
  const [label,    setLabel]    = useState('');
  const [rememberPwd, setRememberPwd] = useState(true);
  const [autoLogin,   setAutoLogin]   = useState(false);
  const [captchaVal,  setCaptchaVal]  = useState('');
  const [captchaCode, setCaptchaCode] = useState('');
  const [captchaImg,  setCaptchaImg]  = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState('');
  const [errors, setErrors]   = useState({});
  const [saving, setSaving]   = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const canvasRef = useRef(null);

  useEffect(() => { refreshCaptcha(); }, []);

  const refreshCaptcha = () => {
    const code = captcha.generateCode(5);
    setCaptchaCode(code);
    setCaptchaImg(captcha.drawToDataURL(code));
    setCaptchaVal('');
  };

  const testConnect = async () => {
    if (!host) { setErrors(e => ({...e, host: '请填写地址'})); return; }
    setTesting(true); setTestResult('');
    try {
      const c = new OpenWrtClient({ host, port: +port, https: proto === 'https', username, password, fetcher: window.fetch.bind(window) });
      await c.login();
      setTestResult('ok');
    } catch(e) {
      setTestResult('fail:' + e.message);
    }
    setTesting(false);
  };

  const save = async () => {
    const errs = {};
    if (!host)     errs.host     = '请填写路由器地址';
    if (!password) errs.password = '请填写密码';
    if (captchaVal.toLowerCase() !== captchaCode.toLowerCase()) {
      errs.captcha = '验证码错误';
      refreshCaptcha();
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      const c = new OpenWrtClient({ host, port: +port, https: proto === 'https', username, password, fetcher: window.fetch.bind(window) });
      await c.login();
      const id = await mgr.addRouter({ label: label || host, host, port: +port, username,
        password: rememberPwd ? password : '', rememberPassword: rememberPwd, autoLogin });
      onSaved(id, { password, autoLogin });
    } catch(e) {
      setErrors(errs => ({...errs, general: e.message}));
    }
    setSaving(false);
  };

  return (
    <div className="add-form-wrap">
      <div className="add-form-header">
        <button className="btn-back" onClick={onCancel}>← 返回</button>
        <h2>添加路由器</h2>
      </div>

      {errors.general && <div style={{background:'#2a1010',border:'1px solid #7f1d1d',borderRadius:8,padding:'10px 14px',color:'#f87171',fontSize:13,marginBottom:14}}>⚠ {errors.general}</div>}

      <div className="add-form">
        <label className={errors.label ? 'error' : ''}>
          <span>显示名称</span>
          <input placeholder="如：家里的路由器" value={label} onChange={e => setLabel(e.target.value)} />
        </label>
        <label className={errors.host ? 'error' : ''}>
          <span>路由器地址 <em>*</em></span>
          <div className="input-row" style={{flexWrap:'wrap',gap:6}}>
            {/* 协议选择 */}
            <select value={proto} onChange={e => handleProtoChange(e.target.value)}
              style={{width:90,flex:'none',background:'var(--bg)',border:'1px solid var(--border)',
                      borderRadius:6,color:'var(--text)',padding:'6px 8px',fontSize:13}}>
              <option value="http">HTTP</option>
              <option value="https">HTTPS</option>
            </select>
            {/* IP / 域名 */}
            <input style={{flex:1,minWidth:140}}
              placeholder="192.168.1.1 或域名"
              value={host} onChange={e => setHost(e.target.value)} />
            {/* 端口 */}
            <input type="number" placeholder={proto==='https'?'443':'80'}
              value={port} onChange={e => setPort(e.target.value)} style={{width:72,flex:'none'}} />
          </div>
          <span style={{fontSize:11,color:'var(--dim)',marginTop:3,display:'block'}}>
            完整地址：{proto}://{host || '路由器IP'}{(proto==='http'&&+port===80)||(proto==='https'&&+port===443)?'':':'+port}/ubus
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
            <input type={showPwd ? 'text' : 'password'} placeholder="路由器登录密码" value={password} onChange={e => setPassword(e.target.value)} />
            <button onClick={() => setShowPwd(v => !v)}>{showPwd ? '隐藏' : '显示'}</button>
          </div>
          {errors.password && <span className="err-msg">{errors.password}</span>}
        </label>

        <div className="test-row">
          <button className="btn-test" onClick={testConnect} disabled={testing}>
            {testing ? '测试中...' : '测试连接'}
          </button>
          {testResult === 'ok' && <span className="test-ok">✓ 连接成功</span>}
          {testResult.startsWith('fail') && <span className="test-fail">✗ {testResult.slice(5)}</span>}
        </div>

        <label className={errors.captcha ? 'error' : ''}>
          <span>验证码 <em>*</em></span>
          <div className="captcha-row">
            <img src={captchaImg} className={`captcha-img ${errors.captcha ? 'shake' : ''}`}
              onClick={refreshCaptcha} title="点击刷新" alt="captcha" />
            <input placeholder="输入验证码" value={captchaVal} onChange={e => setCaptchaVal(e.target.value)} maxLength={5} />
          </div>
          {errors.captcha && <span className="err-msg">{errors.captcha}</span>}
          <span className="captcha-hint">点击验证码图片可刷新</span>
        </label>

        <div className="checkbox-group">
          <label className="checkbox-label">
            <input type="checkbox" checked={rememberPwd} onChange={e => { setRememberPwd(e.target.checked); if (!e.target.checked) setAutoLogin(false); }} />
            记住密码
          </label>
          <label className="checkbox-label" style={{opacity: rememberPwd ? 1 : 0.4}}>
            <input type="checkbox" checked={autoLogin} onChange={e => setAutoLogin(e.target.checked)} disabled={!rememberPwd} />
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

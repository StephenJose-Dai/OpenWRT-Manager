import React, { useState, useEffect, useRef, useCallback } from 'react';
import { OpenWrtClient, LANScanner, RouterManager, CaptchaGenerator, WebStorage } from '../../shared/openwrt-client.js';

// ─── 全局路由器管理器（单例）────────────────────────────────
const manager = new RouterManager(WebStorage);
const scanner = new LANScanner(fetch.bind(window), 1500);
const captcha = new CaptchaGenerator(120, 40);

// ─── 主组件：连接管理器 ────────────────────────────────────
export default function ConnectionManager({ onConnected }) {
  const [routers, setRouters]       = useState([]);        // 已保存的路由器列表
  const [scanning, setScanning]     = useState(false);     // LAN 扫描中
  const [found, setFound]           = useState([]);        // LAN 发现的路由器
  const [view, setView]             = useState('home');    // home | add | connecting
  const [activeId, setActiveId]     = useState(null);      // 当前连接中的路由器 ID
  const [error, setError]           = useState('');

  // 初始化：加载已保存路由器，执行自动登录
  useEffect(() => {
    manager.load().then(() => {
      const list = manager.listRouters();
      setRouters(list);
      // 自动登录：找第一个开启了 autoLogin 的路由器
      const auto = list.find(r => r.autoLogin && r.rememberPassword);
      if (auto) connectRouter(auto.id, auto.password);
    });
  }, []);

  const refresh = () => setRouters(manager.listRouters());

  // ─── LAN 扫描 ─────────────────────────────────────────
  const startScan = async () => {
    setScanning(true);
    setFound([]);
    await scanner.scan((item) => {
      setFound(prev => [...prev, item]);
    });
    setScanning(false);
  };

  // ─── 连接路由器 ───────────────────────────────────────
  const connectRouter = async (id, password) => {
    setActiveId(id);
    setView('connecting');
    setError('');
    try {
      const cfg = manager.getConfig(id);
      const client = new OpenWrtClient({
        host:     cfg.host,
        port:     cfg.port,
        username: cfg.username,
        password: password || cfg.password,
        fetcher:  fetch.bind(window)
      });
      await client.login();
      onConnected?.({ client, config: cfg, manager });
    } catch (err) {
      setError(err.message || '连接失败');
      setView('home');
      setActiveId(null);
    }
  };

  if (view === 'connecting') return <ConnectingScreen routerId={activeId} error={error} onBack={() => setView('home')} />;
  if (view === 'add')        return (
    <AddRouterForm
      prefill={view.prefill}
      onSaved={async (cfg) => {
        const id = await manager.addRouter(cfg);
        refresh();
        if (cfg.autoLogin) connectRouter(id, cfg.password);
        else setView('home');
      }}
      onCancel={() => setView('home')}
    />
  );

  return (
    <div className="conn-manager">
      <div className="conn-header">
        <div className="conn-logo">
          <RouterIcon />
          <div>
            <h1>OpenWrt Manager</h1>
            <p>路由器管理</p>
          </div>
        </div>
      </div>

      {/* 已保存的路由器 */}
      {routers.length > 0 && (
        <section className="conn-section">
          <h2>已保存的路由器</h2>
          <div className="router-list">
            {routers.map(r => (
              <SavedRouterCard
                key={r.id}
                router={r}
                isConnecting={activeId === r.id}
                onConnect={(pwd) => connectRouter(r.id, pwd)}
                onRemove={async () => {
                  await manager.removeRouter(r.id);
                  refresh();
                }}
                onEdit={() => setView({ ...view === 'add' ? {} : {}, prefill: r, name: 'add' })}
              />
            ))}
          </div>
          <button className="btn-add-more" onClick={() => setView('add')}>
            <PlusIcon /> 添加路由器
          </button>
        </section>
      )}

      {/* 局域网扫描 */}
      <section className="conn-section">
        <div className="section-header">
          <h2>局域网自动发现</h2>
          <button className="btn-scan" onClick={startScan} disabled={scanning}>
            {scanning ? <><SpinIcon /> 扫描中...</> : <><ScanIcon /> 开始扫描</>}
          </button>
        </div>

        {scanning && (
          <div className="scan-progress">
            <div className="scan-wave" />
            <p>正在探测局域网中的 OpenWrt 路由器...</p>
          </div>
        )}

        {found.length > 0 && (
          <div className="found-list">
            {found.map(item => (
              <FoundRouterCard
                key={item.host}
                host={item.host}
                onConnect={() => setView({ name: 'add', prefill: { host: item.host, label: `路由器 (${item.host})` } })}
              />
            ))}
          </div>
        )}

        {!scanning && found.length === 0 && routers.length === 0 && (
          <div className="scan-empty">
            <p>点击"开始扫描"自动发现局域网路由器，或手动添加</p>
          </div>
        )}
      </section>

      {/* 手动添加 */}
      {routers.length === 0 && (
        <button className="btn-manual" onClick={() => setView('add')}>
          手动添加路由器
        </button>
      )}
    </div>
  );
}

// ─── 已保存路由器卡片 ─────────────────────────────────────
function SavedRouterCard({ router, isConnecting, onConnect, onRemove }) {
  const [showPwd, setShowPwd]   = useState(false);
  const [password, setPassword] = useState(router.rememberPassword ? router.password : '');
  const [expanded, setExpanded] = useState(false);

  const handleConnect = () => {
    if (!router.rememberPassword && !password) { setExpanded(true); return; }
    onConnect(password);
  };

  return (
    <div className={`router-card ${isConnecting ? 'connecting' : ''}`}>
      <div className="router-card-main" onClick={handleConnect}>
        <div className="router-icon-wrap"><RouterIcon /></div>
        <div className="router-info">
          <strong>{router.label}</strong>
          <span>{router.host}{router.port !== 80 ? `:${router.port}` : ''}</span>
          <span className="router-meta">{router.username} · {router.autoLogin ? '自动登录' : '手动登录'}</span>
        </div>
        <div className="router-actions">
          {isConnecting
            ? <SpinIcon />
            : <ConnectArrow />
          }
        </div>
      </div>

      {/* 需要输入密码时展开 */}
      {expanded && !router.rememberPassword && (
        <div className="router-pwd-row">
          <div className="pwd-field">
            <input
              type={showPwd ? 'text' : 'password'}
              placeholder="输入密码"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && onConnect(password)}
              autoFocus
            />
            <button onClick={() => setShowPwd(v => !v)}>{showPwd ? '隐' : '显'}</button>
          </div>
          <button className="btn-connect-sm" onClick={() => onConnect(password)}>连接</button>
        </div>
      )}

      <button className="router-remove" onClick={(e) => { e.stopPropagation(); onRemove(); }} title="删除">✕</button>
    </div>
  );
}

// ─── 发现的路由器卡片 ─────────────────────────────────────
function FoundRouterCard({ host, onConnect }) {
  return (
    <div className="found-card" onClick={onConnect}>
      <div className="found-dot" />
      <div>
        <strong>{host}</strong>
        <span>OpenWrt 路由器 · 点击连接</span>
      </div>
      <ConnectArrow />
    </div>
  );
}

// ─── 添加 / 编辑路由器表单 ────────────────────────────────
function AddRouterForm({ prefill = {}, onSaved, onCancel }) {
  const [form, setForm] = useState({
    label:           prefill.label || '',
    host:            prefill.host  || '',
    port:            prefill.port  || 80,
    username:        prefill.username || 'root',
    password:        '',
    rememberPassword:prefill.rememberPassword ?? true,
    autoLogin:       prefill.autoLogin ?? false,
    ...prefill
  });
  const [showPwd,    setShowPwd]    = useState(false);
  const [captchaUrl, setCaptchaUrl] = useState('');
  const [captchaInput, setCaptchaInput] = useState('');
  const [captchaErr,  setCaptchaErr]  = useState(false);
  const [testing,    setTesting]    = useState(false);
  const [testResult, setTestResult] = useState(null);  // null | 'ok' | 'fail'
  const [errors,     setErrors]     = useState({});

  useEffect(() => {
    setCaptchaUrl(captcha.render());
  }, []);

  const refreshCaptcha = () => {
    setCaptchaUrl(captcha.render());
    setCaptchaInput('');
    setCaptchaErr(false);
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // 测试连接（不校验验证码，方便用户先确认能通）
  const handleTest = async () => {
    if (!form.host) { setErrors({ host: '请填写地址' }); return; }
    setTesting(true);
    setTestResult(null);
    try {
      const client = new OpenWrtClient({
        host: form.host, port: form.port,
        username: form.username, password: form.password,
        fetcher: fetch.bind(window)
      });
      await client.login();
      setTestResult('ok');
    } catch (e) {
      setTestResult('fail');
    }
    setTesting(false);
  };

  // 保存
  const handleSave = () => {
    const errs = {};
    if (!form.host) errs.host = '请填写路由器地址';
    if (!form.password) errs.password = '请填写密码';
    if (!captcha.verify(captchaInput)) {
      errs.captcha = '验证码错误';
      setCaptchaErr(true);
      refreshCaptcha();
    }
    if (Object.keys(errs).length) { setErrors(errs); return; }

    onSaved({
      ...form,
      label: form.label || form.host,
      id: prefill.id
    });
  };

  return (
    <div className="add-form-wrap">
      <div className="add-form-header">
        <button className="btn-back" onClick={onCancel}>← 返回</button>
        <h2>{prefill.id ? '编辑路由器' : '添加路由器'}</h2>
      </div>

      <div className="add-form">
        {/* 名称 */}
        <label>
          <span>显示名称</span>
          <input value={form.label} onChange={e => set('label', e.target.value)}
            placeholder="如：家里路由器" />
        </label>

        {/* 地址 */}
        <label className={errors.host ? 'error' : ''}>
          <span>路由器地址 <em>*</em></span>
          <div className="input-row">
            <input value={form.host} onChange={e => set('host', e.target.value)}
              placeholder="192.168.1.1 或 域名" />
            <input type="number" value={form.port} onChange={e => set('port', Number(e.target.value))}
              style={{ width: 72 }} placeholder="端口" />
          </div>
          {errors.host && <span className="err-msg">{errors.host}</span>}
        </label>

        {/* 用户名 */}
        <label>
          <span>用户名</span>
          <input value={form.username} onChange={e => set('username', e.target.value)}
            placeholder="root" />
        </label>

        {/* 密码 */}
        <label className={errors.password ? 'error' : ''}>
          <span>密码 <em>*</em></span>
          <div className="pwd-field">
            <input type={showPwd ? 'text' : 'password'}
              value={form.password} onChange={e => set('password', e.target.value)}
              placeholder="路由器登录密码" />
            <button type="button" onClick={() => setShowPwd(v => !v)}>
              {showPwd ? '隐藏' : '显示'}
            </button>
          </div>
          {errors.password && <span className="err-msg">{errors.password}</span>}
        </label>

        {/* 测试连接 */}
        <div className="test-row">
          <button className="btn-test" onClick={handleTest} disabled={testing}>
            {testing ? '测试中...' : '测试连接'}
          </button>
          {testResult === 'ok'   && <span className="test-ok">✓ 连接成功</span>}
          {testResult === 'fail' && <span className="test-fail">✗ 连接失败，请检查地址和密码</span>}
        </div>

        {/* 图形验证码 */}
        <label className={errors.captcha ? 'error' : ''}>
          <span>验证码 <em>*</em></span>
          <div className="captcha-row">
            {captchaUrl && (
              <img src={captchaUrl} alt="验证码" className={`captcha-img ${captchaErr ? 'shake' : ''}`}
                onClick={refreshCaptcha} title="点击刷新" style={{ cursor: 'pointer' }} />
            )}
            <input value={captchaInput} onChange={e => { setCaptchaInput(e.target.value); setCaptchaErr(false); }}
              placeholder="输入右侧验证码" maxLength={4} />
          </div>
          {errors.captcha && <span className="err-msg">{errors.captcha}</span>}
          <span className="captcha-hint">点击图片刷新验证码</span>
        </label>

        {/* 选项 */}
        <div className="checkbox-group">
          <label className="checkbox-label">
            <input type="checkbox" checked={form.rememberPassword}
              onChange={e => set('rememberPassword', e.target.checked)} />
            <span>记住密码</span>
          </label>
          <label className="checkbox-label">
            <input type="checkbox" checked={form.autoLogin} disabled={!form.rememberPassword}
              onChange={e => set('autoLogin', e.target.checked)} />
            <span>自动登录</span>
            {!form.rememberPassword && <em>（需先开启记住密码）</em>}
          </label>
        </div>

        {/* 操作按钮 */}
        <div className="form-btns">
          <button className="btn-cancel" onClick={onCancel}>取消</button>
          <button className="btn-save" onClick={handleSave}>保存并连接</button>
        </div>
      </div>
    </div>
  );
}

// ─── 连接中画面 ───────────────────────────────────────────
function ConnectingScreen({ routerId, error, onBack }) {
  return (
    <div className="connecting-screen">
      {!error ? (
        <>
          <div className="connecting-anim">
            <div className="ring r1" /><div className="ring r2" /><div className="ring r3" />
            <RouterIcon />
          </div>
          <p>正在连接路由器...</p>
        </>
      ) : (
        <>
          <div className="error-icon">✕</div>
          <p className="error-msg">{error}</p>
          <button className="btn-back" onClick={onBack}>← 返回</button>
        </>
      )}
    </div>
  );
}

// ─── SVG 图标 ─────────────────────────────────────────────
const RouterIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2" y="14" width="20" height="6" rx="2"/>
    <path d="M6 14V11a6 6 0 0 1 12 0v3"/>
    <circle cx="12" cy="17" r="1" fill="currentColor"/>
    <path d="M18 8.5a8 8 0 0 0-12 0M15 11a5 5 0 0 0-6 0"/>
  </svg>
);
const PlusIcon   = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v10M3 8h10"/></svg>;
const ScanIcon   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35M11 8v6M8 11h6"/></svg>;
const SpinIcon   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{animation:'spin 1s linear infinite'}}><path d="M21 12a9 9 0 1 1-6.22-8.56"/></svg>;
const ConnectArrow = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>;

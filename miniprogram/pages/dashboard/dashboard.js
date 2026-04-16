// pages/dashboard/dashboard.js
const { OpenWrtClient, fmtUptime } = require('../../utils/openwrt');

Page({
  data: {
    routers:    [],    // 所有已保存路由器（用于顶部切换）
    activeId:   null,
    info:       null,
    interfaces: [],
    online:     false,
    loading:    true,
    switcherOpen: false
  },

  _client: null,
  _timer:  null,

  onLoad() {
    this._initFromGlobal();
  },

  onShow() {
    // 切回此 tab 时刷新
    if (this._client) this._fetchAll();
  },

  onUnload() {
    if (this._timer) clearInterval(this._timer);
  },

  _initFromGlobal() {
    const app = getApp();
    const cfg = app.globalData?.currentRouter;
    const mgr = app.globalData?.currentMgr;

    if (!cfg) {
      wx.showToast({ title: '请先选择路由器', icon: 'none' });
      wx.switchTab({ url: '/pages/index/index' });
      return;
    }

    if (mgr) this.setData({ routers: mgr.list() });

    this.setData({ activeId: cfg.id });
    this._client = new OpenWrtClient({
      host:     cfg.host,
      port:     cfg.port,
      username: cfg.username,
      password: cfg.password
    });

    this._fetchAll();
    // 每 30 秒自动刷新
    this._timer = setInterval(() => this._fetchAll(), 30000);
  },

  async _fetchAll() {
    if (!this._client) return;
    this.setData({ loading: true });
    try {
      const [info, ifaces] = await Promise.all([
        this._client.getSystemInfo(),
        this._client.getNetworkInterfaces()
      ]);
      // 预处理流量数据（wxml 不支持 .toFixed()）
      const fmtBytes = b => b > 1048576 ? (b/1048576).toFixed(1)+'MB' : b > 1024 ? (b/1024).toFixed(0)+'KB' : b+'B';
      const interfaces = ifaces.map(i => ({
        ...i,
        rxFmt: i.rxBytes > 0 ? fmtBytes(i.rxBytes) : '--',
        txFmt: i.txBytes > 0 ? fmtBytes(i.txBytes) : '--',
      }));
      this.setData({ info, interfaces, online: true, loading: false });
    } catch (err) {
      this.setData({ online: false, loading: false });
      if (err.code === 6) {
        // 重新登录
        try { await this._client.login(); await this._fetchAll(); } catch {}
      }
    }
  },

  onRefresh() { this._fetchAll(); },

  // ─── 路由器切换 ──────────────────────────────────────
  toggleSwitcher() { this.setData({ switcherOpen: !this.data.switcherOpen }); },

  onSwitchRouter(e) {
    const id  = e.currentTarget.dataset.id;
    const mgr = getApp().globalData?.currentMgr;
    if (!mgr) return;

    const cfg = mgr.get(id);
    if (!cfg) return;

    if (this._timer) clearInterval(this._timer);
    this._client = null;

    getApp().globalData.currentRouter = cfg;
    this.setData({ switcherOpen: false, info: null, online: false, loading: true, activeId: id });
    this._client = new OpenWrtClient(cfg);
    this._fetchAll();
    this._timer = setInterval(() => this._fetchAll(), 30000);
  },

  // ─── 重启 ────────────────────────────────────────────
  onReboot() {
    wx.showModal({
      title: '重启路由器',
      content: `确定要重启 ${this.data.info?.hostname || '路由器'} 吗？`,
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await this._client.reboot();
          wx.showToast({ title: '正在重启...', icon: 'none' });
          this.setData({ online: false });
        } catch {
          wx.showToast({ title: '操作失败', icon: 'none' });
        }
      }
    });
  },

  fmtBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024, s = ['B','KB','MB','GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${s[i]}`;
  }
});

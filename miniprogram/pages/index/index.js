// pages/index/index.js
const { RouterManager, scanLAN } = require('../../utils/openwrt');

const mgr = new RouterManager();

Page({
  data: {
    routers:    [],
    scanning:   false,
    foundList:  [],
    activeId:   null   // 当前已连接的路由器 ID
  },

  onLoad() {
    const list = mgr.load();
    this.setData({ routers: list });
    // 自动连接
    const auto = list.find(r => r.autoLogin && r.rememberPassword);
    if (auto) this.connectRouter(auto);
  },

  onShow() {
    // 每次回到此页面刷新路由器列表
    this.setData({ routers: mgr.list() });
  },

  // ─── 局域网扫描 ──────────────────────────────────────
  async startScan() {
    this.setData({ scanning: true, foundList: [] });
    wx.showLoading({ title: '扫描中...' });

    await scanLAN((item) => {
      this.setData({ foundList: [...this.data.foundList, item] });
    }, 1500);

    wx.hideLoading();
    this.setData({ scanning: false });

    if (this.data.foundList.length === 0) {
      wx.showToast({ title: '未发现路由器', icon: 'none' });
    }
  },

  // ─── 连接路由器 ──────────────────────────────────────
  connectRouter(router) {
    this.setData({ activeId: router.id });
    // 把客户端配置存到全局，让 dashboard 等页面复用
    getApp().globalData.currentRouter = router;
    getApp().globalData.currentMgr    = mgr;
    wx.navigateTo({ url: '/pages/webview/webview' });
  },

  onRouterTap(e) {
    const id     = e.currentTarget.dataset.id;
    const router = mgr.get(id);
    if (!router) return;

    if (router.rememberPassword) {
      this.connectRouter(router);
    } else {
      // 需要输入密码
      wx.showModal({
        title: `连接 ${router.label}`,
        editable: true,
        placeholderText: '请输入密码',
        success: (res) => {
          if (res.confirm && res.content) {
            const updated = { ...router, password: res.content };
            this.connectRouter(updated);
          }
        }
      });
    }
  },

  onFoundTap(e) {
    const host = e.currentTarget.dataset.host;
    wx.navigateTo({ url: `/pages/add/add?host=${host}` });
  },

  onAddTap() {
    wx.navigateTo({ url: '/pages/add/add' });
  },

  onDeleteRouter(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除路由器',
      content: '确定要删除这个路由器配置吗？',
      success: (res) => {
        if (res.confirm) {
          mgr.remove(id);
          this.setData({ routers: mgr.list() });
        }
      }
    });
  }
});

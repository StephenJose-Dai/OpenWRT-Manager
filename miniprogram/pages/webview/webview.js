// pages/webview/webview.js
// web-view 壳子：加载本地 HTML，通过 URL 参数传递路由器配置
Page({
  data: {
    src: ''
  },

  onLoad(options) {
    const cfg = getApp().globalData?.currentRouter
    if (!cfg) {
      wx.switchTab({ url: '/pages/index/index' })
      return
    }
    // 把路由器配置编码到 URL 参数里传给本地 HTML
    const params = encodeURIComponent(JSON.stringify({
      host:      cfg.host,
      port:      cfg.port || 80,
      https:     cfg.https || false,
      ignoreSSL: cfg.ignoreSSL || false,
      username:  cfg.username || 'root',
      password:  cfg.password || '',
      label:     cfg.label || cfg.host,
    }))
    // 加载本地 HTML 文件
    this.setData({
      src: `/pages/webview/app.html?cfg=${params}`
    })
  },

  // 接收 H5 发来的消息（如：断开连接、切换路由器等）
  onMessage(e) {
    const msg = e.detail.data?.[0]
    if (!msg) return
    if (msg.action === 'disconnect') {
      getApp().globalData.currentRouter = null
      wx.switchTab({ url: '/pages/index/index' })
    } else if (msg.action === 'setTitle') {
      wx.setNavigationBarTitle({ title: msg.title || '路由器管理' })
    }
  },

  onShareAppMessage() {
    return { title: 'OpenWrt Manager', path: '/pages/index/index' }
  }
})

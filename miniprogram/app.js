// app.js
App({
  globalData: {
    currentRouter: null,  // { host, port, username, password, id, label }
    currentMgr:    null   // RouterManager 实例
  },

  onLaunch() {
    // 检查是否有上次保存的路由器（RouterManager 会在各页面初始化时 load）
    console.log('OpenWrt Manager 启动');
  }
});

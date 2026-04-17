// pages/add/add.js
const { RouterManager, OpenWrtClient, generateCaptchaCode, drawCaptcha } = require('../../utils/openwrt');

const mgr = new RouterManager();
mgr.load();

Page({
  data: {
    proto:     'http',    // 'http' | 'https'
    ignoreSSL: false,
    form: {
      label: '', host: '', port: 80,
      username: 'root', password: '',
      rememberPassword: true, autoLogin: false
    },
    showPwd:      false,
    captchaCode:  '',
    captchaInput: '',
    captchaWrong: false,
    testing:    false,
    testResult: '',
    testMsg:    '',
    saving:     false,
    errors:     {}
  },

  onLoad(options) {
    mgr.load();
    if (options.host) {
      const isHttps = options.https === 'true'
      this.setData({
        proto: isHttps ? 'https' : 'http',
        ignoreSSL: isHttps,
        'form.host': options.host,
        'form.port': isHttps ? 443 : 80,
        'form.label': `路由器(${options.host})`
      });
    }
    if (options.id) {
      const cfg = mgr.get(options.id);
      if (cfg) {
        this.setData({
          proto: cfg.https ? 'https' : 'http',
          ignoreSSL: cfg.ignoreSSL || false,
          form: { ...cfg, password: cfg.rememberPassword ? cfg.password : '' },
          editId: options.id
        });
      }
    }
    this._refreshCaptcha();
  },

  onReady() { this._drawCaptcha(); },

  _refreshCaptcha() {
    const code = generateCaptchaCode();
    this.setData({ captchaCode: code, captchaInput: '', captchaWrong: false });
    wx.nextTick(() => this._drawCaptcha());
  },

  _drawCaptcha() {
    const query = wx.createSelectorQuery();
    query.select('#captcha-canvas').fields({ node: true, size: true }).exec((res) => {
      if (!res[0]?.node) return;
      const canvas = res[0].node;
      canvas.width  = res[0].width  || 120;
      canvas.height = res[0].height || 44;
      drawCaptcha(canvas, this.data.captchaCode);
    });
  },

  onCaptchaTap() { this._refreshCaptcha(); },

  switchProto(e) {
    const proto = e.currentTarget.dataset.proto;
    const port  = proto === 'https' ? 443 : 80;
    this.setData({ proto, ignoreSSL: proto === 'https', 'form.port': port });
  },

  toggleSSL() {
    this.setData({ ignoreSSL: !this.data.ignoreSSL });
  },

  setField(e) {
    this.setData({ [`form.${e.currentTarget.dataset.field}`]: e.detail.value });
  },

  setPort(e) {
    this.setData({ 'form.port': parseInt(e.detail.value) || 80 });
  },

  togglePwd()   { this.setData({ showPwd: !this.data.showPwd }); },

  toggleRemember(e) {
    const v = e.detail.value.length > 0;
    this.setData({ 'form.rememberPassword': v, 'form.autoLogin': v ? this.data.form.autoLogin : false });
  },

  toggleAuto(e) {
    if (!this.data.form.rememberPassword) return;
    this.setData({ 'form.autoLogin': e.detail.value.length > 0 });
  },

  async testConnect() {
    const { form, proto, ignoreSSL } = this.data;
    if (!form.host) { wx.showToast({ title: '请先填写地址', icon: 'none' }); return; }
    this.setData({ testing: true, testResult: '', testMsg: '' });
    try {
      const client = new OpenWrtClient({
        host: form.host, port: form.port,
        https: proto === 'https', ignoreSSL,
        username: form.username, password: form.password
      });
      await client.login();
      this.setData({ testResult: 'ok', testMsg: '连接成功' });
    } catch(e) {
      this.setData({ testResult: 'fail', testMsg: e.message || '连接失败' });
    }
    this.setData({ testing: false });
  },

  async onSave() {
    const { form, captchaCode, captchaInput, proto, ignoreSSL } = this.data;
    const errs = {};
    if (!form.host)     errs.host     = '请填写路由器地址';
    if (!form.password) errs.password = '请填写密码';
    if (captchaInput.trim().toLowerCase() !== captchaCode.toLowerCase()) {
      errs.captcha = '验证码错误';
      this.setData({ captchaWrong: true });
      setTimeout(() => { this.setData({ captchaWrong: false }); this._refreshCaptcha(); }, 500);
    }
    this.setData({ errors: errs });
    if (Object.keys(errs).length) return;

    this.setData({ saving: true });

    // 先测试连接
    try {
      const client = new OpenWrtClient({
        host: form.host, port: form.port,
        https: proto === 'https', ignoreSSL,
        username: form.username, password: form.password
      });
      await client.login();
    } catch(e) {
      this.setData({ saving: false });
      wx.showModal({ title: '连接失败', content: e.message, showCancel: false });
      return;
    }

    const id = mgr.add({
      id: this.data.editId,
      label:    form.label || form.host,
      host:     form.host,
      port:     form.port,
      https:    proto === 'https',
      ignoreSSL,
      username: form.username,
      password: form.rememberPassword ? form.password : '',
      rememberPassword: form.rememberPassword,
      autoLogin: form.autoLogin,
      addedAt:  Date.now()
    });

    getApp().globalData.currentRouter = { ...mgr.get(id), password: form.password };
    getApp().globalData.currentMgr    = mgr;

    this.setData({ saving: false });
    wx.navigateTo({ url: '/pages/webview/webview' });
  }
});

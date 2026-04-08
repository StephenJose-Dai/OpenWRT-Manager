// pages/add/add.js
const { RouterManager, OpenWrtClient, generateCaptchaCode, drawCaptcha } = require('../../utils/openwrt');

const mgr = new RouterManager();
mgr.load();

Page({
  data: {
    // 表单
    form: {
      label: '', host: '', port: 80,
      username: 'root', password: '',
      rememberPassword: true, autoLogin: false
    },
    showPwd:      false,
    captchaCode:  '',
    captchaInput: '',
    captchaWrong: false,
    // 状态
    testing:    false,
    testResult: '',   // '' | 'ok' | 'fail'
    saving:     false,
    errors:     {}
  },

  onLoad(options) {
    mgr.load();

    // 从扫描页带过来的 host
    if (options.host) {
      this.setData({ 'form.host': options.host, 'form.label': `路由器(${options.host})` });
    }

    // 编辑模式
    if (options.id) {
      const cfg = mgr.get(options.id);
      if (cfg) {
        this.setData({ form: { ...cfg, password: cfg.rememberPassword ? cfg.password : '' }, editId: options.id });
      }
    }

    this._refreshCaptcha();
  },

  onReady() {
    this._drawCaptcha();
  },

  _refreshCaptcha() {
    const code = generateCaptchaCode();
    this.setData({ captchaCode: code, captchaInput: '', captchaWrong: false });
    // 延迟一帧再绘制
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

  setField(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  setPort(e) {
    this.setData({ 'form.port': parseInt(e.detail.value) || 80 });
  },

  togglePwd() { this.setData({ showPwd: !this.data.showPwd }); },

  toggleRemember(e) {
    const v = e.detail.value.length > 0;
    this.setData({ 'form.rememberPassword': v, 'form.autoLogin': v ? this.data.form.autoLogin : false });
  },

  toggleAuto(e) {
    if (!this.data.form.rememberPassword) return;
    this.setData({ 'form.autoLogin': e.detail.value.length > 0 });
  },

  // ─── 测试连接 ───────────────────────────────────────
  async testConnect() {
    const { host, port, username, password } = this.data.form;
    if (!host) { wx.showToast({ title: '请先填写地址', icon: 'none' }); return; }
    this.setData({ testing: true, testResult: '' });
    try {
      const client = new OpenWrtClient({ host, port, username, password });
      await client.login();
      this.setData({ testResult: 'ok' });
    } catch {
      this.setData({ testResult: 'fail' });
    }
    this.setData({ testing: false });
  },

  // ─── 保存 ───────────────────────────────────────────
  async onSave() {
    const { form, captchaCode, captchaInput } = this.data;
    const errs = {};

    if (!form.host)     errs.host     = '请填写路由器地址';
    if (!form.password) errs.password = '请填写密码';

    const codeOk = captchaInput.trim().toLowerCase() === captchaCode.toLowerCase();
    if (!codeOk) {
      errs.captcha = '验证码错误';
      this.setData({ captchaWrong: true });
      setTimeout(() => {
        this.setData({ captchaWrong: false });
        this._refreshCaptcha();
      }, 500);
    }

    this.setData({ errors: errs });
    if (Object.keys(errs).length) return;

    this.setData({ saving: true });

    const id = mgr.add({
      id:              this.data.editId,
      label:           form.label || form.host,
      host:            form.host,
      port:            form.port,
      username:        form.username,
      password:        form.rememberPassword ? form.password : '',
      rememberPassword:form.rememberPassword,
      autoLogin:       form.autoLogin,
      addedAt:         Date.now()
    });

    // 把密码和配置传给全局以便直接连接
    getApp().globalData.currentRouter = { ...mgr.get(id), password: form.password };
    getApp().globalData.currentMgr    = mgr;

    this.setData({ saving: false });
    wx.switchTab({ url: '/pages/dashboard/dashboard' });
  }
});

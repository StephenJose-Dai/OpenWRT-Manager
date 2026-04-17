// pages/system/system.js
const { OpenWrtClient, fmtUptime } = require('../../utils/openwrt');

Page({
  data: {
    info:         null,
    log:          [],
    wifiNetworks: [],
    loading:      false,
    logLoading:   false,
    tab:          'info',   // info | wifi | log
    // WiFi 修改密码
    wifiForm: { iface: '', ssid: '', password: '', showPwd: false },
    wifiSaving: false
  },

  _client: null,

  onLoad() {
    const cfg = getApp().globalData?.currentRouter;
    if (!cfg) { wx.switchTab({ url: '/pages/index/index' }); return; }
    this._client = new OpenWrtClient(cfg);
    this._fetchInfo();
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ tab });
    if (tab === 'log'  && this.data.log.length === 0)          this._fetchLog();
    if (tab === 'wifi' && this.data.wifiNetworks.length === 0) this._fetchWifi();
  },

  async _fetchInfo() {
    this.setData({ loading: true });
    try {
      const info = await this._client.getSystemInfo();
      this.setData({ info, loading: false });
    } catch {
      this.setData({ loading: false });
    }
  },

  async _fetchLog() {
    this.setData({ logLoading: true });
    try {
      const lines = await this._client.getLog();
      // 预处理 log 行，避免在 wxml 里调用 .includes()
      const log = lines.slice(-200).reverse().map(line => ({
        text:  line,
        level: /err|ERR|error|ERROR/.test(line) ? 'log-err'
             : /warn|WARN|warning/.test(line)    ? 'log-warn'
             : 'log-normal'
      }));
      this.setData({ log, logLoading: false });
    } catch {
      this.setData({ logLoading: false });
    }
  },

  async _fetchWifi() {
    try {
      const raw = await this._client.call('uci', 'get', { config: 'wireless' });
      const values = raw.values || {};
      const nets = [];
      const netMap = {};

      Object.entries(values).forEach(([k, v]) => {
        // 匹配 wireless.SECTION.FIELD
        const parts = k.split('.');
        if (parts.length === 3 && parts[0] === 'wireless') {
          const [, section, field] = parts;
          if (!netMap[section]) netMap[section] = { _section: section };
          netMap[section][field] = v;
        }
      });

      Object.values(netMap).forEach(n => {
        if (n.ssid || n.mode === 'ap') nets.push(n);
      });

      this.setData({
        wifiNetworks: nets,
        wifiForm: nets.length ? { ...this.data.wifiForm, iface: nets[0]._section, ssid: nets[0].ssid } : this.data.wifiForm
      });
    } catch {
      wx.showToast({ title: '读取 WiFi 配置失败', icon: 'none' });
    }
  },

  onWifiSelect(e) {
    const section = e.currentTarget.dataset.section;
    const net = this.data.wifiNetworks.find(n => n._section === section);
    if (net) this.setData({ 'wifiForm.iface': section, 'wifiForm.ssid': net.ssid || '' });
  },

  setWifiField(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [`wifiForm.${field}`]: e.detail.value });
  },
  toggleWifiPwd() { this.setData({ 'wifiForm.showPwd': !this.data.wifiForm.showPwd }); },

  async saveWifiPassword() {
    const { iface, password } = this.data.wifiForm;
    if (!iface)  { wx.showToast({ title: '请选择网络', icon: 'none' }); return; }
    if (password.length < 8) { wx.showToast({ title: '密码至少8位', icon: 'none' }); return; }

    this.setData({ wifiSaving: true });
    try {
      await this._client.call('uci', 'set', {
        config: 'wireless', section: iface, values: { key: password }
      });
      await this._client.call('uci', 'commit', { config: 'wireless' });
      await this._client.execCommand('wifi').catch(() => {});
      wx.showToast({ title: 'WiFi密码已更新', icon: 'success' });
      this.setData({ wifiSaving: false, 'wifiForm.password': '' });
    } catch {
      this.setData({ wifiSaving: false });
      wx.showToast({ title: '修改失败', icon: 'none' });
    }
  },

  onReboot() {
    wx.showModal({
      title: '重启路由器',
      content: `确定重启 ${this.data.info?.hostname || '路由器'}？`,
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await this._client.reboot();
          wx.showToast({ title: '正在重启...', icon: 'none', duration: 3000 });
        } catch {
          wx.showToast({ title: '重启指令已发送', icon: 'none' });
        }
      }
    });
  },

  async checkUpgrade() {
    wx.showLoading({ title: '检查更新中...' });
    try {
      const res = await this._client.execCommand('opkg', ['list-upgradable']);
      wx.hideLoading();
      const output = res.stdout || '';
      if (!output.trim()) {
        wx.showToast({ title: '已是最新版本', icon: 'success' });
      } else {
        const count = output.trim().split('\n').length;
        wx.showModal({
          title: `有 ${count} 个包可升级`,
          content: output.split('\n').slice(0, 5).join('\n') + (count > 5 ? '\n...' : ''),
          showCancel: false
        });
      }
    } catch {
      wx.hideLoading();
      wx.showToast({ title: '检查失败', icon: 'none' });
    }
  }
});

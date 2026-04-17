// pages/devices/devices.js
const { OpenWrtClient } = require('../../utils/openwrt');

Page({
  data: {
    devices:         [],
    filteredDevices: [],
    loading:  false,
    keyword:  '',
    kicking:  null
  },

  _client: null,

  onLoad() {
    const cfg = getApp().globalData?.currentRouter;
    if (!cfg) { wx.switchTab({ url: '/pages/index/index' }); return; }
    this._client = new OpenWrtClient(cfg);
    this._fetch();
  },

  onShow() { if (this._client) this._fetch(); },
  onPullDownRefresh() { this._fetch().then(() => wx.stopPullDownRefresh()); },

  async _fetch() {
    this.setData({ loading: true });
    try {
      const leases = await this._client.getDHCPLeases();
      // 去重
      const seen = new Set();
      const unique = leases.filter(d => {
        const key = d.mac || d.ip;
        if (seen.has(key)) return false;
        seen.add(key); return true;
      }).map(d => ({
        ...d,
        // 预处理首字母，避免在 wxml 里调用 JS 方法
        initial: (d.hostname || d.ip || '?').charAt(0).toUpperCase()
      }));
      this.setData({ devices: unique, loading: false });
      this._applyFilter();
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: e.message || '获取设备失败', icon: 'none' });
    }
  },

  _applyFilter() {
    const kw = (this.data.keyword || '').toLowerCase().trim();
    if (!kw) {
      this.setData({ filteredDevices: this.data.devices });
      return;
    }
    const filtered = this.data.devices.filter(d =>
      (d.hostname || '').toLowerCase().includes(kw) ||
      (d.ip || '').includes(kw) ||
      (d.mac || '').toLowerCase().includes(kw)
    );
    this.setData({ filteredDevices: filtered });
  },

  onSearch(e) {
    this.setData({ keyword: e.detail.value });
    this._applyFilter();
  },

  async onKick(e) {
    const { mac, hostname, ip } = e.currentTarget.dataset;
    wx.showModal({
      title: '踢出设备',
      content: `确定踢出「${hostname || ip}」(${mac})？`,
      success: async (res) => {
        if (!res.confirm) return;
        this.setData({ kicking: mac });
        try {
          await this._client.execCommand('iptables', [
            '-I', 'FORWARD', '-m', 'mac', '--mac-source', mac, '-j', 'DROP'
          ]);
          wx.showToast({ title: '已踢出', icon: 'success' });
          const devices = this.data.devices.filter(d => d.mac !== mac);
          this.setData({ devices, kicking: null });
          this._applyFilter();
        } catch {
          this.setData({ kicking: null });
          wx.showToast({ title: '操作失败', icon: 'none' });
        }
      }
    });
  }
});

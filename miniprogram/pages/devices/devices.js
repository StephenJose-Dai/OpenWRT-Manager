// pages/devices/devices.js
const { OpenWrtClient } = require('../../utils/openwrt');

Page({
  data: {
    devices:  [],
    loading:  false,
    keyword:  '',
    kicking:  null   // 正在踢出的 MAC
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
      // 去重（有时同一设备有多条租约）
      const seen = new Set();
      const unique = leases.filter(d => {
        if (seen.has(d.mac)) return false;
        seen.add(d.mac); return true;
      });
      this.setData({ devices: unique, loading: false });
    } catch {
      this.setData({ loading: false });
      wx.showToast({ title: '获取设备列表失败', icon: 'none' });
    }
  },

  onSearch(e) { this.setData({ keyword: e.detail.value }); },

  get filtered() {
    const kw = this.data.keyword.toLowerCase();
    if (!kw) return this.data.devices;
    return this.data.devices.filter(d =>
      (d.hostname || '').toLowerCase().includes(kw) ||
      d.ip.includes(kw) ||
      d.mac.toLowerCase().includes(kw)
    );
  },

  // 踢出设备（通过 iptables DROP）
  async onKick(e) {
    const { mac, hostname, ip } = e.currentTarget.dataset;
    wx.showModal({
      title: '踢出设备',
      content: `确定踢出设备「${hostname || ip}」(${mac})？`,
      success: async (res) => {
        if (!res.confirm) return;
        this.setData({ kicking: mac });
        try {
          await this._client.execCommand('iptables', [
            '-I', 'FORWARD', '-m', 'mac', '--mac-source', mac, '-j', 'DROP'
          ]);
          wx.showToast({ title: '已踢出', icon: 'success' });
          // 从列表移除
          this.setData({
            devices: this.data.devices.filter(d => d.mac !== mac),
            kicking: null
          });
        } catch {
          this.setData({ kicking: null });
          wx.showToast({ title: '操作失败', icon: 'none' });
        }
      }
    });
  },

  // 格式化过期时间
  fmtExpiry(ts) {
    if (!ts || ts <= 0) return '永久';
    const d = new Date(ts * 1000);
    return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
});

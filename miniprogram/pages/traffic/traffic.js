// pages/traffic/traffic.js
const { OpenWrtClient } = require('../../utils/openwrt');

Page({
  data: {
    interfaces: [],
    activeIface: '',
    history:     [],   // 最近 20 个采样点 [{rx, tx, ts}]
    current:     null, // {rx, tx, rxFmt, txFmt}
    totalRx:     0,
    totalTx:     0,
    loading:     false
  },

  _client: null,
  _timer:  null,
  _prev:   null,   // 上次原始字节数（计算速率用）

  onLoad() {
    const cfg = getApp().globalData?.currentRouter;
    if (!cfg) { wx.switchTab({ url: '/pages/index/index' }); return; }
    this._client = new OpenWrtClient(cfg);
    this._fetchIfaces();
  },

  onUnload() { if (this._timer) clearInterval(this._timer); },

  async _fetchIfaces() {
    this.setData({ loading: true });
    try {
      const ifaces = await this._client.getNetworkInterfaces();
      const names  = ifaces.map(i => i.name);
      const active = names.includes('wan') ? 'wan' : names[0] || '';
      this.setData({ interfaces: ifaces, activeIface: active, loading: false });
      this._startPolling();
    } catch {
      this.setData({ loading: false });
    }
  },

  _startPolling() {
    this._poll();
    this._timer = setInterval(() => this._poll(), 3000);
  },

  async _poll() {
    if (!this._client || !this.data.activeIface) return;
    try {
      const ifaces  = await this._client.getNetworkInterfaces();
      const target  = ifaces.find(i => i.name === this.data.activeIface);
      if (!target) return;

      const now = { rx: target.rx || 0, tx: target.tx || 0, ts: Date.now() };

      let rxRate = 0, txRate = 0;
      if (this._prev) {
        const dt = (now.ts - this._prev.ts) / 1000;
        if (dt > 0) {
          rxRate = Math.max(0, (now.rx - this._prev.rx) / dt);
          txRate = Math.max(0, (now.tx - this._prev.tx) / dt);
        }
      }
      this._prev = now;

      const snap = { rx: rxRate, tx: txRate, ts: now.ts };
      const history = [...this.data.history, snap].slice(-20);

      this.setData({
        history,
        current: {
          rx: rxRate, tx: txRate,
          rxFmt: fmtSpeed(rxRate),
          txFmt: fmtSpeed(txRate)
        },
        totalRx: now.rx,
        totalTx: now.tx
      });
    } catch {}
  },

  onIfaceTap(e) {
    const name = e.currentTarget.dataset.name;
    this._prev = null;
    this.setData({ activeIface: name, history: [], current: null });
  }
});

function fmtSpeed(bps) {
  if (bps < 1024)       return `${Math.round(bps)} B/s`;
  if (bps < 1048576)    return `${(bps/1024).toFixed(1)} KB/s`;
  return `${(bps/1048576).toFixed(2)} MB/s`;
}

function fmtBytes(b) {
  if (b < 1024)      return `${b} B`;
  if (b < 1048576)   return `${(b/1024).toFixed(1)} KB`;
  if (b < 1073741824)return `${(b/1048576).toFixed(1)} MB`;
  return `${(b/1073741824).toFixed(2)} GB`;
}

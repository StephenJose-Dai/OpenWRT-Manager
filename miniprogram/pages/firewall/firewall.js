// pages/firewall/firewall.js
const { OpenWrtClient } = require('../../utils/openwrt');

Page({
  data: {
    rules:      [],
    zones:      [],
    loading:    false,
    showForm:   false,
    saving:     false,
    form: {
      name: '', src: 'wan', dest: 'lan',
      proto: 'tcp', destPort: '', target: 'ACCEPT'
    }
  },

  _client: null,

  onLoad() {
    const cfg = getApp().globalData?.currentRouter;
    if (!cfg) { wx.switchTab({ url: '/pages/index/index' }); return; }
    this._client = new OpenWrtClient(cfg);
    this._fetch();
  },

  async _fetch() {
    this.setData({ loading: true });
    try {
      // 读取 firewall UCI 配置
      const fw = await this._client.call('uci', 'get', { config: 'firewall' });
      const values = fw.values || {};

      // 解析规则（格式：firewall.@rule[N].xxx）
      const rules = [];
      const ruleMap = {};
      Object.entries(values).forEach(([k, v]) => {
        const m = k.match(/^firewall\.@rule\[(\d+)\]\.(\w+)$/);
        if (m) {
          const idx = m[1], field = m[2];
          if (!ruleMap[idx]) ruleMap[idx] = { _idx: parseInt(idx) };
          ruleMap[idx][field] = v;
        }
      });
      Object.values(ruleMap).sort((a,b) => a._idx - b._idx).forEach(r => rules.push(r));

      // 解析 zone
      const zones = [];
      const zoneMap = {};
      Object.entries(values).forEach(([k, v]) => {
        const m = k.match(/^firewall\.@zone\[(\d+)\]\.(\w+)$/);
        if (m) {
          const idx = m[1], field = m[2];
          if (!zoneMap[idx]) zoneMap[idx] = {};
          zoneMap[idx][field] = v;
        }
      });
      Object.values(zoneMap).forEach(z => { if (z.name) zones.push(z.name); });

      this.setData({ rules, zones: zones.length ? zones : ['wan','lan'], loading: false });
    } catch {
      this.setData({ loading: false });
      wx.showToast({ title: '读取防火墙配置失败', icon: 'none' });
    }
  },

  setField(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  toggleForm() { this.setData({ showForm: !this.data.showForm }); },

  async onAddRule() {
    const { form } = this.data;
    if (!form.name) { wx.showToast({ title: '请填写规则名称', icon: 'none' }); return; }
    this.setData({ saving: true });
    try {
      // uci add → set → commit → reload
      const addRes = await this._client.call('uci', 'add', { config: 'firewall', type: 'rule' });
      const section = addRes.section;
      await this._client.call('uci', 'set', {
        config: 'firewall', section,
        values: {
          name:      form.name,
          src:       form.src,
          dest:      form.dest,
          proto:     form.proto,
          dest_port: form.destPort || undefined,
          target:    form.target
        }
      });
      await this._client.call('uci', 'commit', { config: 'firewall' });
      // 重载防火墙
      await this._client.execCommand('/etc/init.d/firewall', ['reload']).catch(() => {});

      wx.showToast({ title: '规则已添加', icon: 'success' });
      this.setData({
        showForm: false,
        saving: false,
        form: { name:'', src:'wan', dest:'lan', proto:'tcp', destPort:'', target:'ACCEPT' }
      });
      this._fetch();
    } catch (e) {
      this.setData({ saving: false });
      wx.showToast({ title: '添加失败: ' + e.message, icon: 'none' });
    }
  },

  async onDeleteRule(e) {
    const idx = e.currentTarget.dataset.idx;
    wx.showModal({
      title: '删除规则', content: '确定删除这条防火墙规则？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await this._client.call('uci', 'delete', { config: 'firewall', type: 'rule', match: { '.index': idx } });
          await this._client.call('uci', 'commit', { config: 'firewall' });
          await this._client.execCommand('/etc/init.d/firewall', ['reload']).catch(() => {});
          wx.showToast({ title: '已删除', icon: 'success' });
          this._fetch();
        } catch {
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      }
    });
  }
});

// 在 traffic.js 末尾追加：Canvas 图表绘制（通过 observer 监听 history 变化）
// 注意：此代码需要合并到 traffic.js 的 Page({}) 中

// 在 Page 配置中添加：
const CHART_EXTRA = {
  observers: {
    'history': function(history) {
      if (history.length < 2) return;
      this._drawChart(history);
    }
  },

  _drawChart(history) {
    const query = wx.createSelectorQuery();
    query.select('#traffic-chart').fields({ node: true, size: true }).exec((res) => {
      if (!res[0]?.node) return;
      const canvas = res[0].node;
      const w = res[0].width  || 320;
      const h = res[0].height || 100;
      canvas.width  = w;
      canvas.height = h;

      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, w, h);

      // 网格线
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth   = 1;
      for (let i = 0; i <= 4; i++) {
        const y = (h / 4) * i;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }

      const maxVal = Math.max(...history.map(s => Math.max(s.rx, s.tx)), 1024);
      const pts    = history.length;
      const stepX  = w / (pts - 1);

      const drawLine = (key, color) => {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth   = 2;
        ctx.lineJoin    = 'round';
        history.forEach((s, i) => {
          const x = i * stepX;
          const y = h - (s[key] / maxVal) * h * 0.9;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();

        // 填充
        ctx.lineTo((pts - 1) * stepX, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fillStyle = color.replace(')', ',0.15)').replace('rgb', 'rgba');
        ctx.fill();
      };

      drawLine('rx', 'rgb(96,165,250)');   // 蓝色 - 下行
      drawLine('tx', 'rgb(52,211,153)');   // 绿色 - 上行

      // 图例
      ctx.font = '11px Arial';
      ctx.fillStyle = 'rgb(96,165,250)';
      ctx.fillRect(8, 8, 10, 10);
      ctx.fillStyle = '#aaa';
      ctx.fillText('↓下行', 22, 18);

      ctx.fillStyle = 'rgb(52,211,153)';
      ctx.fillRect(72, 8, 10, 10);
      ctx.fillStyle = '#aaa';
      ctx.fillText('↑上行', 86, 18);
    });
  }
};

module.exports = CHART_EXTRA;

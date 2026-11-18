/* ECharts 图表：统一的瓷感学术排版主题，支持三大釉色主题实时切换。
 * 数据严谨约定：所有统计分析图表始终仅显示真实记录值；插值仅在单站曲线平滑模式下以虚线标示并明确标注「非实测」。 */
(function (g) {
  'use strict';
  var HZ = g.HZ = g.HZ || {};

  var T = {
    ink: '#102536', ink2: '#38556a', ink3: '#648094',
    rule: '#d4e2ec', ruleSoft: '#e7eff5', paper: '#fbfdff',
    seal: '#b8823b', accent: '#1f7496', warn: '#b45263',
    bar: '#2d7d9e', barTop: '#53a3c2', barSoft: '#a7cadb',
    interp: '#7d96a8', rank: '#1f7496', rankTop: '#4798b8',
    trend: '#1f7496', trendAreaTop: 'rgba(31, 116, 150, 0.24)', trendAreaBottom: 'rgba(31, 116, 150, 0.01)',
    font: "'HZ Song', '方正宋刻本秀楷简繁', '方正宋刻本秀楷简体', 'MiSans', 'Microsoft YaHei', sans-serif",
    numFont: "'MiSans', 'Inter', 'Segoe UI', system-ui, sans-serif",
    serif: "'HZ Serif', 'Noto Serif SC', 'HZ Song', serif",
    districts: ['#237696', '#469689', '#5675ab', '#7c6da8', '#b26b7c', '#5b8e72', '#7e99ad', '#b88856'],
    periods: [
      { key: 'night', label: '凌晨 0–5 时', from: 0, to: 5, color: '#9ebcd0' },
      { key: 'am', label: '早间 6–8 时', from: 6, to: 8, color: '#d09748' },
      { key: 'day', label: '日间 9–15 时', from: 9, to: 15, color: '#2e819f' },
      { key: 'pm', label: '傍晚及夜间 16–23 时', from: 16, to: 23, color: '#596da3' }
    ]
  };

  function syncPalette() {
    if (!g.HZ_PALETTE) return;
    Object.assign(T, g.HZ_PALETTE.charts);
    if (g.HZ_PALETTE.periods) {
      T.periods = T.periods.map(function (p, i) {
        return Object.assign({}, p, { color: g.HZ_PALETTE.periods[i] || p.color });
      });
    }
  }
  syncPalette();

  function fmt(v) { return Number.isFinite(v) ? Math.round(v).toLocaleString('zh-CN') : '—'; }
  function wan(v) { return v >= 10000 ? (v / 10000).toFixed(v >= 100000 ? 0 : 1) + '万' : String(Math.round(v)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function hh(h) { return (h < 10 ? '0' : '') + h; }

  function linGrad(x0, y0, x1, y1, c0, c1) {
    if (g.echarts && g.echarts.graphic && g.echarts.graphic.LinearGradient) {
      return new g.echarts.graphic.LinearGradient(x0, y0, x1, y1, [
        { offset: 0, color: c0 },
        { offset: 1, color: c1 }
      ]);
    }
    return c0;
  }

  function isDark() { return !!(g.HZ_PALETTE && g.HZ_PALETTE.dark); }

  function base(anim) {
    var shadow = isDark() ? '0 12px 28px rgba(0,0,0,.45)' : '0 10px 26px rgba(14,38,56,.13)';
    return {
      animation: anim !== false,
      animationDuration: 380,
      animationDurationUpdate: 280,
      textStyle: { fontFamily: T.font, color: T.ink2, fontSize: 12.5 },
      aria: { enabled: true },
      tooltip: {
        confine: true,
        backgroundColor: T.paper,
        borderColor: T.rule,
        borderWidth: 1,
        padding: [9, 13],
        extraCssText: 'border-radius:10px;box-shadow:' + shadow + ';backdrop-filter:blur(12px);',
        textStyle: { color: T.ink, fontFamily: T.font, fontSize: 13, lineHeight: 20 }
      }
    };
  }

  function axisCommon() {
    return {
      axisLine: { lineStyle: { color: T.rule } },
      axisTick: { show: false },
      axisLabel: { color: T.ink3, fontSize: 11.5, fontFamily: T.numFont },
      splitLine: { lineStyle: { color: T.ruleSoft || T.rule, type: [3, 4] } }
    };
  }

  function empty(show, text) {
    return show ? [{
      type: 'text', left: 'center', top: 'middle', silent: true,
      style: { text: text || '所选日期暂无可用记录', fill: T.ink3, font: '13.5px ' + T.font }
    }] : [];
  }

  function hours24() { var a = []; for (var h = 0; h < 24; h++) a.push(hh(h)); return a; }

  /** 小时潮柱：记录小时为渐变圆角柱，当前时刻以流金高亮，无记录小时在基线上标出虚线空槽；可选插值虚线。 */
  function hourlyOption(opt) {
    var s = opt.series, factor = opt.factor || 1, hour = opt.hour, anchors = opt.anchors || [];
    var bars = [], gaps = [], interp = [];
    var maxV = 0;
    var curH = Math.floor(Math.min(23.999, Math.max(0, hour)));
    var normalFill = linGrad(0, 0, 0, 1, T.barTop || T.bar, T.bar);
    var activeFill = linGrad(0, 0, 0, 1, T.seal, T.seal);

    for (var h = 0; h < 24; h++) {
      var v = s ? s[h] : NaN;
      if (v === v) {
        bars.push({
          value: v * factor,
          itemStyle: {
            color: curH === h ? activeFill : normalFill,
            borderRadius: [3.5, 3.5, 0, 0]
          }
        });
        maxV = Math.max(maxV, v * factor);
        gaps.push(null);
      } else {
        bars.push(null);
        gaps.push(0);
      }
    }

    if (opt.showInterp && anchors.length > 1) {
      for (var k = 0; k < 24; k++) interp.push(null);
      for (var i = 0; i < anchors.length - 1; i++) {
        var a = anchors[i], b = anchors[i + 1];
        if (b - a > 1) {
          for (var x = a; x <= b; x++) interp[x] = (s[a] + (s[b] - s[a]) * (x - a) / (b - a)) * factor;
        }
      }
    }

    var series = [
      {
        name: opt.recordName || '记录值',
        type: 'bar',
        barWidth: '60%',
        data: bars,
        z: 3,
        itemStyle: { color: normalFill, borderRadius: [3.5, 3.5, 0, 0] },
        emphasis: { itemStyle: { color: T.seal } }
      },
      {
        name: '无记录',
        type: 'scatter',
        data: gaps,
        symbol: 'roundRect',
        symbolSize: [9, 3],
        itemStyle: { color: 'rgba(0,0,0,0)', borderColor: T.ink3, borderWidth: 1, borderType: 'dashed' },
        silent: true,
        z: 2,
        tooltip: { show: false }
      }
    ];

    if (opt.benchSeries) {
      var benchData = [];
      for (var bh = 0; bh < 24; bh++) {
        var bv = opt.benchSeries[bh];
        benchData.push(bv === bv ? +(bv * factor).toFixed(1) : null);
      }
      if (benchData.some(function (x) { return x !== null; })) {
        series.push({
          name: opt.benchName || '所在区站均',
          type: 'line',
          data: benchData,
          connectNulls: false,
          symbol: 'circle',
          symbolSize: 4,
          smooth: 0.15,
          z: 5,
          lineStyle: { color: T.warn, width: 1.5, type: [4, 3] },
          itemStyle: { color: T.warn },
          silent: true
        });
      }
    }

    if (opt.showInterp && interp.some(function (v) { return v !== null; })) {
      series.push({
        name: '插值连线（非实测）',
        type: 'line',
        data: interp,
        connectNulls: false,
        symbol: 'circle',
        symbolSize: 3,
        smooth: false,
        z: 4,
        lineStyle: { color: T.interp, width: 1.5, type: [4, 4] },
        itemStyle: { color: T.interp },
        silent: true,
        tooltip: { show: false }
      });
    }

    series[0].markLine = {
      silent: true,
      symbol: ['none', 'circle'],
      symbolSize: 5,
      animation: false,
      lineStyle: { color: T.seal, width: 1.5, type: 'solid' },
      label: { show: false },
      data: [{ xAxis: curH }]
    };

    var ax = axisCommon();
    return Object.assign(base(opt.animate), {
      grid: { left: 46, right: 12, top: opt.legend ? 34 : 14, bottom: 26 },
      legend: opt.legend ? {
        top: 0, left: 0, itemWidth: 12, itemHeight: 8, icon: 'roundRect',
        textStyle: { color: T.ink2, fontSize: 12 },
        data: series.map(function (x) { return x.name; }).filter(function (n) { return n !== '无记录'; })
      } : undefined,
      tooltip: Object.assign(base().tooltip, {
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: isDark() ? 'rgba(76,194,232,.08)' : 'rgba(31,116,150,.07)' } },
        formatter: function (ps) {
          var h2 = Number(ps[0].axisValue), v2 = s ? s[h2] : NaN;
          var bv2 = opt.benchSeries ? opt.benchSeries[h2] : NaN;
          var head = '<b style="font-family:' + T.numFont + '">' + hh(h2) + ':00 – ' + hh(h2) + ':59</b><br/>';
          var benchLine = (bv2 === bv2) ? '<br/><span style="color:' + T.warn + '">' + esc(opt.benchName || '所在区站均') + '：' + fmt(bv2 * factor) + ' 人次</span>' : '';
          if (v2 === v2) {
            return head + '记录 <b>' + fmt(v2) + '</b> 人次' +
              (factor !== 1 ? '<br/><span style="color:' + T.warn + '">情景推演 ' + fmt(v2 * factor) + '（× ' + factor + '，非实测）</span>' : '') +
              benchLine;
          }
          var it = interp[h2];
          return head + '当日无记录' + (it != null ? '<br/><span style="color:' + T.ink3 + '">插值约 ' + fmt(it) + '（非实测）</span>' : '') + benchLine;
        }
      }),
      xAxis: Object.assign({}, ax, {
        type: 'category',
        data: hours24(),
        axisLabel: Object.assign({}, ax.axisLabel, { interval: opt.dense ? 1 : 2 })
      }),
      yAxis: Object.assign({}, ax, {
        type: 'value',
        splitNumber: 3,
        axisLabel: Object.assign({}, ax.axisLabel, { formatter: wan }),
        axisLine: { show: false }
      }),
      series: series,
      graphic: empty(maxV === 0 && !(s && Array.prototype.some.call(s, function (v) { return v === v; })), opt.emptyText)
    });
  }

  /** 分区占比环形图：中心展示 1,800 站当日总计或当前聚焦区数值。 */
  function donutOption(districts, focus) {
    var sum = districts.reduce(function (a, d) { return a + d.total; }, 0);
    var focusedObj = focus ? districts.filter(function (d) { return d.name === focus; })[0] : null;
    var centerTitle = focusedObj ? focusedObj.name : '1,800 站合计';
    var centerVal = focusedObj ? wan(focusedObj.total) : wan(sum);

    var graphics = sum === 0 ? empty(true) : [
      {
        type: 'group', left: 'center', top: 'middle', silent: true,
        children: [
          {
            type: 'text', left: 'center', top: -13,
            style: { text: centerTitle, fill: T.ink3, font: '12px ' + T.font, textAlign: 'center' }
          },
          {
            type: 'text', left: 'center', top: 5,
            style: { text: centerVal, fill: T.ink, font: '700 18px ' + T.numFont, textAlign: 'center' }
          }
        ]
      }
    ];

    return Object.assign(base(), {
      tooltip: Object.assign(base().tooltip, {
        trigger: 'item',
        formatter: function (p) {
          return '<b>' + esc(p.name) + '</b><br/>记录 <b>' + fmt(p.value) + '</b> 人次<br/>占 1,800 站合计 ' + p.percent + '%';
        }
      }),
      series: [{
        type: 'pie',
        radius: ['48%', '77%'],
        center: ['50%', '50%'],
        minAngle: 2,
        avoidLabelOverlap: true,
        selectedMode: 'single',
        selectedOffset: 6,
        itemStyle: { borderColor: T.paper, borderWidth: 2, borderRadius: 4 },
        label: {
          show: true,
          position: 'outside',
          formatter: function (p) { return p.percent >= 4 ? p.name + '\n' + Math.round(p.percent) + '%' : ''; },
          color: T.ink2,
          fontSize: 12,
          lineHeight: 16
        },
        labelLine: { length: 7, length2: 7, lineStyle: { color: T.rule } },
        data: districts.map(function (d, i) {
          return {
            name: d.name,
            value: d.total,
            selected: focus === d.name,
            itemStyle: {
              color: T.districts[i % T.districts.length],
              opacity: focus && focus !== d.name ? 0.32 : 1
            }
          };
        })
      }],
      graphic: graphics
    });
  }

  /** 各区四时段堆叠横条图 */
  function periodOption(districts, focus) {
    var names = districts.map(function (d) { return d.name; });
    var series = T.periods.map(function (p, pi) {
      var isLast = pi === T.periods.length - 1;
      return {
        name: p.label,
        type: 'bar',
        stack: 'p',
        barWidth: '56%',
        itemStyle: {
          color: p.color,
          borderRadius: isLast ? [0, 3, 3, 0] : 0
        },
        data: districts.map(function (d) {
          var s = 0;
          for (var h = p.from; h <= p.to; h++) { var v = d.byHour[h]; if (v === v) s += v; }
          return { value: s, itemStyle: { opacity: focus && focus !== d.name ? 0.32 : 1 } };
        })
      };
    });
    var ax = axisCommon();
    return Object.assign(base(), {
      grid: { left: 58, right: 16, top: 44, bottom: 24 },
      legend: {
        top: 0, left: 0, itemWidth: 10, itemHeight: 10, icon: 'roundRect',
        textStyle: { color: T.ink2, fontSize: 11.5 }
      },
      tooltip: Object.assign(base().tooltip, {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: function (ps) {
          return '<b>' + esc(ps[0].axisValue) + '</b><br/>' +
            ps.map(function (p) { return p.marker + p.seriesName + '：<b>' + fmt(p.value) + '</b>'; }).join('<br/>') +
            '<br/><span style="color:' + T.ink3 + '">仅累加当日有记录的小时</span>';
        }
      }),
      xAxis: Object.assign({}, ax, {
        type: 'value',
        axisLabel: Object.assign({}, ax.axisLabel, { formatter: wan }),
        splitNumber: 3
      }),
      yAxis: Object.assign({}, ax, {
        type: 'category',
        data: names,
        inverse: true,
        axisLabel: Object.assign({}, ax.axisLabel, { color: T.ink2, fontFamily: T.font, fontSize: 12.5 })
      }),
      series: series
    });
  }

  /** 热门站点 TOP 10 排行条形图 */
  function rankingOption(rows, selectedIdx) {
    var ax = axisCommon();
    var barFill = linGrad(0, 0, 1, 0, T.rank, T.rankTop || T.rank);
    return Object.assign(base(), {
      grid: { left: 6, right: 58, top: 4, bottom: 4, containLabel: true },
      tooltip: Object.assign(base().tooltip, {
        trigger: 'item',
        formatter: function (p) {
          return '<b>' + esc(p.data.full) + '</b><br/>' + esc(p.data.district) + ' · 当日记录 <b>' + fmt(p.value) + '</b> 人次';
        }
      }),
      xAxis: { type: 'value', show: false },
      yAxis: Object.assign({}, ax, {
        type: 'category',
        inverse: true,
        data: rows.map(function (r, idx) { return (idx + 1) + '. ' + r.name; }),
        axisLine: { show: false },
        axisLabel: { color: T.ink, fontSize: 12.5, fontFamily: T.font, width: 156, overflow: 'truncate' }
      }),
      series: [{
        type: 'bar',
        barWidth: 13,
        showBackground: true,
        backgroundStyle: { color: isDark() ? 'rgba(255,255,255,.04)' : 'rgba(24,62,89,.045)', borderRadius: [0, 4, 4, 0] },
        data: rows.map(function (r) {
          var isSel = r.idx === selectedIdx;
          return {
            value: r.value,
            idx: r.idx,
            full: r.name,
            district: r.district,
            itemStyle: {
              color: isSel ? T.seal : barFill,
              borderRadius: [0, 4, 4, 0]
            }
          };
        }),
        label: {
          show: true,
          position: 'right',
          color: T.ink2,
          fontSize: 11.5,
          fontFamily: T.numFont,
          formatter: function (p) { return fmt(p.value); }
        },
        emphasis: { itemStyle: { color: T.seal } }
      }],
      graphic: empty(!rows.length)
    });
  }

  /** 46 天全市客流记录走势图 */
  function trendOption(rows, current) {
    var idx = rows.map(function (r) { return r.date; }).indexOf(current);
    var ax = axisCommon();
    var areaFill = linGrad(0, 0, 0, 1, T.trendAreaTop || 'rgba(31,116,150,.22)', T.trendAreaBottom || 'rgba(31,116,150,.01)');
    var hollowBg = T.paper;

    return Object.assign(base(), {
      grid: { left: 50, right: 14, top: 18, bottom: 28 },
      tooltip: Object.assign(base().tooltip, {
        trigger: 'axis',
        formatter: function (ps) {
          var r = rows[ps[0].dataIndex];
          return '<b>' + r.date + ' ' + r.weekday + '</b><br/>全市记录 <b>' + fmt(r.total) + '</b> 人次<br/>记录条数 ' + fmt(r.records) +
            (r.low ? '<br/><span style="color:' + T.warn + '">记录量明显偏低，可能反映采集覆盖差异</span>' : '') +
            '<br/><span style="color:' + T.ink3 + '">点击切换到这一天</span>';
        }
      }),
      xAxis: Object.assign({}, ax, {
        type: 'category',
        boundaryGap: false,
        data: rows.map(function (r) { return r.date.slice(5).replace('-', '/'); }),
        axisLabel: Object.assign({}, ax.axisLabel, { interval: 6 })
      }),
      yAxis: Object.assign({}, ax, {
        type: 'value',
        splitNumber: 3,
        axisLine: { show: false },
        axisLabel: Object.assign({}, ax.axisLabel, { formatter: wan })
      }),
      series: [{
        type: 'line',
        smooth: 0.2,
        data: rows.map(function (r, i) {
          var isCur = i === idx;
          return {
            value: r.total,
            symbolSize: isCur ? 11 : (r.low ? 7 : 4.5),
            itemStyle: {
              color: isCur ? T.seal : (r.low ? hollowBg : T.trend),
              borderColor: isCur ? T.paper : (r.low ? T.warn : T.trend),
              borderWidth: isCur ? 2 : (r.low ? 1.6 : 0)
            }
          };
        }),
        showSymbol: true,
        symbol: 'circle',
        lineStyle: { color: T.trend, width: 2 },
        areaStyle: { color: areaFill },
        markLine: idx >= 0 ? {
          silent: true, symbol: 'none', animation: false,
          lineStyle: { color: T.seal, width: 1.2, type: [4, 3] },
          label: { show: false },
          data: [{ xAxis: idx }]
        } : undefined
      }]
    });
  }

  /** 核心枢纽客群结构南丁格尔玫瑰图 */
  function roseOption(cats, focus) {
    var sum = cats.reduce(function (a, c) { return a + c.value; }, 0);
    var colors = T.districts;
    return Object.assign(base(), {
      tooltip: Object.assign(base().tooltip, {
        trigger: 'item',
        formatter: function (p) {
          return '<b>' + esc(p.name) + '</b><br/>' + p.data.count + ' 个核心站 · 记录 <b>' + fmt(p.value) + '</b> 人次（' + p.percent + '%）';
        }
      }),
      series: [{
        type: 'pie',
        roseType: 'radius',
        radius: ['18%', '74%'],
        center: ['50%', '52%'],
        itemStyle: { borderColor: T.paper, borderWidth: 2, borderRadius: 5 },
        label: {
          color: T.ink2,
          fontSize: 12,
          lineHeight: 15,
          formatter: function (p) { return p.name.replace(/(.{4})/, '$1\n') + ' ' + Math.round(p.percent) + '%'; }
        },
        labelLine: { length: 5, length2: 7, lineStyle: { color: T.rule } },
        data: cats.map(function (c, i) {
          return {
            name: c.name,
            value: c.value,
            count: c.count,
            itemStyle: { color: colors[i % colors.length], opacity: focus && focus !== c.name ? 0.32 : 1 }
          };
        })
      }],
      graphic: empty(sum === 0)
    });
  }

  /** 区域—站点层级矩形树图 */
  function treemapOption(tree) {
    return Object.assign(base(), {
      tooltip: Object.assign(base().tooltip, {
        formatter: function (p) {
          var d = p.data || {};
          return '<b>' + esc(p.name) + '</b><br/>当日记录 <b>' + fmt(p.value) + '</b> 人次' +
            (d.rest ? '<br/><span style="color:' + T.ink3 + '">其余 ' + d.rest + ' 个有记录站点合计</span>' : '');
        }
      }),
      series: [{
        type: 'treemap',
        left: 0, right: 0, top: 0, bottom: 0,
        roam: false, nodeClick: false, breadcrumb: { show: false },
        squareRatio: 1.22,
        label: { show: true, color: '#fff', fontSize: 12, fontFamily: T.font, overflow: 'truncate', formatter: '{b}' },
        upperLabel: { show: true, height: 22, color: '#fff', fontSize: 12.5, fontFamily: T.font, padding: [0, 6] },
        itemStyle: { borderColor: T.paper, borderWidth: 1, gapWidth: 1, borderRadius: 3 },
        levels: [
          { itemStyle: { borderColor: T.paper, borderWidth: 3, gapWidth: 3, borderRadius: 5 } },
          { colorSaturation: [0.32, 0.58], itemStyle: { borderColorSaturation: 0.7, gapWidth: 1, borderWidth: 1, borderRadius: 2 } }
        ],
        data: tree
      }]
    });
  }

  /** 12 处黄金户外广告交汇口评估象限气泡图：横轴 500m 商圈日客流，纵轴交汇线路峰值数，气泡面积映射 OTS 触达潜力指数 */
  function adMatrixOption(rows, selectedId) {
    var ax = axisCommon();
    var valid = (rows || []).filter(function (r) { return r.total === r.total && r.total > 0; });
    var maxOts = Math.max.apply(null, valid.map(function (r) { return r.ots || 1; }).concat([1]));
    var sFill = isDark() ? 'rgba(255, 184, 77, 0.86)' : 'rgba(206, 138, 42, 0.86)';
    var aFill = isDark() ? 'rgba(56, 200, 242, 0.82)' : 'rgba(31, 116, 150, 0.82)';

    function toItem(r) {
      var isSel = r.id === selectedId;
      var sz = 13 + Math.sqrt((r.ots || 0) / maxOts) * 23;
      return {
        name: r.short,
        value: [Math.round(r.total), r.maxRoutes, r.ots],
        id: r.id,
        full: r.name,
        tier: r.tier,
        district: r.district,
        stops: r.stops,
        tag: r.tag,
        symbolSize: isSel ? sz + 5 : sz,
        label: r.id === 'AD01' ? { position: 'bottom', distance: 5 } : undefined,
        itemStyle: {
          color: r.tier === 'S' ? sFill : aFill,
          borderColor: isSel ? T.ink : (r.tier === 'S' ? T.seal : T.accent),
          borderWidth: isSel ? 2.5 : 1.4,
          shadowBlur: isSel ? 14 : 6,
          shadowColor: r.tier === 'S' ? 'rgba(216,146,40,0.35)' : 'rgba(31,116,150,0.22)'
        }
      };
    }

    var sList = valid.filter(function (r) { return r.tier === 'S'; }).map(toItem);
    var aList = valid.filter(function (r) { return r.tier !== 'S'; }).map(toItem);

    return Object.assign(base(), {
      grid: { left: 44, right: 34, top: 52, bottom: 36 },
      legend: {
        top: 0, right: 0, itemWidth: 10, itemHeight: 10, icon: 'circle', itemGap: 14,
        textStyle: { color: T.ink2, fontSize: 12 },
        data: ['S 级旗舰广告口', 'A 级核心门户口']
      },
      tooltip: Object.assign(base().tooltip, {
        trigger: 'item',
        formatter: function (p) {
          var d = p.data;
          return '<b>[' + esc(d.tier) + ' 级] ' + esc(d.full) + '</b><br/>' +
            esc(d.district) + ' · 500m 覆盖 <b>' + d.stops + '</b> 站<br/>' +
            '商圈当日实测：<b>' + fmt(d.value[0]) + '</b> 人次<br/>' +
            '单站最高交汇：<b>' + d.value[1] + '</b> 条线路<br/>' +
            'OTS 触达潜力分：<b>' + fmt(d.value[2]) + '</b><br/>' +
            '<span style="color:' + T.seal + '">' + esc(d.tag) + '</span>';
        }
      }),
      xAxis: Object.assign({}, ax, {
        type: 'value',
        name: '500m 商圈实测人次',
        nameLocation: 'middle',
        nameGap: 23,
        nameTextStyle: { color: T.ink3, fontSize: 11.5, fontFamily: T.font },
        max: function (v) {
          var raw = (v.max || 100) * 1.15;
          var step = raw > 1500 ? 500 : 100;
          return Math.ceil(raw / step) * step;
        },
        splitNumber: 3,
        axisLabel: Object.assign({}, ax.axisLabel, { formatter: wan })
      }),
      yAxis: Object.assign({}, ax, {
        type: 'value',
        name: '交汇线路数（条）',
        nameGap: 10,
        nameTextStyle: { color: T.ink3, fontSize: 11.5, fontFamily: T.font, align: 'left', padding: [0, 0, 0, -28] },
        min: function (v) { return Math.max(0, Math.floor((v.min - 2) / 2) * 2); },
        max: function (v) { return Math.ceil((v.max + 2) / 2) * 2; },
        splitNumber: 3,
        axisLine: { show: false }
      }),
      series: [
        {
          name: 'S 级旗舰广告口',
          type: 'scatter',
          data: sList,
          z: 4,
          label: {
            show: true, position: 'top', distance: 5,
            formatter: '{b}', color: T.ink, fontSize: 11.5, fontWeight: 600, fontFamily: T.font,
            textBorderColor: T.paper, textBorderWidth: 2.5
          },
          labelLayout: { moveOverlap: 'shiftY', hideOverlap: true }
        },
        {
          name: 'A 级核心门户口',
          type: 'scatter',
          data: aList,
          z: 3,
          label: {
            show: true, position: 'right', distance: 5,
            formatter: '{b}', color: T.ink2, fontSize: 11, fontFamily: T.font,
            textBorderColor: T.paper, textBorderWidth: 2.2
          },
          labelLayout: { moveOverlap: 'shiftY', hideOverlap: true }
        }
      ],
      graphic: empty(!valid.length, '所选日期 500m 商圈暂无记录')
    });
  }

  HZ.charts = {
    T: T, syncPalette: syncPalette, fmt: fmt, wan: wan, esc: esc, hh: hh,
    hourlyOption: hourlyOption, donutOption: donutOption, periodOption: periodOption,
    rankingOption: rankingOption, trendOption: trendOption, roseOption: roseOption, treemapOption: treemapOption,
    adMatrixOption: adMatrixOption
  };
})(window);

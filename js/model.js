/* 数据模型：只读复用原版数据包，派生当日视图、500m 局部辐射圈邻域与多车交汇黄金广告路口评估指标。
 * 口径约定：
 *  - 全市合计 / 全市小时值：原 CSV 当日全部记录（day.total / day.byHour）。
 *  - 分区、热门站点、点云：固定 1,800 站（以 2026-09-22 选出），其它日期覆盖不同。
 *  - 核心枢纽站：32 个高德枢纽，按原版 officialIds 聚合多个官方站点 ID。
 *  - 黄金广告交汇口：精选 12 处真实多线路公交交汇十字商圈/医教门户，聚合 500m 步程圈内站点客流与线路密度。
 *  - 缺失 = NaN，不当作 0；插值只在同一站相邻两个有记录的小时之间进行，且明确标注。 */
(function (g) {
  'use strict';
  var HZ = g.HZ = g.HZ || {};

  var SCENARIOS = {
    record: { key: 'record', label: '记录值', factor: 1, note: '显示原始记录值。' },
    holiday: { key: 'holiday', label: '节假日情景', factor: 1.24, note: '情景推演：三维点云与站点曲线 = 记录值 × 1.24（沿用原版系数），不是实测。分析图表始终显示记录值。' },
    rain: { key: 'rain', label: '雨天情景', factor: 1.12, note: '情景推演：三维点云与站点曲线 = 记录值 × 1.12（沿用原版系数），不是实测。分析图表始终显示记录值。' }
  };

  var HEAT_BREAKS = [5, 12, 25, 50];
  var HEAT_VIVID = ['#9db7c9', '#4f97a8', '#d1a032', '#e0713a', '#b8323a'];
  var HEAT_LABELS = ['< 5', '5–11', '12–24', '25–49', '≥ 50'];

  // 1 km ≈ 3.85 世界坐标单位，500m 半径 ≈ 1.92 世界单位
  var CATCHMENT_R = 1.92;

  // 精选 12 处多线路公交交汇「黄金户外广告路口」（基于真实途经线路密度 rc 与 500m 商圈汇流）
  var AD_SPOT_DEFS = [
    {
      id: 'AD01', name: '延安路·庆春路（龙翔桥口）', short: '龙翔桥口', tier: 'S',
      district: '上城区', lngLat: [120.16404, 30.25560], hubId: 'S02', cloudIdx: 8,
      backboneLines: ['7路', 'K155路', '290路'],
      media: '旗舰双面联排候车亭灯箱 + 路口电子屏',
      audience: '西湖文旅潮汐 + 湖滨顶流商圈全天候高驻留人群',
      tag: '全城客流冠首 · 商业品牌旗舰首选'
    },
    {
      id: 'AD02', name: '体育场路·环城西路（武林门口）', short: '武林门口', tier: 'S',
      district: '拱墅区', lngLat: [120.15720, 30.27110], hubId: 'S03', cloudIdx: 115,
      backboneLines: ['K155路', '28路', '290路'],
      media: '旗舰候车亭巨幅灯箱 + 换乘长廊视窗',
      audience: '武林CBD商务白领 + 机场城际换乘高净值客群',
      tag: '17线交汇核心 · 商务金融高频触达'
    },
    {
      id: 'AD03', name: '莫干山路·文晖路（密渡桥口）', short: '密渡桥口', tier: 'S',
      district: '西湖区', lngLat: [120.15205, 30.27720], hubId: 'S19', cloudIdx: 47,
      backboneLines: ['K155路', '290路'],
      media: '超长港湾式多泊位连廊灯箱矩阵',
      audience: '城西通勤干道潮汐车流 + 省中山医院及政务办公人群',
      tag: '20条公交线同站 · 全城线路密度第一'
    },
    {
      id: 'AD04', name: '庆春路·马市街（浙一医商圈口）', short: '浙一庆春口', tier: 'S',
      district: '上城区', lngLat: [120.17552, 30.25804], hubId: null, cloudIdx: 2,
      backboneLines: [],
      media: '高亮度候车亭滚动灯箱 + 慢行过街立柱',
      audience: '三甲医院高频陪诊家庭 + 庆春金融街通勤客群',
      tag: '15线交汇门户 · 大健康与民生品牌必争'
    },
    {
      id: 'AD05', name: '平海路·延安路（湖滨解百口）', short: '湖滨平海口', tier: 'S',
      district: '上城区', lngLat: [120.16520, 30.25220], hubId: 'S04', cloudIdx: 23,
      backboneLines: ['7路', 'K155路', '290路', 'WE1314路'],
      media: '景观定制艺术候车亭灯箱 + 街角双面炫彩屏',
      audience: '年轻消费主力、快时尚潮流客群与外地游客',
      tag: '4条骨干线叠合 · 500m辐射23座站点'
    },
    {
      id: 'AD06', name: '文晖路·建国北路（打铁关口）', short: '打铁关口', tier: 'A',
      district: '拱墅区', lngLat: [120.17683, 30.28623], hubId: null, cloudIdx: 12,
      backboneLines: [],
      media: '双地铁口接驳候车亭灯箱组',
      audience: '城北—市中心刚需通勤族 + 成熟居住社区家庭',
      tag: '16线换乘咽喉 · 早晚高峰双潮汐锁客'
    },
    {
      id: 'AD07', name: '曙光路·莫干山路（黄龙洞口）', short: '黄龙洞口', tier: 'A',
      district: '西湖区', lngLat: [120.13905, 30.26501], hubId: 'S10', cloudIdx: 1,
      backboneLines: ['B1/200路'],
      media: '赛事演艺走廊联排灯箱 + 枢纽导视牌',
      audience: '黄龙文体演艺观众 + 浙大玉泉及北山文旅人群',
      tag: '单站高客流次席 · 文体数码投放优选'
    },
    {
      id: 'AD08', name: '香积寺路·上塘路（大关公园口）', short: '大关路口', tier: 'A',
      district: '拱墅区', lngLat: [120.15671, 30.30269], hubId: null, cloudIdx: 10,
      backboneLines: ['88路'],
      media: '社区商圈双向六连屏灯箱',
      audience: '高密度大型居住区家庭消费与商超生活客群',
      tag: '16线密集交织 · 商超快消品高转化位'
    },
    {
      id: 'AD09', name: '中河中路·中山南路（鼓楼口）', short: '鼓楼南宋口', tier: 'A',
      district: '上城区', lngLat: [120.17249, 30.23955], hubId: null, cloudIdx: 37,
      backboneLines: [],
      media: '宋韵风貌定制灯箱 + 高架桥下慢行视窗',
      audience: '河坊街南宋御街文旅客群 + 城南老城生活人群',
      tag: '16线南北走廊 · 餐饮老字号高曝光位'
    },
    {
      id: 'AD10', name: '天目山路·丰潭路（古荡西溪口）', short: '古荡西溪口', tier: 'A',
      district: '西湖区', lngLat: [120.12343, 30.27234], hubId: null, cloudIdx: 117,
      backboneLines: ['B1/200路'],
      media: '城西科创走廊港湾大牌灯箱',
      audience: '城西互联网园区青年程序员与高校科创通勤群体',
      tag: '17线西向门户 · 科技汽车招聘高匹配'
    },
    {
      id: 'AD11', name: '庆春东路·凯旋路（省青春医院口）', short: '青春医院口', tier: 'A',
      district: '上城区', lngLat: [120.19363, 30.25761], hubId: null, cloudIdx: 103,
      backboneLines: [],
      media: '庆春东干道双向双子候车亭灯箱',
      audience: '庆春广场—钱江新城过渡带医教与品质居住人群',
      tag: '13线东向走廊 · 500m内15站密集连片'
    },
    {
      id: 'AD12', name: '市心中路·人民路（萧山银隆口）', short: '萧山市心口', tier: 'A',
      district: '萧山区', lngLat: [120.27963, 30.16822], hubId: null, cloudIdx: 128,
      backboneLines: ['123路'],
      media: '江南岸核心商圈灯箱组',
      audience: '萧山老城核心商圈消费客群与跨区通勤流',
      tag: '13线江南主轴 · 江南城厢头部广告口'
    }
  ];

  function heatClass(v) {
    for (var i = 0; i < HEAT_BREAKS.length; i++) if (v < HEAT_BREAKS[i]) return i;
    return HEAT_BREAKS.length;
  }

  function hourArray(obj) {
    var a = new Float32Array(24).fill(NaN);
    if (!obj) return a;
    Object.keys(obj).forEach(function (k) {
      var h = Number(k), v = Number(obj[k]);
      if (Number.isInteger(h) && h >= 0 && h < 24 && Number.isFinite(v)) a[h] = v;
    });
    return a;
  }

  function anchorsOf(arr) {
    var out = [];
    for (var h = 0; h < 24; h++) if (!Number.isNaN(arr[h])) out.push(h);
    return out;
  }

  function sampleSeries(arr, anchors, t, smooth) {
    if (!arr) return { v: NaN, kind: 'none' };
    if (t >= 24) t = 23.999;
    var h = Math.floor(t);
    if (!smooth) {
      var v = arr[h];
      return Number.isNaN(v) ? { v: NaN, kind: 'none' } : { v: v, kind: 'record' };
    }
    if (!anchors.length) return { v: NaN, kind: 'none' };
    if (Math.abs(t - Math.round(t)) < 0.02) {
      var hr = Math.round(t) % 24;
      if (!Number.isNaN(arr[hr])) return { v: arr[hr], kind: 'record' };
    }
    var first = anchors[0], last = anchors[anchors.length - 1];
    if (t < first || t > last) return { v: NaN, kind: 'none' };
    var lo = first, hi = last;
    for (var i = 0; i < anchors.length; i++) {
      if (anchors[i] <= t) lo = anchors[i];
      if (anchors[i] >= t) { hi = anchors[i]; break; }
    }
    if (hi === lo) return { v: arr[lo], kind: 'record' };
    var f = (t - lo) / (hi - lo);
    return { v: arr[lo] + (arr[hi] - arr[lo]) * f, kind: 'interp', from: lo, to: hi };
  }

  var WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  function weekday(date) {
    var p = date.split('-').map(Number);
    return WEEK[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()];
  }
  function weekdayIndex(date) {
    var p = date.split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
  }

  HZ.buildModel = function buildModel() {
    var GIS = g.HZ_REAL_GIS, OFF = g.HZ_OFFICIAL_DATA, DD = g.HZ_DATE_DATA;
    if (!GIS || !OFF || !DD) throw new Error('数据包缺失');
    var LON0 = GIS.CENTER[0], LAT0 = GIS.CENTER[1];
    function project(lng, lat) { return [(lng - LON0) * 370, (LAT0 - lat) * 427]; }

    var baseCloud = OFF.coreStationCloud || [];
    if (!Array.isArray(DD.stationIds) || DD.stationIds.length !== baseCloud.length ||
      DD.stationIds.some(function (id, i) { return String(id) !== String(baseCloud[i].id); })) {
      throw new Error('日期数据包的站点顺序与 1,800 站基础数据不一致，请用原版 build_date_data.py 重新生成。');
    }
    var cloud = baseCloud.map(function (c, i) {
      var xz = project(c.c[0], c.c[1]);
      return { idx: i, id: String(c.id), name: c.n, lngLat: c.c, x: xz[0], z: xz[1], district: c.d, routes: c.rc || 0, adSpotId: null };
    });

    // 预计算每个点云站点的 500m 邻域站点索引列表（用于悬停微卡片与商圈聚合）
    var cloudNear500 = new Array(cloud.length);
    for (var ci = 0; ci < cloud.length; ci++) {
      var near = [];
      var cx = cloud[ci].x, cz = cloud[ci].z;
      for (var cj = 0; cj < cloud.length; cj++) {
        if (Math.hypot(cloud[cj].x - cx, cloud[cj].z - cz) <= CATCHMENT_R) near.push(cj);
      }
      cloudNear500[ci] = near;
    }

    var hubs = GIS.STATIONS.map(function (s) {
      var xz = project(s.lngLat[0], s.lngLat[1]);
      var eh = OFF.enrichedHubs && OFF.enrichedHubs[s.id];
      var near = [];
      for (var k = 0; k < cloud.length; k++) {
        if (Math.hypot(cloud[k].x - xz[0], cloud[k].z - xz[1]) <= CATCHMENT_R) near.push(k);
      }
      return {
        id: s.id, name: s.name, short: s.cleanName || s.name, district: s.district,
        category: (eh && eh.clusterType) || s.category, lngLat: s.lngLat, x: xz[0], z: xz[1],
        lines: s.lines || [], officialIds: (eh && eh.officialIds) || [], major: !!s.major,
        nearIdxs: near, adSpotId: null
      };
    });
    var hubById = {}; hubs.forEach(function (h) { hubById[h.id] = h; });

    // 构建 12 处多线路公交交汇黄金广告位及 500m 覆盖圈
    var adSpots = AD_SPOT_DEFS.map(function (def) {
      var xz = project(def.lngLat[0], def.lngLat[1]);
      var near = [], maxRoutes = 0, routeSum = 0;
      for (var k = 0; k < cloud.length; k++) {
        var d = Math.hypot(cloud[k].x - xz[0], cloud[k].z - xz[1]);
        if (d <= CATCHMENT_R) {
          near.push(k);
          if (cloud[k].routes > maxRoutes) maxRoutes = cloud[k].routes;
          routeSum += cloud[k].routes;
          if (d <= 0.72 && !cloud[k].adSpotId) cloud[k].adSpotId = def.id;
        }
      }
      if (def.cloudIdx != null && cloud[def.cloudIdx]) cloud[def.cloudIdx].adSpotId = def.id;
      if (def.hubId && hubById[def.hubId]) hubById[def.hubId].adSpotId = def.id;
      return {
        id: def.id,
        name: def.name,
        short: def.short,
        tier: def.tier,
        district: def.district,
        lngLat: def.lngLat,
        x: xz[0],
        z: xz[1],
        hubId: def.hubId,
        cloudIdx: def.cloudIdx,
        backboneLines: def.backboneLines || [],
        media: def.media,
        audience: def.audience,
        tag: def.tag,
        nearIdxs: near,
        maxRoutes: maxRoutes || 12,
        routeDensity: routeSum
      };
    });
    var adSpotById = {}; adSpots.forEach(function (a) { adSpotById[a.id] = a; });

    var defaultHeat = ['#b8d3e3', '#80b2cc', '#498eb0', '#25698c', '#104261'];
    var defaultLines = ['#286f8e', '#3d8b7d', '#5c6ba8', '#b57452', '#33889a', '#486288', '#8d6489', '#678c59', '#a6586c', '#64798a'];
    var heatObj = {
      breaks: HEAT_BREAKS,
      colors: (g.HZ_PALETTE ? g.HZ_PALETTE.heat : defaultHeat).slice(),
      vivid: HEAT_VIVID,
      labels: HEAT_LABELS,
      classOf: heatClass
    };

    var lines = (GIS.BUS_LINES || []).map(function (l, i) {
      var lc = g.HZ_PALETTE ? g.HZ_PALETTE.lines : defaultLines;
      return {
        id: l.id, name: l.name, route: l.route, desc: l.desc, km: l.distanceKm,
        color: lc[i % lc.length], originalColor: l.color,
        waypoints: l.waypoints, stations: l.stations || [], stops: l.allStops || []
      };
    });

    function syncPalette() {
      if (!g.HZ_PALETTE) return;
      heatObj.colors = g.HZ_PALETTE.heat.slice();
      lines.forEach(function (l, i) {
        l.color = g.HZ_PALETTE.lines[i % g.HZ_PALETTE.lines.length];
      });
    }

    var dates = (DD.meta.dates || []).filter(function (d) { return DD.days[d]; });
    var districtNames = [];
    (function () {
      var set = {};
      dates.forEach(function (d) { Object.keys(DD.days[d].districtStats || {}).forEach(function (n) { set[n] = 1; }); });
      districtNames = Object.keys(set).sort(function (a, b) { return a.localeCompare(b, 'zh-Hans'); });
    })();
    var categories = [];
    hubs.forEach(function (h) { if (categories.indexOf(h.category) < 0) categories.push(h.category); });

    // 各区固定点云站数（用于计算分区单站小时均线）
    var districtStationCount = {};
    districtNames.forEach(function (n) { districtStationCount[n] = 0; });
    cloud.forEach(function (c) { districtStationCount[c.district] = (districtStationCount[c.district] || 0) + 1; });

    var cache = {};
    function day(date) {
      if (cache[date]) return cache[date];
      var raw = DD.days[date];
      if (!raw) return null;
      var city = hourArray(raw.byHour);
      var cityAnchors = anchorsOf(city);
      var cloudSeries = new Array(cloud.length), cloudAnchors = new Array(cloud.length), cloudTotal = new Float64Array(cloud.length);
      var coverage = 0;
      var distActiveCount = {};
      districtNames.forEach(function (n) { distActiveCount[n] = 0; });

      for (var i = 0; i < cloud.length; i++) {
        var rec = raw.cloud[i];
        if (rec === null || rec === undefined) { cloudSeries[i] = null; cloudAnchors[i] = []; cloudTotal[i] = NaN; continue; }
        coverage++;
        distActiveCount[cloud[i].district] = (distActiveCount[cloud[i].district] || 0) + 1;
        cloudSeries[i] = hourArray(rec[1]);
        cloudAnchors[i] = anchorsOf(cloudSeries[i]);
        cloudTotal[i] = Number(rec[0]);
      }

      var hubVals = {};
      hubs.forEach(function (h) {
        var r = raw.hubs && raw.hubs[h.id];
        var arr = hourArray(r && r.byHourMeasured);
        var anchors = anchorsOf(arr);
        hubVals[h.id] = { total: anchors.length ? Number(r.measuredTotal) : NaN, series: arr, anchors: anchors, ids: (r && r.officialIds) || h.officialIds };
      });

      var districts = districtNames.map(function (n) {
        var d = (raw.districtStats || {})[n] || { total: 0, byHour: {} };
        var byH = hourArray(d.byHour);
        var avgH = new Float32Array(24).fill(NaN);
        var denom = Math.max(1, distActiveCount[n] || districtStationCount[n] || 1);
        for (var h = 0; h < 24; h++) {
          if (!Number.isNaN(byH[h])) avgH[h] = byH[h] / denom;
        }
        return { name: n, total: Number(d.total) || 0, byHour: byH, avgByHour: avgH, activeStations: distActiveCount[n] || 0 };
      });
      var districtMap = {};
      districts.forEach(function (d) { districtMap[d.name] = d; });

      var ranking = [];
      for (var k = 0; k < cloud.length; k++) if (!Number.isNaN(cloudTotal[k])) ranking.push({ idx: k, value: cloudTotal[k] });
      ranking.sort(function (a, b) { return b.value - a.value || a.idx - b.idx; });

      // 计算当日全城排位百分位（0 ~ 100，数值越小代表越靠前，如 topPct = 3 表示全城前 3%）
      var cloudRank = new Int32Array(cloud.length).fill(-1);
      var cloudTopPct = new Float32Array(cloud.length).fill(NaN);
      for (var rk = 0; rk < ranking.length; rk++) {
        var cIdx = ranking[rk].idx;
        cloudRank[cIdx] = rk + 1;
        cloudTopPct[cIdx] = Math.max(1, Math.round((rk + 1) / Math.max(1, ranking.length) * 100));
      }

      // 聚合 12 处黄金广告路口的 500m 商圈实测小时序列与触达指数
      var adVals = {};
      adSpots.forEach(function (ad) {
        var ser = new Float32Array(24).fill(NaN);
        var tot = 0, activeStops = 0;
        ad.nearIdxs.forEach(function (idx) {
          var stTot = cloudTotal[idx];
          if (stTot === stTot) {
            tot += stTot;
            activeStops++;
            var cs = cloudSeries[idx];
            if (cs) {
              for (var h = 0; h < 24; h++) {
                if (cs[h] === cs[h]) ser[h] = (ser[h] === ser[h] ? ser[h] : 0) + cs[h];
              }
            }
          }
        });
        var anc = anchorsOf(ser);
        var pk = null;
        anc.forEach(function (h) { if (!pk || ser[h] > pk.value) pk = { hour: h, value: ser[h] }; });
        // 广告触达潜力指数（OTS 相对分，综合 500m 实测客流与最大交汇线路数）
        var otsIndex = activeStops ? Math.round(tot * (1 + ad.maxRoutes * 0.08)) : 0;
        adVals[ad.id] = {
          total: activeStops ? tot : NaN,
          series: ser,
          anchors: anc,
          activeStops: activeStops,
          peak: pk,
          otsIndex: otsIndex
        };
      });

      var peak = null;
      cityAnchors.forEach(function (h) { if (!peak || city[h] > peak.value) peak = { hour: h, value: city[h] }; });
      var out = {
        date: date, weekday: weekday(date), weekdayIndex: weekdayIndex(date),
        total: Number(raw.total), recordCount: Number(raw.recordCount),
        city: city, cityAnchors: cityAnchors, peak: peak,
        cloudSeries: cloudSeries, cloudAnchors: cloudAnchors, cloudTotal: cloudTotal, coverage: coverage,
        cloudRank: cloudRank, cloudTopPct: cloudTopPct,
        hubVals: hubVals, adVals: adVals,
        districts: districts, districtMap: districtMap, ranking: ranking
      };
      cache[date] = out;
      return out;
    }

    // 计算任意目标在当日当刻的 500m 周边商圈局部汇总（供悬停微图卡片与详情页调用）
    function catchmentStats(date, target, t, smooth, factor) {
      var d = day(date);
      if (!d || !target) return null;
      var f = factor || 1;
      var near = [];
      if (target.kind === 'cloud') near = cloudNear500[target.idx] || [];
      else if (target.kind === 'hub') near = (hubById[target.id] && hubById[target.id].nearIdxs) || [];
      else if (target.kind === 'ad') near = (adSpotById[target.id] && adSpotById[target.id].nearIdxs) || [];

      var sumDay = 0, sumNow = 0, activeDay = 0, activeNow = 0, maxRc = 0;
      for (var i = 0; i < near.length; i++) {
        var idx = near[i];
        if (cloud[idx].routes > maxRc) maxRc = cloud[idx].routes;
        var ct = d.cloudTotal[idx];
        if (ct === ct) { sumDay += ct; activeDay++; }
        var cs = d.cloudSeries[idx];
        if (cs) {
          var sr = sampleSeries(cs, d.cloudAnchors[idx], t, smooth);
          if (sr.v === sr.v) { sumNow += sr.v * f; activeNow++; }
        }
      }

      var topPct = NaN, rank = -1;
      if (target.kind === 'cloud') {
        rank = d.cloudRank[target.idx];
        topPct = d.cloudTopPct[target.idx];
      } else if (rankingCount(d) > 0) {
        // 对枢纽或广告口，用其代表站点或按当日量估算在 1,800 站中的等效百分位
        var refVal = target.kind === 'hub' ? (d.hubVals[target.id] && d.hubVals[target.id].total) : sumDay;
        if (refVal === refVal) {
          var higher = 0;
          for (var r = 0; r < d.ranking.length; r++) {
            if (d.ranking[r].value > refVal) higher++; else break;
          }
          rank = higher + 1;
          topPct = Math.max(1, Math.round(rank / d.ranking.length * 100));
        }
      }

      return {
        stopsTotal: near.length,
        stopsActiveDay: activeDay,
        stopsActiveNow: activeNow,
        sumDay: sumDay,
        sumNow: sumNow,
        maxRoutes: maxRc,
        rank: rank,
        rankBase: d.ranking.length,
        topPct: topPct
      };
    }
    function rankingCount(d) { return d && d.ranking ? d.ranking.length : 0; }

    var defaultDate = dates.indexOf((OFF.meta && OFF.meta.targetDate) || '2026-09-22') >= 0 ? OFF.meta.targetDate : dates[dates.length - 1];

    return {
      GIS: GIS, OFF: OFF, DD: DD, project: project, catchmentRadius: CATCHMENT_R,
      districtsGeo: g.HZ_AMAP_DISTRICTS || [], regions: g.HZ_REGION_LABELS || [],
      cloud: cloud, cloudNear500: cloudNear500,
      hubs: hubs, hubById: hubById,
      adSpots: adSpots, adSpotById: adSpotById,
      lines: lines,
      dates: dates, defaultDate: defaultDate, districtNames: districtNames, categories: categories,
      day: day, sample: sampleSeries, catchmentStats: catchmentStats, SCENARIOS: SCENARIOS,
      heat: heatObj, syncPalette: syncPalette,
      meta: {
        flowRawRows: OFF.meta.flowRawRows, flowPlatformReported: OFF.meta.flowPlatformReported,
        totalAllDays: DD.meta.total, recordCountAllDays: DD.meta.recordCount,
        cloudBaseDate: DD.meta.cloudBaseDate, source: DD.meta.source || OFF.meta.source,
        uniqueRoutes: OFF.meta.uniqueRoutes, coordinateTransform: OFF.meta.coordinateTransform
      }
    };
  };
})(window);

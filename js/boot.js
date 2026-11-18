/* 启动加载器：按顺序加载本地依赖与数据包。
 * 使用经典 <script>，因此直接双击 index.html（file://）与本地服务器两种方式都可零配置运行。 */
(function () {
  'use strict';
  var FALLBACK = '../可视化/demo/';
  var deps = [
    { name: 'Three.js', test: function () { return window.THREE; }, paths: ['./vendor/three.min.js', FALLBACK + 'vendor/three.min.js'] },
    { name: 'ECharts', test: function () { return window.echarts; }, paths: ['./vendor/echarts.min.js', FALLBACK + 'vendor/echarts.min.js'] },
    { name: '行政区边界', test: function () { return window.HZ_AMAP_DISTRICTS; }, paths: ['./data/hz_amap_districts.js', FALLBACK + 'data/hz_amap_districts.js'] },
    { name: '地理与线路', test: function () { return window.HZ_REAL_GIS; }, paths: ['./data/hz_real_gis.js', FALLBACK + 'data/hz_real_gis.js'] },
    { name: '站点基础数据', test: function () { return window.HZ_OFFICIAL_DATA; }, paths: ['./data/hz_official_data.js', FALLBACK + 'data/hz_official_data.js'] },
    { name: '46 天日期数据', test: function () { return window.HZ_DATE_DATA; }, paths: ['./data/hz_date_data.js', FALLBACK + 'data/hz_date_data.js'] },
    { name: '区域标注', test: function () { return window.HZ_REGION_LABELS; }, paths: ['./data/hz_region_labels.js', FALLBACK + 'data/hz_region_labels.js'] },
    { name: '数据模型', test: function () { return window.HZ && window.HZ.buildModel; }, paths: ['./js/model.js'] },
    { name: '图表', test: function () { return window.HZ && window.HZ.charts; }, paths: ['./js/charts.js'] },
    { name: '三维城市', test: function () { return window.HZ && window.HZ.createCity; }, paths: ['./js/city.js'] },
    { name: '界面', test: function () { return window.HZ && window.HZ.startApp; }, paths: ['./js/app.js'] }
  ];
  var loaded = [];
  window.HZ_BOOT = { loaded: loaded, errors: [] };

  function fatal(message) {
    var app = document.getElementById('app');
    if (app) app.dataset.state = 'failed';
    var box = document.getElementById('fatal');
    var msg = document.getElementById('fatal-msg');
    if (msg) msg.textContent = message;
    if (box) box.hidden = false;
    window.HZ_BOOT.errors.push(message);
  }
  window.HZ_FATAL = fatal;

  function loadOne(dep, i, done) {
    if (i >= dep.paths.length) { done(false); return; }
    var s = document.createElement('script');
    s.src = dep.paths[i];
    s.async = false;
    s.onload = function () {
      if (dep.test()) { loaded.push({ name: dep.name, src: dep.paths[i] }); done(true); }
      else loadOne(dep, i + 1, done);
    };
    s.onerror = function () { s.remove(); loadOne(dep, i + 1, done); };
    document.head.appendChild(s);
  }

  function next(k) {
    if (k >= deps.length) {
      try { window.HZ.startApp(); }
      catch (err) { console.error(err); fatal('界面初始化失败：' + (err && err.message ? err.message : err)); }
      return;
    }
    var dep = deps[k];
    if (dep.test()) { next(k + 1); return; }
    loadOne(dep, 0, function (ok) {
      if (!ok) { fatal('无法加载「' + dep.name + '」（尝试了 ' + dep.paths.join('、') + '）。'); return; }
      next(k + 1);
    });
  }
  next(0);
})();

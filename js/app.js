/* 界面与状态：日期、时刻、多釉色主题、焦点层级、骨干线路速览、分析抽屉与三维联动。 */
(function (g) {
  'use strict';
  var HZ = g.HZ = g.HZ || {};

  HZ.startApp = function startApp() {
    var $ = function (id) { return document.getElementById(id); };
    var C = HZ.charts, fmt = C.fmt, esc = C.esc, hh = C.hh;
    var M = HZ.buildModel();
    var app = $('app');
    var sysReduced = g.matchMedia ? g.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener: function () {} };

    // ── 状态 ─────────────────────────────────────────────────────────────
    var S = {
      date: M.defaultDate, t: 7, playing: false, speed: 1, smooth: false, scenario: 'record',
      palette: 'lake', thermal: false,
      preset: 'overview',
      focus: { district: null, category: null, line: null }, sel: null,
      sheet: null, sheetOpen: false, sheetFromInsight: false, reducedPref: false,
      layers: { cloud: true, heatmap: false, adSpots: true, lines: true, buses: true, hubs: true, tiles: true, regions: true, districts: true, arcs: false, buildings: true },
      poses: { focus: null, sel: null }, dwell: 0
    };
    function reduced() { return S.reducedPref || sysReduced.matches; }
    function day() { return M.day(S.date); }
    function factor() { return M.SCENARIOS[S.scenario].factor; }

    // 低记录日：当日记录合计低于 46 天中位数的 15%
    var totals = M.dates.map(function (d) { return M.day(d).total; }).slice().sort(function (a, b) { return a - b; });
    var median = totals[Math.floor(totals.length / 2)] || 0;
    function isLow(d) { return M.day(d).total < median * 0.15; }

    function periodLabel(h, kind) {
      if (kind === 'none') {
        if (h >= 16 && h <= 21) return '傍晚空缺段';
        if (h < 6) return '凌晨静默段';
        return '时段无记录';
      }
      if (h < 6) return '凌晨潮汐';
      if (h < 9) return '晨间早潮';
      if (h < 13) return '日间平潮';
      if (h < 17) return '午后潮峰';
      return '夜间落潮';
    }

    // ── 三维城市（不可用时优雅降级） ────────────────────────────────────────
    var city, cityError = null;
    var avoidEls = [$('masthead'), $('views'), $('legend')];
    try {
      city = HZ.createCity({
        container: $('stage-canvas'), labelsEl: $('stage-labels'), model: M, reducedMotion: reduced,
        loadTiles: !/[?&]offline\b/.test(location.search),
        onPick: onPick, onHover: onHover, onTileStatus: onTileStatus,
        onInteract: function () { closePopovers(); clearActivePreset(); },
        safeArea: function () {
          var sheetW = S.sheetOpen ? $('sheet').getBoundingClientRect().width : 0;
          return {
            top: $('toolbar').getBoundingClientRect().bottom + 6,
            bottom: g.innerHeight - $('dock').getBoundingClientRect().top + 8,
            left: 0, right: sheetW + 12,
            avoid: avoidEls.map(function (e) { return e.getBoundingClientRect(); }).filter(function (r) { return r.width > 0; })
          };
        }
      });
    } catch (err) {
      cityError = err;
      app.dataset.webgl = 'off';
      console.error(err);
      var nop = function () {};
      city = {
        frame: nop, resize: nop, setCloud: nop, setFocus: nop, setLayer: nop, select: nop,
        setSelectionLabel: nop, setHoverMarker: nop, applyPalette: nop,
        flyPreset: nop, flyToPoint: nop, flyToBounds: nop, flyTo: nop, setInset: nop,
        getPose: function () { return null; }, isMoving: function () { return false; },
        setMode2D: nop, is2D: false, retryTiles: nop, buildArcs: nop, clearArcs: nop,
        lineCenter: function () { return null; }, debug: function () { return { error: String(err.message) }; }
      };
      var note = document.createElement('div'); note.className = 'stage-error'; note.setAttribute('role', 'alert');
      note.innerHTML = '<h2>三维城市未能启动</h2><p>' + esc(err.message || err) + '</p><p>时间带、站点搜索、分析图表和数据说明仍可使用。请换用最新版 Chrome 或 Edge，并确认浏览器已开启硬件加速。</p>';
      $('stage').appendChild(note);
      onTileStatus({ total: 25, loaded: 0, failed: 25, loading: false, disabled: true });
    }

    // ── 通用 UI 工具 ─────────────────────────────────────────────────────
    function setPressed(btn, on) { btn.setAttribute('aria-pressed', String(!!on)); btn.classList.toggle('on', !!on); }
    function segmented(el, items, current, onChange) {
      el.replaceChildren();
      items.forEach(function (it) {
        var b = document.createElement('button'); b.type = 'button'; b.textContent = it.label; b.dataset.value = it.value;
        b.setAttribute('role', 'radio'); if (it.title) b.title = it.title;
        b.addEventListener('click', function () { onChange(it.value); sync(); });
        el.appendChild(b);
      });
      function sync() {
        Array.prototype.forEach.call(el.children, function (b) {
          var on = b.dataset.value === String(current());
          b.setAttribute('aria-checked', String(on));
          b.classList.toggle('on', on);
        });
      }
      sync(); return sync;
    }
    var toastTimer = 0;
    function toast(msg, ms) {
      var t = $('toast'); t.textContent = msg; t.hidden = false; t.classList.add('on');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () {
        t.classList.remove('on');
        setTimeout(function () { t.hidden = true; }, 300);
      }, ms || 4800);
    }
    function timeText(t) { var m = Math.max(0, Math.min(1439, Math.round(t * 60))); return hh(Math.floor(m / 60)) + ':' + hh(m % 60); }

    // ── 标准湖镜冷白 ↔ 全局核密度暗夜热力场 联动切换 ───────────────────────
    var thermalFlashTimer = 0;
    function setThermal(on) {
      on = !!on;
      var changed = S.thermal !== on;
      S.thermal = on;
      var key = on ? 'thermal' : 'lake';
      if (g.HZ_SET_PALETTE) {
        var p = g.HZ_SET_PALETTE(key);
        S.palette = p.key;
      } else {
        S.palette = key;
      }
      S.layers.heatmap = on;
      M.syncPalette();
      C.syncPalette();
      city.setLayer('heatmap', on);
      city.applyPalette();
      if (changed && !reduced()) {
        app.classList.remove('thermal-switching');
        void app.offsetWidth;
        app.classList.add('thermal-switching');
        clearTimeout(thermalFlashTimer);
        thermalFlashTimer = setTimeout(function () { app.classList.remove('thermal-switching'); }, 740);
      }
      if ($('btn-thermal')) setPressed($('btn-thermal'), on);
      if (layerBtns.heatmap) setPressed(layerBtns.heatmap, on);
      renderLegend();
      renderRouteChips();
      renderTide();
      if (S.sheet === 'station' && S.sel) renderStationPane();
      if (S.sheet === 'insight') renderInsight();
    }
    if ($('btn-thermal')) {
      $('btn-thermal').addEventListener('click', function () {
        closePopovers();
        setThermal(!S.thermal);
      });
    }

    // ── 当前时刻取值与三维点云同步 ───────────────────────────────────────
    var vals = new Float32Array(M.cloud.length);
    function cityReading() {
      var d = day();
      return M.sample(d.city, d.cityAnchors, S.t, S.smooth);
    }
    function computeCloud(instant) {
      var d = day(), f = factor(), shown = 0;
      for (var i = 0; i < vals.length; i++) {
        var s = d.cloudSeries[i];
        if (!s) { vals[i] = NaN; continue; }
        var r = M.sample(s, d.cloudAnchors[i], S.t, S.smooth);
        vals[i] = r.v === r.v ? r.v * f : NaN;
        if (r.v === r.v) shown++;
      }
      city.setCloud(vals, { instant: instant });
      S.barsShown = shown;
    }
    function stationReading(target) {
      var d = day();
      if (!target) return null;
      if (target.kind === 'cloud') {
        var s = d.cloudSeries[target.idx];
        if (!s) return { kind: 'none', v: NaN, total: NaN, series: null, anchors: [] };
        var r = M.sample(s, d.cloudAnchors[target.idx], S.t, S.smooth);
        return { kind: r.kind, v: r.v, total: d.cloudTotal[target.idx], series: s, anchors: d.cloudAnchors[target.idx], from: r.from, to: r.to };
      }
      if (target.kind === 'hub') {
        var hv = d.hubVals[target.id];
        if (!hv || !hv.anchors.length) return { kind: 'none', v: NaN, total: NaN, series: hv ? hv.series : null, anchors: [] };
        var r2 = M.sample(hv.series, hv.anchors, S.t, S.smooth);
        return { kind: r2.kind, v: r2.v, total: hv.total, series: hv.series, anchors: hv.anchors, from: r2.from, to: r2.to, ids: hv.ids };
      }
      if (target.kind === 'ad') {
        var av = d.adVals && d.adVals[target.id];
        if (!av || !av.anchors.length) return { kind: 'none', v: NaN, total: NaN, series: av ? av.series : null, anchors: [], activeStops: 0, otsIndex: 0, peak: null };
        var r3 = M.sample(av.series, av.anchors, S.t, S.smooth);
        return {
          kind: r3.kind, v: r3.v, total: av.total, series: av.series, anchors: av.anchors,
          from: r3.from, to: r3.to, activeStops: av.activeStops, otsIndex: av.otsIndex, peak: av.peak
        };
      }
      return null;
    }
    function targetInfo(target) {
      if (target.kind === 'cloud') {
        var c = M.cloud[target.idx];
        return {
          name: c.name, district: c.district, x: c.x, z: c.z, type: '客流站点',
          sub: '官方站点 ID ' + c.id + (c.routes ? ' · 途经 ' + c.routes + ' 条线路' : ''),
          cloud: c, adSpotId: c.adSpotId
        };
      }
      if (target.kind === 'ad') {
        var ad = M.adSpotById[target.id];
        return {
          name: ad.name, short: ad.short, district: ad.district, x: ad.x, z: ad.z,
          type: ad.tier + ' 级黄金广告口',
          sub: '500m 步程辐射 ' + ad.nearIdxs.length + ' 座公交站 · 单站最高 ' + ad.maxRoutes + ' 条线路交汇',
          ad: ad, tier: ad.tier
        };
      }
      var h = M.hubById[target.id];
      return { name: h.name, short: h.short, district: h.district, x: h.x, z: h.z, type: '核心枢纽站', sub: h.category, hub: h, adSpotId: h.adSpotId };
    }

    // ── 顶部刊头与潮位钟 ─────────────────────────────────────────────────
    function renderMasthead() {
      var d = day();
      $('mh-date').textContent = S.date.replace(/^(\d+)-(\d+)-(\d+)$/, function (_, y, m, dd) { return y + ' 年 ' + Number(m) + ' 月 ' + Number(dd) + ' 日'; });
      $('mh-weekday').textContent = d.weekday + (isLow(S.date) ? ' · 记录量偏低' : '');
      $('mh-weekday').classList.toggle('warn', isLow(S.date));
      $('date-current-label').innerHTML =
        '<span class="dl-long">' + S.date.slice(5).replace('-', ' 月 ') + ' 日 ' + d.weekday.replace('星期', '周') + '</span>' +
        '<span class="dl-short">' + Number(S.date.slice(5, 7)) + '/' + Number(S.date.slice(8)) + ' ' + d.weekday.replace('星期', '周') + '</span>';
      renderClock();
    }
    function renderClock() {
      var r = cityReading(), f = factor();
      var h = Math.floor(Math.min(S.t, 23.999));
      $('clock-time').textContent = S.smooth ? timeText(S.t) : hh(h) + ':00';
      var st = $('clock-state');
      st.dataset.kind = r.kind;
      st.textContent = r.kind === 'record' ? '记录' : r.kind === 'interp' ? '插值过渡' : '无记录';
      var cp = $('clock-period');
      if (cp) cp.textContent = periodLabel(h, r.kind);

      var reading;
      if (r.kind === 'record') reading = '全市 ' + hh(h) + ' 时段记录 <b>' + fmt(r.v) + '</b> 人次；1,800 站中 <b>' + fmt(S.barsShown) + '</b> 站有记录';
      else if (r.kind === 'interp') reading = hh(r.from) + ' 时与 ' + hh(r.to) + ' 时两次记录之间的过渡画面，<b>不是实测</b>';
      else reading = '当日 ' + hh(h) + ' 时段没有记录；柱体不显示，不代表客流为零';
      if (S.scenario !== 'record' && r.kind !== 'none') reading += '<span class="scenario-tag">' + M.SCENARIOS[S.scenario].label + ' ×' + f + '</span>';
      $('clock-reading').innerHTML = reading;

      var gb = $('gap-banner');
      var showGap = r.kind === 'none' && S.layers.cloud;
      if (showGap) gb.textContent = hh(h) + ' 时段当日无记录：点云暂不显示。';
      gb.hidden = !showGap;

      $('tide').setAttribute('aria-valuenow', S.t.toFixed(2));
      $('tide').setAttribute('aria-valuetext', (S.smooth ? timeText(S.t) : hh(h) + ' 时') + '，' + st.textContent);
      positionTideHead();

      if (S.sel) {
        var sr = stationReading(S.sel), info = targetInfo(S.sel);
        city.setSelectionLabel((info.short || info.name) + '  ' + (sr && sr.v === sr.v ? fmt(sr.v * f) + (sr.kind === 'interp' ? '（插值）' : '') : '无记录'));
      }
    }

    // ── 底部 24 小时潮位时间带（带实测潮络曲线） ─────────────────────────
    var tideEl = $('tide'), tideSvg = $('tide-svg'), SVGNS = 'http://www.w3.org/2000/svg';
    function renderTide() {
      var d = day(), w = tideEl.clientWidth || 600, h = tideEl.clientHeight || 62;
      tideSvg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      tideSvg.replaceChildren();
      var colW = w / 24, top = 7, base = h - 20, maxV = 1;
      d.cityAnchors.forEach(function (x) { maxV = Math.max(maxV, d.city[x]); });

      // 绘制相邻有记录小时段之间的柔和潮络包络（严格不在长达数小时的无记录空缺上画实线误导，仅在连续或隔1小时锚点间铺底纹，或平滑模式下浅虚线提示）
      if (d.cityAnchors.length > 1) {
        var segs = [], curSeg = [];
        for (var ai = 0; ai < d.cityAnchors.length; ai++) {
          var ah = d.cityAnchors[ai];
          var px = (ah + 0.5) * colW;
          var py = base - Math.max(3, Math.sqrt(d.city[ah] / maxV) * (base - top));
          if (curSeg.length && ah - curSeg[curSeg.length - 1].h > (S.smooth ? 24 : 2)) {
            if (curSeg.length > 1) segs.push(curSeg);
            curSeg = [];
          }
          curSeg.push({ h: ah, x: px, y: py });
        }
        if (curSeg.length > 1) segs.push(curSeg);

        segs.forEach(function (seg) {
          var dLine = 'M ' + seg[0].x.toFixed(1) + ' ' + seg[0].y.toFixed(1);
          for (var si = 1; si < seg.length; si++) {
            var p0 = seg[si - 1], p1 = seg[si], mx = (p0.x + p1.x) * 0.5;
            dLine += ' C ' + mx.toFixed(1) + ' ' + p0.y.toFixed(1) + ', ' + mx.toFixed(1) + ' ' + p1.y.toFixed(1) + ', ' + p1.x.toFixed(1) + ' ' + p1.y.toFixed(1);
          }
          var area = document.createElementNS(SVGNS, 'path');
          area.setAttribute('d', dLine + ' L ' + seg[seg.length - 1].x.toFixed(1) + ' ' + base.toFixed(1) + ' L ' + seg[0].x.toFixed(1) + ' ' + base.toFixed(1) + ' Z');
          area.setAttribute('class', 'tide-area');
          tideSvg.appendChild(area);

          var curve = document.createElementNS(SVGNS, 'path');
          curve.setAttribute('d', dLine);
          curve.setAttribute('class', 'tide-curve');
          if (S.smooth) curve.setAttribute('stroke-dasharray', '4 3');
          tideSvg.appendChild(curve);
        });
      }

      var cur = Math.floor(Math.min(S.t, 23.999));
      for (var x = 0; x < 24; x++) {
        var v = d.city[x], g0 = document.createElementNS(SVGNS, 'g');
        var rect = document.createElementNS(SVGNS, 'rect');
        if (v === v) {
          var bh = Math.max(3.5, Math.sqrt(v / maxV) * (base - top));
          rect.setAttribute('x', (x * colW + colW * 0.18).toFixed(1));
          rect.setAttribute('width', (colW * 0.64).toFixed(1));
          rect.setAttribute('y', (base - bh).toFixed(1));
          rect.setAttribute('height', bh.toFixed(1));
          rect.setAttribute('rx', '2.5');
          rect.setAttribute('class', 'tide-bar' + (x === cur ? ' now' : ''));
        } else {
          rect.setAttribute('x', (x * colW + colW * 0.18).toFixed(1));
          rect.setAttribute('width', (colW * 0.64).toFixed(1));
          rect.setAttribute('y', (base - 9).toFixed(1));
          rect.setAttribute('height', '9');
          rect.setAttribute('rx', '2');
          rect.setAttribute('class', 'tide-gap' + (x === cur ? ' now' : ''));
        }
        var tt = document.createElementNS(SVGNS, 'title');
        tt.textContent = hh(x) + ' 时：' + (v === v ? '全市记录 ' + fmt(v) + ' 人次' : '当日无记录');
        rect.appendChild(tt); g0.appendChild(rect);

        if (x % 3 === 0) {
          var lb = document.createElementNS(SVGNS, 'text');
          lb.setAttribute('x', (x * colW + colW * 0.5).toFixed(1));
          lb.setAttribute('y', String(h - 4));
          lb.setAttribute('text-anchor', 'middle');
          lb.setAttribute('class', 'tide-tick');
          lb.textContent = hh(x);
          g0.appendChild(lb);
        }
        tideSvg.appendChild(g0);
      }
      var bl = document.createElementNS(SVGNS, 'line');
      bl.setAttribute('x1', '0'); bl.setAttribute('x2', String(w));
      bl.setAttribute('y1', String(base + 0.5)); bl.setAttribute('y2', String(base + 0.5));
      bl.setAttribute('class', 'tide-base');
      tideSvg.appendChild(bl);
      lastTideHour = -1;
      positionTideHead();
    }

    var lastTideHour = -1;
    function positionTideHead() {
      var w = tideEl.clientWidth || 600;
      var x = S.smooth ? S.t / 24 * w : (Math.floor(Math.min(S.t, 23.999)) + 0.5) / 24 * w;
      $('tide-head').style.transform = 'translateX(' + x.toFixed(1) + 'px)';
      $('tide-head-label').textContent = S.smooth ? timeText(S.t) : hh(Math.floor(Math.min(S.t, 23.999))) + ':00';
      var hr = Math.floor(Math.min(S.t, 23.999));
      if (hr !== lastTideHour) {
        lastTideHour = hr;
        Array.prototype.forEach.call(tideSvg.querySelectorAll('rect'), function (r, i) { r.classList.toggle('now', i === hr); });
      }
    }
    function tFromX(clientX) {
      var r = tideEl.getBoundingClientRect(), p = Math.max(0, Math.min(0.99999, (clientX - r.left) / r.width));
      return S.smooth ? Math.round(p * 24 * 4) / 4 : Math.floor(p * 24);
    }
    var tideDrag = false;
    tideEl.addEventListener('pointerdown', function (e) {
      tideDrag = true;
      try { tideEl.setPointerCapture(e.pointerId); } catch (err) { /* 合成事件 */ }
      setTime(tFromX(e.clientX), { pause: true });
    });
    tideEl.addEventListener('pointermove', function (e) { if (tideDrag) setTime(tFromX(e.clientX), { pause: true }); });
    tideEl.addEventListener('pointerup', function () { tideDrag = false; });
    tideEl.addEventListener('pointercancel', function () { tideDrag = false; });
    tideEl.addEventListener('keydown', function (e) {
      var step = S.smooth ? 0.25 : 1, t = S.t;
      if (e.key === 'ArrowRight') t = Math.min(23.75, (S.smooth ? t : Math.floor(t)) + step);
      else if (e.key === 'ArrowLeft') t = Math.max(0, (S.smooth ? t : Math.floor(t)) - step);
      else if (e.key === 'Home') t = 0; else if (e.key === 'End') t = S.smooth ? 23.75 : 23;
      else return;
      e.preventDefault(); setTime(t, { pause: true });
    });

    function setTime(t, opt) {
      t = Math.max(0, Math.min(23.999, t));
      if (!S.smooth) t = Math.floor(t);
      if (opt && opt.pause) setPlaying(false);
      S.t = t;
      computeCloud(opt && opt.instant);
      renderClock();
      if (!(opt && opt.fromLoop)) refreshTimeCharts();
    }
    var timeChartTimer = 0;
    function refreshTimeCharts() {
      clearTimeout(timeChartTimer);
      timeChartTimer = setTimeout(function () { renderStationChart(); renderInsight(['hourly']); }, S.playing ? 160 : 0);
    }

    // ── 播放控制 ─────────────────────────────────────────────────────────
    function setPlaying(on) {
      S.playing = !!on; S.dwell = 0;
      var b = $('btn-play'); b.classList.toggle('playing', S.playing);
      b.setAttribute('aria-label', S.playing ? '暂停' : '播放'); b.setAttribute('aria-pressed', String(S.playing));
    }
    $('btn-play').addEventListener('click', function () { setPlaying(!S.playing); });
    segmented($('speed-seg'), [{ value: 1, label: '1×' }, { value: 2, label: '2×' }, { value: 4, label: '4×' }], function () { return S.speed; }, function (v) { S.speed = Number(v); });
    segmented($('mode-seg'), [
      { value: 'record', label: '逐时记录', title: '只显示有记录的小时，播放时跳过无记录时段' },
      { value: 'smooth', label: '平滑插值', title: '在同一站相邻两个记录小时之间做线性插值，过渡画面不是实测' }
    ], function () { return S.smooth ? 'smooth' : 'record'; }, function (v) {
      S.smooth = v === 'smooth';
      if (!S.smooth) S.t = Math.floor(S.t);
      $('dock-note').textContent = S.smooth
        ? '平滑插值：相邻两次记录之间的线性过渡并非实测，时钟旁明确标示「插值过渡」'
        : '实心潮柱：全市有记录的小时；虚线空槽：当日无记录；流金标尺：当前时刻';
      renderTide();
      setTime(S.t, { instant: false });
    });

    function nextRecordedHour(from) {
      var a = day().cityAnchors;
      for (var i = 0; i < a.length; i++) if (a[i] > from) return a[i];
      return null;
    }

    function advancePlaybackDay(overflow) {
      var parts = S.date.split('-').map(Number);
      var next = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + 1)).toISOString().slice(0, 10);
      if (M.dates.indexOf(next) < 0) {
        setPlaying(false);
        if (S.smooth) setTime(23.999, { fromLoop: true });
        toast('已播放至 ' + S.date + '，没有下一天的数据，播放已暂停。');
        return false;
      }
      var nextDay = M.day(next);
      S.t = S.smooth ? overflow : (nextDay.cityAnchors.length ? nextDay.cityAnchors[0] : 0);
      S.dwell = 0;
      setDate(next);
      return true;
    }

    // ── 日期与 46 天热力日历 ─────────────────────────────────────────────
    function setDate(date) {
      if (M.dates.indexOf(date) < 0 || !M.day(date)) { toast('没有 ' + date + ' 的数据。'); return false; }
      S.date = date;
      computeCloud(false);
      renderMasthead(); renderTide(); renderCalendar(); renderSearch();
      renderStationPane(); renderInsight();
      return true;
    }
    function stepDate(k) { var i = M.dates.indexOf(S.date) + k; if (i >= 0 && i < M.dates.length) setDate(M.dates[i]); }
    $('date-prev').addEventListener('click', function () { stepDate(-1); });
    $('date-next').addEventListener('click', function () { stepDate(1); });

    var calEl = $('calendar');
    function renderCalendar() {
      calEl.replaceChildren();
      var head = document.createElement('div'); head.className = 'cal-head';
      head.innerHTML = '<p class="cal-title">2026 年 8 月 14 日 – 9 月 28 日</p><p class="fine">水位高度映射当日全市记录合计；虚线框为记录量明显偏低的日期。</p>';
      calEl.appendChild(head);
      var grid = document.createElement('div'); grid.className = 'cal-grid'; grid.setAttribute('role', 'grid');
      ['一', '二', '三', '四', '五', '六', '日'].forEach(function (w) { var s = document.createElement('span'); s.className = 'cal-wd'; s.textContent = w; grid.appendChild(s); });
      var first = M.day(M.dates[0]).weekdayIndex, pad = (first + 6) % 7;
      for (var p = 0; p < pad; p++) grid.appendChild(document.createElement('span'));
      var maxT = Math.max.apply(null, M.dates.map(function (d) { return M.day(d).total; }));
      var lastMonth = '';
      M.dates.forEach(function (d) {
        var dd = M.day(d), b = document.createElement('button');
        b.type = 'button'; b.className = 'cal-day' + (d === S.date ? ' on' : '') + (isLow(d) ? ' low' : '');
        b.dataset.date = d;
        var m = d.slice(5, 7);
        b.innerHTML = '<span class="cal-n">' + (m !== lastMonth ? Number(m) + '/' : '') + Number(d.slice(8)) + '</span><span class="cal-fill" style="--v:' + Math.sqrt(dd.total / maxT).toFixed(3) + '"></span>';
        lastMonth = m;
        b.setAttribute('aria-label', d + ' ' + dd.weekday + '，全市记录 ' + fmt(dd.total) + ' 人次' + (isLow(d) ? '，记录量偏低' : ''));
        b.title = d + ' ' + dd.weekday + '\n全市记录 ' + fmt(dd.total) + ' 人次';
        b.addEventListener('click', function () { setDate(d); toggleCalendar(false); $('date-current').focus(); });
        grid.appendChild(b);
      });
      calEl.appendChild(grid);
    }
    function toggleCalendar(on) {
      if (on === undefined) on = calEl.hidden;
      if (on) closePopovers('calendar');
      calEl.hidden = !on; $('date-current').setAttribute('aria-expanded', String(on));
      if (on) { var sel = calEl.querySelector('.cal-day.on'); if (sel) sel.focus(); }
    }
    $('date-current').addEventListener('click', function () { toggleCalendar(); });
    calEl.addEventListener('keydown', function (e) {
      var btns = Array.prototype.slice.call(calEl.querySelectorAll('.cal-day')), i = btns.indexOf(document.activeElement);
      if (i < 0) return;
      var k = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
      if (k) { e.preventDefault(); var n = btns[Math.max(0, Math.min(btns.length - 1, i + k))]; n.focus(); }
    });

    // ── 搜索 ─────────────────────────────────────────────────────────────
    var searchInput = $('search-input'), searchBox = $('search-results'), searchItems = [], searchActive = -1;
    function renderSearch() {
      var q = searchInput.value.trim();
      searchBox.replaceChildren(); searchItems = []; searchActive = -1;
      if (!q) { searchBox.hidden = true; searchInput.setAttribute('aria-expanded', 'false'); return; }
      var d = day(), out = [];
      (M.adSpots || []).forEach(function (ad) {
        if (ad.name.indexOf(q) >= 0 || ad.short.indexOf(q) >= 0 || ad.tag.indexOf(q) >= 0) {
          var av = d.adVals && d.adVals[ad.id];
          out.push({ t: { kind: 'ad', id: ad.id }, name: ad.name, district: ad.district, type: ad.tier + ' 级黄金广告口', v: av ? av.total : NaN, rank: -1 });
        }
      });
      M.hubs.forEach(function (h) {
        if (h.name.indexOf(q) >= 0 || h.short.indexOf(q) >= 0) {
          out.push({ t: { kind: 'hub', id: h.id }, name: h.name, district: h.district, type: '核心枢纽', v: d.hubVals[h.id].total, rank: 0 });
        }
      });
      M.cloud.forEach(function (c) {
        if (c.name.indexOf(q) >= 0) {
          out.push({ t: { kind: 'cloud', idx: c.idx }, name: c.name, district: c.district, type: '客流站点', v: d.cloudTotal[c.idx], rank: 1 });
        }
      });
      out.sort(function (a, b) { return a.rank - b.rank || ((b.v === b.v ? b.v : -1) - (a.v === a.v ? a.v : -1)); });
      var total = out.length; out = out.slice(0, 12);
      if (!out.length) {
        var p = document.createElement('p'); p.className = 'search-empty';
        p.textContent = '没有名称包含「' + q + '」的站点。可试试更短的关键词，如「武林」。';
        searchBox.appendChild(p);
      }
      out.forEach(function (r, i) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'search-item'; b.setAttribute('role', 'option'); b.id = 'sr-' + i;
        b.innerHTML = '<span class="si-name">' + esc(r.name) + '</span><span class="si-meta">' + esc(r.type) + ' · ' + esc(r.district) + '</span><span class="si-v">' + (r.v === r.v ? fmt(r.v) : '当日无记录') + '</span>';
        b.addEventListener('click', function () { chooseSearch(r); });
        searchBox.appendChild(b); searchItems.push(r);
      });
      if (total > out.length) {
        var more = document.createElement('p'); more.className = 'search-empty';
        more.textContent = '另有 ' + (total - out.length) + ' 个结果，请输入更完整的名称。';
        searchBox.appendChild(more);
      }
      searchBox.hidden = false; searchInput.setAttribute('aria-expanded', 'true');
    }
    function chooseSearch(r) {
      searchInput.value = ''; renderSearch(); searchInput.blur();
      selectTarget(r.t, { fly: true });
    }
    searchInput.addEventListener('input', renderSearch);
    searchInput.addEventListener('focus', function () { closePopovers('search'); if (searchInput.value) renderSearch(); });
    searchInput.addEventListener('keydown', function (e) {
      var btns = searchBox.querySelectorAll('.search-item');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); if (!btns.length) return;
        searchActive = (searchActive + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length;
        Array.prototype.forEach.call(btns, function (b, i) { b.classList.toggle('active', i === searchActive); });
        searchInput.setAttribute('aria-activedescendant', 'sr-' + searchActive);
      } else if (e.key === 'Enter') {
        if (searchItems.length) { e.preventDefault(); chooseSearch(searchItems[Math.max(0, searchActive)]); }
      } else if (e.key === 'Escape') { e.stopPropagation(); searchInput.value = ''; renderSearch(); searchInput.blur(); }
    });

    // ── 焦点层级：全城 › 分区/客群/线路 › 站点 ─────────────────────────────────
    function focusLabel() {
      var f = S.focus;
      if (f.district) return { kind: '分区', name: f.district };
      if (f.category) return { kind: '客群', name: f.category };
      if (f.line) return { kind: '线路', name: f.line };
      return null;
    }
    function setFocus(f, opt) {
      opt = opt || {};
      var had = !!focusLabel();
      if (!had && !S.sel) S.poses.focus = city.getPose();
      if (!had && S.sel) S.poses.focus = S.poses.sel;
      if (S.sel) {
        clearSelection({ keepCamera: true, silent: true });
        if (S.sheet === 'station') { if (S.sheetFromInsight) openSheet('insight'); else closeSheet(); }
      }
      S.focus = Object.assign({ district: null, category: null, line: null }, f);
      city.setFocus(S.focus);
      clearActivePreset();
      syncRouteChips();
      if (opt.fly !== false) {
        if (S.focus.district) {
          var d = day(), pts = [];
          M.cloud.forEach(function (c) { if (c.district === S.focus.district && d.cloudSeries[c.idx]) pts.push(c); });
          if (!pts.length) pts = M.cloud.filter(function (c) { return c.district === S.focus.district; });
          city.flyToBounds(pts);
        } else if (S.focus.category) city.flyToBounds(M.hubs.filter(function (h) { return h.category === S.focus.category; }));
        else if (S.focus.line) { var pts2 = city.lineCenter(S.focus.line); if (pts2) city.flyToBounds(pts2); }
      }
      renderTrail(); renderInsight(['district', 'category']);
    }
    function clearFocus(opt) {
      opt = opt || {};
      if (S.sel) {
        clearSelection({ keepCamera: true, silent: true });
        if (S.sheet === 'station') { if (S.sheetFromInsight) openSheet('insight'); else closeSheet(); }
      }
      S.focus = { district: null, category: null, line: null };
      city.setFocus(S.focus);
      syncRouteChips();
      if (!opt.keepCamera) {
        if (S.poses.focus) city.flyTo(S.poses.focus);
        else { city.flyPreset('overview'); setActivePreset('overview'); }
      }
      S.poses.focus = null;
      renderTrail(); renderInsight(['district', 'category']);
    }
    function selectTarget(t, opt) {
      opt = opt || {};
      if (!t) return;
      if (t.kind === 'line') { setFocus({ line: t.id }); return; }
      if (!S.sel) S.poses.sel = city.getPose();
      S.sheetFromInsight = S.sheetOpen && (S.sheet === 'insight' || (S.sheet === 'station' && S.sheetFromInsight));
      S.sel = t;
      var info = targetInfo(t);
      if ((S.focus.district && info.district !== S.focus.district) || (S.focus.category && t.kind !== 'hub')) {
        S.focus.district = null; S.focus.category = null; city.setFocus(S.focus);
      }
      city.select({ kind: t.kind, idx: t.idx, id: t.id, label: info.short || info.name });
      syncAdChips();
      if (S.layers.arcs) {
        var arcHub = t.kind === 'hub' ? t.id : (t.kind === 'ad' && info.ad ? info.ad.hubId : null);
        city.buildArcs(arcHub);
      }
      if (opt.fly !== false) { clearActivePreset(); city.flyToPoint(info.x, info.z, t.kind === 'ad' ? 28 : 32); }
      openSheet('station');
      renderClock(); renderTrail(); renderInsight(['ranking', 'ad']);
    }
    function clearSelection(opt) {
      opt = opt || {};
      if (!S.sel) return;
      S.sel = null; city.select(null); city.clearArcs();
      syncAdChips();
      if (!opt.keepCamera) { if (S.poses.sel) city.flyTo(S.poses.sel); }
      S.poses.sel = null;
      if (!opt.silent) {
        if (S.sheetFromInsight) openSheet('insight'); else closeSheet();
        renderTrail(); renderInsight(['ranking', 'ad']);
      }
    }
    function goCity() {
      if (S.sel) clearSelection({ keepCamera: true, silent: true });
      S.focus = { district: null, category: null, line: null }; city.setFocus(S.focus);
      S.poses = { focus: null, sel: null };
      syncRouteChips();
      syncAdChips();
      city.flyPreset('overview');
      setActivePreset('overview');
      if (S.sheet === 'station') { if (S.sheetFromInsight) openSheet('insight'); else closeSheet(); }
      renderTrail(); renderInsight(['district', 'category', 'ranking', 'ad']);
    }
    function renderTrail() {
      var nav = $('trail'); nav.replaceChildren();
      var fl = focusLabel(), items = [];
      items.push({ label: '全城', act: goCity, current: !fl && !S.sel });
      if (fl) items.push({ label: fl.name, kind: fl.kind, act: function () { if (S.sel) clearSelection(); }, current: !S.sel });
      if (S.sel) {
        var ti = targetInfo(S.sel);
        var kLabel = S.sel.kind === 'ad' ? '广告口' : (S.sel.kind === 'hub' ? '枢纽' : '站点');
        items.push({ label: ti.short || ti.name, kind: kLabel, current: true });
      }
      items.forEach(function (it, i) {
        if (i) {
          var sep = document.createElement('span'); sep.className = 'trail-sep'; sep.setAttribute('aria-hidden', 'true'); sep.textContent = '›';
          nav.appendChild(sep);
        }
        var b = document.createElement(it.current ? 'span' : 'button');
        b.className = 'trail-item' + (it.current ? ' current' : '');
        b.innerHTML = (it.kind ? '<small>' + it.kind + '</small>' : '') + esc(it.label);
        if (!it.current) { b.type = 'button'; b.addEventListener('click', it.act); } else b.setAttribute('aria-current', 'location');
        nav.appendChild(b);
      });
      if (fl || S.sel) {
        var back = document.createElement('button'); back.type = 'button'; back.className = 'trail-back';
        back.textContent = '返回全城'; back.title = '回到城市全景（Esc 逐级返回）';
        back.addEventListener('click', goCity); nav.appendChild(back);
      }
      app.dataset.level = S.sel ? 'station' : fl ? 'focus' : 'city';
    }

    // ── 地图拾取与富信息悬停微图卡片 ─────────────────────────────────────
    function onPick(hit) {
      if (!hit) return;
      if (hit.kind === 'line') { setFocus({ line: hit.id }); return; }
      if (hit.kind === 'ad') { selectTarget({ kind: 'ad', id: hit.id }, { fly: true }); return; }
      selectTarget(hit.kind === 'cloud' ? { kind: 'cloud', idx: hit.idx } : { kind: 'hub', id: hit.id }, { fly: true });
    }

    function miniSparkSvg(series, curHour, isGold) {
      if (!series) return '';
      var maxV = 0;
      for (var i = 0; i < 24; i++) if (series[i] === series[i] && series[i] > maxV) maxV = series[i];
      if (!maxV) return '';
      var w = 192, h = 22, cw = w / 24, parts = [];
      var baseCol = isGold ? 'rgba(184,130,59,0.55)' : 'rgba(45,125,158,0.62)';
      var curCol = C.T.seal || '#b8823b';
      var gapCol = 'rgba(100,128,148,0.28)';
      for (var k = 0; k < 24; k++) {
        var v = series[k], x = (k * cw + 1).toFixed(1), bw = Math.max(2, cw - 2).toFixed(1);
        if (v === v) {
          var bh = Math.max(2.5, Math.sqrt(v / maxV) * (h - 2));
          parts.push('<rect x="' + x + '" y="' + (h - bh).toFixed(1) + '" width="' + bw + '" height="' + bh.toFixed(1) + '" rx="1" fill="' + (k === curHour ? curCol : baseCol) + '"/>');
        } else {
          parts.push('<rect x="' + x + '" y="' + (h - 2) + '" width="' + bw + '" height="1.5" fill="' + gapCol + '"/>');
        }
      }
      return '<svg class="tip-spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true">' + parts.join('') + '</svg>';
    }

    var tip = $('hover-tip');
    function onHover(hit, x, y) {
      if (!hit) { tip.hidden = true; tip.classList.remove('tip-gold'); $('stage-canvas').style.cursor = ''; return; }
      $('stage-canvas').style.cursor = 'pointer';
      var html, isGold = false;
      if (hit.kind === 'line') {
        var l = M.lines.filter(function (q) { return q.id === hit.id; })[0];
        html = '<div class="tip-head"><b>' + esc(l.id) + '</b><span class="tip-badge">骨干公交线</span></div>' +
          '<span class="tip-sub">' + esc(l.route) + '</span>' +
          '<span class="tip-v">' + (l.km ? l.km + ' km · ' : '') + l.stops.length + ' 座沿线站点 · 点击聚焦线路</span>';
      } else {
        var t = hit.kind === 'cloud' ? { kind: 'cloud', idx: hit.idx } : (hit.kind === 'ad' ? { kind: 'ad', id: hit.id } : { kind: 'hub', id: hit.id });
        var info = targetInfo(t), r = stationReading(t), f = factor();
        var cs = M.catchmentStats(S.date, t, S.t, S.smooth, f);
        var curH = Math.floor(Math.min(23.999, S.t));
        isGold = t.kind === 'ad';
        var badge = '';
        if (t.kind === 'ad') {
          badge = '<span class="tip-badge tip-badge-gold">' + esc(info.tier) + ' 级广告口</span>';
        } else if (cs && cs.topPct === cs.topPct) {
          badge = '<span class="tip-badge' + (cs.topPct <= 5 ? ' tip-badge-gold' : '') + '">全城 Top ' + cs.topPct + '%</span>';
        }
        var now = r && r.v === r.v
          ? (r.kind === 'interp' ? '插值约 ' : (t.kind === 'ad' ? '500m 圈内 ' : '记录 ')) + fmt(r.v * f) + ' 人次' + (r.kind === 'interp' ? '（非实测）' : '')
          : '本时段无记录';
        var spark = r && r.series ? miniSparkSvg(r.series, curH, isGold) : '';
        var catchLine = '';
        if (t.kind === 'ad' && info.ad) {
          catchLine = '<span class="tip-catch">500m 覆盖 <em>' + info.ad.nearIdxs.length + '</em> 站 · 最高 <em>' + info.ad.maxRoutes + '</em> 线交汇 · 当日 <em>' + (r && r.total === r.total ? fmt(r.total) : '—') + '</em></span>';
        } else if (cs) {
          catchLine = '<span class="tip-catch">当日 <em>' + (r && r.total === r.total ? fmt(r.total) : '—') + '</em> · 500m 辐射 <em>' + cs.stopsActiveDay + '/' + cs.stopsTotal + '</em> 站合计 <em>' + fmt(cs.sumDay) + '</em></span>';
        }
        html = '<div class="tip-head"><b>' + esc(info.short || info.name) + '</b>' + badge + '</div>' +
          '<span class="tip-sub">' + esc(info.type) + ' · ' + esc(info.district) + (t.kind === 'ad' && info.ad ? ' · ' + esc(info.ad.tag.split(' · ')[0]) : '') + '</span>' +
          '<span class="tip-v">' + (S.smooth ? timeText(S.t) : hh(curH) + ' 时') + '：' + now + '</span>' +
          spark + catchLine;
      }
      tip.classList.toggle('tip-gold', isGold);
      tip.innerHTML = html; tip.hidden = false;
      var tw = tip.offsetWidth, th = tip.offsetHeight;
      var left = Math.min(g.innerWidth - tw - 12, x + 16), top = y - th - 14;
      if (top < 70) top = y + 18;
      tip.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(top) + 'px)';
    }

    // ── 右侧抽屉 ─────────────────────────────────────────────────────────
    var sheet = $('sheet');
    function updateInsets() {
      var narrow = g.innerWidth <= 780;
      city.setInset({
        right: S.sheetOpen && !narrow ? sheet.offsetWidth + 16 : 0,
        bottom: narrow && S.sheetOpen ? sheet.offsetHeight : $('dock').offsetHeight * 0.7,
        top: narrow ? $('masthead').getBoundingClientRect().bottom : $('toolbar').offsetHeight * 0.4,
        left: narrow ? 0 : Math.min(260, $('masthead').offsetWidth * 0.45)
      });
    }
    var KICKERS = {
      station: 'STATION TIDE PROFILE',
      insight: 'TRANSIT ANALYTICS',
      about: 'DATA PROVENANCE & NOTES'
    };
    function openSheet(kind) {
      S.sheet = kind; S.sheetOpen = true;
      sheet.inert = false; sheet.setAttribute('aria-hidden', 'false');
      app.dataset.sheet = kind;
      ['station', 'insight', 'about'].forEach(function (k) { $('pane-' + k).hidden = k !== kind; });
      if ($('sheet-kicker')) $('sheet-kicker').textContent = KICKERS[kind] || '';
      $('sheet-title').textContent = { station: '站点潮位档案', insight: '客流统计分析', about: '数据口径与说明' }[kind];
      $('sheet-back').hidden = !(kind === 'station' && S.sheetFromInsight);
      $('btn-insight').setAttribute('aria-expanded', String(kind === 'insight'));
      $('btn-about').setAttribute('aria-expanded', String(kind === 'about'));
      $('btn-insight').classList.toggle('on', kind === 'insight' || (kind === 'station' && S.sheetFromInsight));
      $('btn-about').classList.toggle('on', kind === 'about');
      if (kind === 'station') renderStationPane();
      if (kind === 'insight') { buildInsight(); renderInsight(); }
      if (kind === 'about') renderAbout();
      updateInsets();
      requestAnimationFrame(function () { resizeCharts(); });
      setTimeout(resizeCharts, 440);
    }
    function closeSheet() {
      if (S.sel) { S.sheetFromInsight = false; clearSelection(); return; }
      S.sheet = null; S.sheetOpen = false; S.sheetFromInsight = false;
      sheet.inert = true; sheet.setAttribute('aria-hidden', 'true'); app.dataset.sheet = '';
      $('btn-insight').setAttribute('aria-expanded', 'false'); $('btn-about').setAttribute('aria-expanded', 'false');
      $('btn-insight').classList.remove('on'); $('btn-about').classList.remove('on');
      updateInsets();
    }
    $('sheet-close').addEventListener('click', function () {
      if (S.sel) { S.sheetFromInsight = false; clearSelection(); } else closeSheet();
    });
    $('sheet-back').addEventListener('click', function () { clearSelection(); });
    $('btn-insight').addEventListener('click', function () {
      closePopovers();
      if (S.sheet === 'insight' && S.sheetOpen) closeSheet();
      else { if (S.sel) { clearSelection({ keepCamera: true, silent: true }); renderTrail(); } S.sheetFromInsight = false; openSheet('insight'); }
    });
    $('btn-about').addEventListener('click', function () {
      closePopovers();
      if (S.sheet === 'about' && S.sheetOpen) closeSheet();
      else { if (S.sel) { clearSelection({ keepCamera: true, silent: true }); renderTrail(); } S.sheetFromInsight = false; openSheet('about'); }
    });

    // ── 单站档案与黄金户外广告口选址评估面板 ─────────────────────────────
    var stationChart = null;
    function renderStationPane() {
      var pane = $('pane-station');
      if (!S.sel || S.sheet !== 'station') return;
      var t = S.sel, info = targetInfo(t), r = stationReading(t), f = factor();
      var cs = M.catchmentStats(S.date, t, S.t, S.smooth, f);
      var h = Math.floor(Math.min(S.t, 23.999));
      var nowTxt = r.v === r.v ? fmt(r.v * f) : '—';
      var nowLabel = (S.smooth ? timeText(S.t) : hh(h) + ' 时段') + (r.kind === 'interp' ? ' · 插值（非实测）' : r.kind === 'record' ? ' · 记录' : ' · 无记录');

      if ($('sheet-kicker')) $('sheet-kicker').textContent = t.kind === 'ad' ? 'OUTDOOR MEDIA DOSSIER' : 'STATION TIDE PROFILE';
      if ($('sheet-title')) $('sheet-title').textContent = t.kind === 'ad' ? '黄金广告口选址评估' : '站点潮位档案';

      var rankBadge = '';
      if (t.kind === 'ad') {
        rankBadge = '<span class="st-rank-pill">OTS 潜力分 ' + fmt(r.otsIndex || 0) + '</span>';
      } else if (cs && cs.topPct === cs.topPct) {
        rankBadge = '<span class="st-rank-pill">全城 Top ' + cs.topPct + '%（#' + cs.rank + '/' + cs.rankBase + '）</span>';
      }

      var extraTop = '';
      if (t.kind === 'ad' && info.ad) {
        var ad = info.ad;
        extraTop =
          '<section class="ad-dossier" aria-label="户外广告选址价值评估">' +
          '<div class="ad-dossier-tag"><span>' + esc(ad.tag) + '</span><small>500m 有记录 ' + (r.activeStops || 0) + '/' + ad.nearIdxs.length + ' 站</small></div>' +
          '<dl class="ad-dossier-grid">' +
          '<div class="ad-dossier-row"><dt>推荐媒体</dt><dd>' + esc(ad.media) + '</dd></div>' +
          '<div class="ad-dossier-row"><dt>触达客群</dt><dd>' + esc(ad.audience) + '</dd></div>' +
          '<div class="ad-dossier-row"><dt>高峰时段</dt><dd>' + (r.peak ? hh(r.peak.hour) + ':00 峰值 <b>' + fmt(r.peak.value) + '</b> 人次/小时' : '所选日期暂无小时记录') + '</dd></div>' +
          '</dl></section>';
      } else if (cs) {
        extraTop =
          '<div class="st-catch-strip">' +
          '<span>500m 步程辐射圈：覆盖 <b>' + cs.stopsActiveDay + '/' + cs.stopsTotal + '</b> 座有记录站点</span>' +
          '<span>圈内当日合计 <b>' + fmt(cs.sumDay) + '</b> 人次</span>' +
          '</div>';
        if (info.adSpotId && M.adSpotById[info.adSpotId]) {
          var linkedAd = M.adSpotById[info.adSpotId];
          extraTop +=
            '<button type="button" class="st-ad-link" id="btn-jump-ad">' +
            '<div>所属 <b>[' + esc(linkedAd.tier) + ' 级] ' + esc(linkedAd.short) + '</b> 黄金广告商圈</div>' +
            '<span>查看投放评估 ›</span></button>';
        }
      }

      var hubNote = '';
      if (t.kind === 'hub') {
        var ids = (r && r.ids) || info.hub.officialIds || [];
        hubNote = '<p class="fine">核心枢纽站按原版口径合并 ' + ids.length + ' 个官方站点 ID 的记录（同名或相邻的上下行站台）。客群分类「' + esc(info.hub.category) + '」沿用原版基于 ' + esc(M.meta.cloudBaseDate) + ' 数据的划分。</p>';
      } else if (t.kind === 'ad') {
        hubNote = '<p class="fine">口径说明：500m 步程圈实测客流由路口半径 500m 内固定 1,800 站当日真实刷卡/客流记录聚合，缺失小时不补 0；OTS 触达潜力指数综合圈内实测人次与交汇线路密度，供广告选址横向比选参考。</p>';
      }

      var lineIds = t.kind === 'hub' ? info.hub.lines : (t.kind === 'ad' && info.ad ? info.ad.backboneLines : []);
      var thirdDt = t.kind === 'ad' ? '单站最高交汇' : '有记录的小时';
      var thirdDd = t.kind === 'ad'
        ? (info.ad.maxRoutes + '<small>条线路</small>')
        : ((r.anchors ? r.anchors.length : 0) + '<small>/ 24</small>');

      pane.innerHTML =
        '<header class="st-head"><div class="st-badge-row">' +
        '<span class="st-type' + (t.kind === 'ad' ? ' st-type-gold' : '') + '">' + esc(info.type) + ' · ' + esc(info.district) + '</span>' +
        rankBadge + '</div>' +
        '<h3 class="st-name">' + esc(info.name) + '</h3><p class="st-sub">' + esc(info.sub) + '</p></header>' +
        '<dl class="st-metrics">' +
        '<div><dt>' + esc(S.date.slice(5).replace('-', '/')) + (t.kind === 'ad' ? ' 商圈合计' : ' 当日记录') + '</dt><dd>' + (r.total === r.total ? fmt(r.total) : '—') + '<small>人次</small></dd></div>' +
        '<div><dt>' + esc(nowLabel) + '</dt><dd class="' + (r.kind === 'interp' ? 'interp' : '') + '">' + nowTxt + '<small>人次</small></dd></div>' +
        '<div><dt>' + thirdDt + '</dt><dd>' + thirdDd + '</dd></div>' +
        '</dl>' +
        extraTop +
        (S.scenario !== 'record' ? '<p class="scenario-note">' + esc(M.SCENARIOS[S.scenario].note) + '</p>' : '') +
        '<div class="st-chart-head"><h4>' + (t.kind === 'ad' ? '500m 商圈 24 小时曝光潮位' : '24 小时潮位与所在区站均对比') + '</h4><p class="fine">点击柱子跳到该小时</p></div>' +
        '<div class="chart st-chart" id="chart-station" role="img" aria-label="' + esc(info.name) + ' 的 24 小时记录"></div>' +
        (r.anchors && r.anchors.length ? '' : '<p class="empty-note">该目标在 ' + esc(S.date) + ' 没有任何记录。可在顶部切换到其它日期查看。</p>') +
        hubNote +
        (lineIds && lineIds.length ? '<div class="st-lines"><h4>交汇骨干线路</h4><div class="chips" id="st-lines"></div></div>' : '') +
        '<p class="fine">实心柱为记录值；虚线格为当日无记录的小时' + (t.kind !== 'ad' ? '；红色虚线为所在区单站小时均值' : '') + (S.smooth ? '；灰色虚线为相邻记录间插值，不是实测' : '') + '。</p>';

      if ($('btn-jump-ad') && info.adSpotId) {
        $('btn-jump-ad').addEventListener('click', function () {
          selectTarget({ kind: 'ad', id: info.adSpotId }, { fly: true });
        });
      }

      if (lineIds && lineIds.length) {
        var lc = $('st-lines');
        if (lc) lineIds.forEach(function (lid) {
          var l = M.lines.filter(function (q) { return q.id === lid; })[0]; if (!l) return;
          var b = document.createElement('button'); b.type = 'button'; b.className = 'chip line-chip';
          b.style.setProperty('--c', l.color); b.textContent = l.id;
          b.title = l.route; b.addEventListener('click', function () { setFocus({ line: l.id }); });
          lc.appendChild(b);
        });
      }
      if (stationChart) { stationChart.dispose(); stationChart = null; }
      stationChart = g.echarts.init($('chart-station'), null, { renderer: 'svg' });
      stationChart.on('click', function (p) {
        var hr = Number(p.name);
        if (Number.isInteger(hr) && r.series && r.series[hr] === r.series[hr]) setTime(hr, { pause: true });
      });
      renderStationChart(true);
    }
    function renderStationChart(first) {
      if (!stationChart || !S.sel || S.sheet !== 'station') return;
      var t = S.sel, info = targetInfo(t), r = stationReading(t), d = day();
      var distObj = t.kind !== 'ad' && d.districtMap ? d.districtMap[info.district] : null;
      var bench = distObj ? distObj.avgByHour : null;
      stationChart.setOption(C.hourlyOption({
        series: r.series, anchors: r.anchors, hour: S.t, factor: factor(),
        showInterp: S.smooth,
        recordName: t.kind === 'ad' ? '500m 商圈实测' : '本站记录',
        benchSeries: bench,
        benchName: info.district + '站均',
        legend: !!bench,
        animate: !!first && !reduced(), dense: false, emptyText: '当日无记录'
      }), true);
      if (!first) {
        var f = factor(), h = Math.floor(Math.min(S.t, 23.999));
        var dd = document.querySelectorAll('#pane-station .st-metrics dd')[1];
        var dt = document.querySelectorAll('#pane-station .st-metrics dt')[1];
        if (dd && dt) {
          dt.textContent = (S.smooth ? timeText(S.t) : hh(h) + ' 时段') + (r.kind === 'interp' ? ' · 插值（非实测）' : r.kind === 'record' ? ' · 记录' : ' · 无记录');
          dd.className = r.kind === 'interp' ? 'interp' : '';
          dd.innerHTML = (r.v === r.v ? fmt(r.v * f) : '—') + '<small>人次</small>';
        }
      }
    }

    // ── 统计分析面板 ─────────────────────────────────────────────────────
    var insightBuilt = false, IC = {}, insightTabs = { district: 'share', category: 'rose' };
    function buildInsight() {
      if (insightBuilt) return; insightBuilt = true;
      var pane = $('pane-insight');
      pane.innerHTML =
        '<nav class="in-nav" aria-label="分析内容">' +
        ['overview:概况', 'ad:黄金广告口', 'hourly:一天之中', 'district:各区', 'ranking:热门站点', 'trend:46 天', 'category:客群'].map(function (s) {
          var p = s.split(':'); return '<a href="#sec-' + p[0] + '">' + p[1] + '</a>';
        }).join('') + '</nav>' +
        '<section class="in-sec" id="sec-overview"><h3>当日概况</h3><dl class="in-metrics" id="in-metrics"></dl><p class="scope">全市合计含原始数据当日全部记录；站点数为固定 1,800 站中当日有记录的站点。</p></section>' +
        '<section class="in-sec" id="sec-ad"><h3>黄金户外广告交汇口评估矩阵</h3><p class="scope">精选全城 12 处多线路公交交汇十字商圈：横轴为 500m 步程圈当日实测客流，纵轴为单站最高交汇线路数，气泡面积映射 OTS 触达潜力。点击气泡直达路口选址档案。</p><div class="chart in-chart tall" id="ch-ad"></div></section>' +
        '<section class="in-sec" id="sec-hourly"><h3>一天之中</h3><p class="scope">全市各小时记录合计。虚线空槽为当日无记录的小时，不做补齐。点击柱子，城市切到该小时。</p><div class="chart in-chart" id="ch-hourly"></div></section>' +
        '<section class="in-sec" id="sec-district"><div class="sec-head"><h3>各区空间结构</h3><div class="segmented compact" id="tab-district"></div></div><p class="scope">范围：固定 1,800 站。点击某区，三维城市聚焦该行政区。</p><div class="chart in-chart tall" id="ch-district"></div></section>' +
        '<section class="in-sec" id="sec-ranking"><h3>热门站点 TOP 10</h3><p class="scope">固定 1,800 站中当日记录合计前十。点击站名直接定位到站点。</p><div class="chart in-chart tall" id="ch-ranking"></div></section>' +
        '<section class="in-sec" id="sec-trend"><h3>46 天连续走势</h3><p class="scope">全市每日记录合计。空心点为记录量明显偏低的日期，原因不明，不宜直接解读为客流骤降。点击切换日期。</p><div class="chart in-chart" id="ch-trend"></div></section>' +
        '<section class="in-sec" id="sec-category"><div class="sec-head"><h3>客群与站点层级</h3><div class="segmented compact" id="tab-category"></div></div><p class="scope" id="scope-category"></p><div class="chart in-chart tall" id="ch-category"></div></section>';

      pane.querySelectorAll('.in-nav a').forEach(function (a) {
        a.addEventListener('click', function (e) {
          e.preventDefault();
          var t = $(a.getAttribute('href').slice(1));
          if (t) t.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
        });
      });
      segmented($('tab-district'), [{ value: 'share', label: '占比' }, { value: 'period', label: '时段构成' }], function () { return insightTabs.district; }, function (v) { insightTabs.district = v; renderInsight(['district']); });
      segmented($('tab-category'), [{ value: 'rose', label: '客群结构' }, { value: 'tree', label: '区域与站点' }], function () { return insightTabs.category; }, function (v) { insightTabs.category = v; renderInsight(['category']); });
      ['ad', 'hourly', 'district', 'ranking', 'trend', 'category'].forEach(function (k) { IC[k] = g.echarts.init($('ch-' + k), null, { renderer: 'svg' }); });

      IC.ad.on('click', function (p) {
        if (p.data && p.data.id) selectTarget({ kind: 'ad', id: p.data.id }, { fly: true });
      });

      function columnClick(chart, cb) {
        chart.getZr().on('click', function (e) {
          if (!chart.containPixel({ gridIndex: 0 }, [e.offsetX, e.offsetY])) return;
          var v = chart.convertFromPixel({ seriesIndex: 0 }, [e.offsetX, e.offsetY]);
          var i = Math.round(Array.isArray(v) ? v[0] : v);
          if (Number.isFinite(i)) cb(i);
        });
      }
      columnClick(IC.hourly, function (hr) { if (hr >= 0 && hr < 24 && day().city[hr] === day().city[hr]) setTime(hr, { pause: true }); });
      IC.district.on('click', function (p) {
        var name = p.name || (p.data && p.data.name);
        if (M.districtNames.indexOf(name) < 0) return;
        if (S.focus.district === name) clearFocus(); else setFocus({ district: name });
      });
      IC.ranking.on('click', function (p) {
        var idx = p.data && p.data.idx;
        if (idx === undefined && p.componentType === 'yAxis') { var row = rankRows[p.dataIndex]; idx = row && row.idx; }
        if (idx !== undefined) selectTarget({ kind: 'cloud', idx: idx }, { fly: true });
      });
      columnClick(IC.trend, function (i) { var dd = M.dates[i]; if (dd && dd !== S.date) setDate(dd); });
      IC.category.on('click', function (p) {
        var data = p.data || {};
        if (insightTabs.category === 'rose') {
          if (M.categories.indexOf(p.name) >= 0) { if (S.focus.category === p.name) clearFocus(); else setFocus({ category: p.name }); }
          return;
        }
        if (data.idx !== undefined) selectTarget({ kind: 'cloud', idx: data.idx }, { fly: true });
        else if (M.districtNames.indexOf(p.name) >= 0) setFocus({ district: p.name });
      });
    }

    var rankRows = [];
    function renderInsight(parts) {
      if (!insightBuilt || S.sheet !== 'insight' || !S.sheetOpen) return;
      var d = day(), all = !parts, want = function (k) { return all || parts.indexOf(k) >= 0; };
      var anim = !reduced();
      if (all) {
        var cov = d.coverage, peak = d.peak;
        $('in-metrics').innerHTML =
          '<div><dt>全市记录合计</dt><dd>' + fmt(d.total) + '<small>人次</small></dd><p>' + esc(S.date.slice(5)) + ' ' + d.weekday.replace('星期', '周') + (isLow(S.date) ? '，记录量偏低' : '') + '</p></div>' +
          '<div><dt>有记录的站点</dt><dd>' + fmt(cov) + '<small>/ 1,800</small></dd><p>固定站点范围</p></div>' +
          '<div><dt>记录峰值小时</dt><dd>' + (peak ? hh(peak.hour) + ' 时' : '—') + '</dd><p>' + (peak ? fmt(peak.value) + ' 人次<br>共 ' + d.cityAnchors.length + ' 个小时有记录' : '当日无小时记录') + '</p></div>';
      }
      if (want('ad') || all) {
        var adRows = (M.adSpots || []).map(function (ad) {
          var av = d.adVals && d.adVals[ad.id];
          return {
            id: ad.id, short: ad.short, name: ad.name, tier: ad.tier, district: ad.district,
            stops: ad.nearIdxs.length, maxRoutes: ad.maxRoutes, tag: ad.tag,
            total: av ? av.total : NaN, ots: av ? av.otsIndex : 0
          };
        });
        IC.ad.setOption(C.adMatrixOption(adRows, S.sel && S.sel.kind === 'ad' ? S.sel.id : null), true);
      }
      if (want('hourly')) IC.hourly.setOption(C.hourlyOption({ series: d.city, anchors: d.cityAnchors, hour: S.t, factor: 1, showInterp: false, animate: anim && all, recordName: '全市记录' }), true);
      if (want('district') || all) {
        IC.district.setOption(insightTabs.district === 'share' ? C.donutOption(d.districts, S.focus.district) : C.periodOption(d.districts, S.focus.district), true);
      }
      if (want('ranking') || all) {
        rankRows = d.ranking.slice(0, 10).map(function (r) { var c = M.cloud[r.idx]; return { idx: r.idx, name: c.name, district: c.district, value: r.value }; });
        IC.ranking.setOption(C.rankingOption(rankRows, S.sel && S.sel.kind === 'cloud' ? S.sel.idx : -1), true);
      }
      if (all) {
        IC.trend.setOption(C.trendOption(M.dates.map(function (dt) {
          var x = M.day(dt); return { date: dt, weekday: x.weekday, total: x.total, records: x.recordCount, low: isLow(dt) };
        }), S.date), true);
      }
      if (want('category') || all) {
        if (insightTabs.category === 'rose') {
          $('scope-category').textContent = '32 个核心枢纽站按客群分类的当日记录合计。核心站合并多个官方站点 ID，分类沿用原版基于 ' + M.meta.cloudBaseDate + ' 的划分。点击扇区，城市突出该类站点。';
          var cats = M.categories.map(function (name) {
            var v = 0, n = 0;
            M.hubs.forEach(function (h) { if (h.category === name) { n++; var hv = d.hubVals[h.id]; if (hv.total === hv.total) v += hv.total; } });
            return { name: name, value: v, count: n };
          }).sort(function (a, b) { return b.value - a.value; });
          IC.category.setOption(C.roseOption(cats, S.focus.category), true);
        } else {
          $('scope-category').textContent = '面积为固定 1,800 站的当日记录：先按区，再列出各区前 6 站，其余站点合并。点击站点定位，点击区名聚焦该区。';
          var byD = {};
          M.districtNames.forEach(function (n) { byD[n] = []; });
          d.ranking.forEach(function (r) { var c = M.cloud[r.idx]; if (byD[c.district]) byD[c.district].push(r); });
          var restColor = g.HZ_PALETTE && g.HZ_PALETTE.dark ? '#38556e' : '#96b1c2';
          var tree = M.districtNames.map(function (n, i) {
            var list = byD[n], top = list.slice(0, 6), rest = list.slice(6);
            var children = top.map(function (r) { return { name: M.cloud[r.idx].name, value: r.value, idx: r.idx }; });
            if (rest.length) children.push({ name: '其余站点', value: rest.reduce(function (a, r) { return a + r.value; }, 0), rest: rest.length, itemStyle: { color: restColor } });
            return { name: n, value: list.reduce(function (a, r) { return a + r.value; }, 0), itemStyle: { color: C.T.districts[i % C.T.districts.length] }, children: children };
          }).filter(function (x) { return x.value > 0; });
          IC.category.setOption(C.treemapOption(tree), true);
        }
      }
    }
    function resizeCharts() {
      Object.keys(IC).forEach(function (k) { if (IC[k]) IC[k].resize(); });
      if (stationChart) stationChart.resize();
    }

    // ── 数据口径说明面板 ─────────────────────────────────────────────────
    var aboutBuilt = false;
    function renderAbout() {
      if (aboutBuilt) { if ($('about-tiles')) $('about-tiles').textContent = $('tile-status').textContent; return; }
      aboutBuilt = true;
      var m = M.meta;
      $('pane-about').innerHTML =
        '<section class="ab-sec"><h3>数据从哪里来</h3>' +
        '<p>站点客流：浙江省数据开放平台，杭州市城投集团公交客流数据（原版数据包 hz_official_data.js、hz_date_data.js）。覆盖 2026-08-14 至 2026-09-28 共 46 天，记录条数 ' + fmt(m.recordCountAllDays) + '，记录值合计 ' + fmt(m.totalAllDays) + '。</p>' +
        '<p>线路、站点坐标、路网与地标：原版本地数据包 hz_real_gis.js；行政区边界：高德 330100 行政区划本地几何包。坐标已做 ' + esc(m.coordinateTransform || 'WGS-84 → GCJ-02') + ' 纠偏，无需调用任何外部 API 密钥。</p>' +
        '<p>底图状态：<span id="about-tiles">' + esc($('tile-status').textContent) + '</span></p></section>' +
        '<section class="ab-sec"><h3>每个数字的范围</h3>' +
        '<p><b>全市合计、全市小时值</b>：当日原始数据中的全部记录。</p>' +
        '<p><b>点云、各区、热门站点</b>：以 ' + esc(m.cloudBaseDate) + ' 选出的固定 1,800 个站点，不是每天重新选出的前 1,800 站，各日期有记录的站点数不同。因此各区之和小于全市合计。</p>' +
        '<p><b>核心枢纽站</b>：32 个核心枢纽，每个合并多个官方站点 ID 的记录。同一 ID 可能同时归入多个枢纽，客群结构图的合计可能重复计算，仅作结构参考。</p>' +
        '<p><b>黄金户外广告交汇口</b>：精选全城 12 处多线路交汇商圈与医教门户路口，聚合半径 500m 步程辐射圈内固定 1,800 站实测客流与途经线路密度，辅助户外候车亭灯箱与街角大屏选址评估。</p>' +
        '<p><b>小时段</b>：按记录的「起始时间」所在小时归类，「07 时」表示 07:00–07:59。</p></section>' +
        '<section class="ab-sec"><h3>缺失、插值与情景</h3>' +
        '<p><b>缺失</b>：某站某小时没有记录时，柱体不显示，曲线留空，不按 0 处理。不同日期有记录的小时不同，例如 09-22 的 18 时没有任何记录。</p>' +
        '<p><b>逐时记录（默认）</b>：只显示真实记录；播放时在有记录的小时之间跳转。</p>' +
        '<p><b>平滑插值</b>：同一站相邻两个有记录的小时之间线性过渡，时钟旁标「插值过渡」。这只是动画，不代表新增观测；首个记录之前、最后一个记录之后不做外推。</p>' +
        '<p><b>节假日、雨天情景</b>：沿用原版系数（× 1.24、× 1.12），只作用于三维点云与站点曲线，并始终标注「情景推演」。分析图表一律显示记录值。</p>' +
        '<p><b>示意车辆与关联示意线</b>：车辆沿线路匀速移动，只表示线路走向；关联示意线按引力模型连接核心站，不是实测出行 OD，因此不显示人数。</p></section>' +
        '<section class="ab-sec"><h3>原版数据解释中的疑点</h3><ol class="doubts">' +
        '<li>原始客流文件实读 ' + fmt(m.flowRawRows) + ' 行，平台标称 ' + fmt(m.flowPlatformReported) + ' 行；生成脚本对重复的逻辑记录做了累加，未再核查。所有合计按现有数据包显示，可能偏高。</li>' +
        '<li>部分日期的记录量极低（如 08-15 仅 ' + fmt(M.day('2026-08-15') ? M.day('2026-08-15').total : NaN) + '），更像采集覆盖差异，原因未知，本版只标注不解读。</li>' +
        '<li>原版插值在 00:00 处补了一个 0 作为锚点，等于把夜间缺失当 0。本版取消该锚点，首尾不外推。</li>' +
        '<li>原版首页三张概览图把记录值乘以随时刻变化的合成曲线系数；原版各处情景系数也不一致（1.18、1.24、1.25）。本版图表只用记录值，情景统一为 1.24 / 1.12 并标注。</li>' +
        '<li>原版线路「负载率」、关联飞线人数、点击客流点显示的「下车 = 记录 × 2.45」均来自合成参数，没有观测依据，本版不显示这些数字。</li>' +
        '<li>原版说明文字中的部分数值（如灵隐公交总站 950、14 时峰值 418）与随附数据包不一致（09-22 该站单个站点 ID 为 818、14 时 349；合并 3 个 ID 的核心站为 1,008、14 时 423），本版不沿用这些文字。</li>' +
        '<li>每天有记录的小时并不完整：多数日期只有 02、03、06、07、10、11、14、15、22、23 时，16–21 时几乎全天空缺（仅少数日期有 18 时），晚高峰无法用这份数据呈现。</li>' +
        '<li>客群分类基于 ' + esc(m.cloudBaseDate) + ' 单日数据，套用到其它日期时含义可能变化。</li></ol></section>' +
        '<section class="ab-sec"><h3>字体与许可</h3><p>正文字体为方正宋刻本秀楷简繁（北京北大方正电子有限公司），随包副本仅用于本课程项目、非商业用途；本机已安装时优先使用本机字体。界面数字与后备字体 MiSans（小米），随附原版许可：<a href="./fonts/MiSans-license.pdf" target="_blank" rel="noopener">MiSans 字体许可</a>。标题、时钟与站名使用 Noto Serif CJK SC Bold 的本地子集（SIL Open Font License 1.1，<a href="./fonts/NotoSerifCJK-OFL.txt" target="_blank" rel="noopener">许可全文</a>），无需联网。Three.js（MIT）、Apache ECharts（Apache-2.0）为本地副本。</p>' +
        '<p class="fine">课程：大数据可视化（SCAI008312）</p></section>';
    }

    // ── 图层、热力场与偏好弹层 ───────────────────────────────────────────
    var LAYERS = [
      { key: 'heatmap', label: '全局核密度热力场' }, { key: 'adSpots', label: '黄金广告交汇口' },
      { key: 'cloud', label: '站点客流柱' }, { key: 'lines', label: '骨干公交线路' }, { key: 'buses', label: '示意车辆' },
      { key: 'hubs', label: '核心枢纽站' }, { key: 'tiles', label: '在线瓦片叠层' }, { key: 'regions', label: '地名标注' },
      { key: 'districts', label: '行政区界' }, { key: 'buildings', label: '建筑体块' }, { key: 'arcs', label: '关联示意线（非实测）' }
    ];
    var layerBtns = {};
    LAYERS.forEach(function (L) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'switch';
      b.innerHTML = '<span class="sw" aria-hidden="true"></span>' + L.label;
      b.addEventListener('click', function () { setLayer(L.key, !S.layers[L.key]); });
      $('layer-switches').appendChild(b); layerBtns[L.key] = b;
    });
    function setLayer(k, on) {
      if (k === 'heatmap') { setThermal(on); return; }
      S.layers[k] = on; city.setLayer(k, on);
      if (layerBtns[k]) setPressed(layerBtns[k], on);
      if (k === 'adSpots' && $('ad-bar')) $('ad-bar').hidden = !on;
      if (k === 'arcs') {
        if (on && S.sel && S.sel.kind === 'hub') city.buildArcs(S.sel.id);
        else if (on && S.sel && S.sel.kind === 'ad' && M.adSpotById[S.sel.id] && M.adSpotById[S.sel.id].hubId) city.buildArcs(M.adSpotById[S.sel.id].hubId);
        else if (on) toast('关联示意线从选中的核心枢纽站出发。请先点击一个核心枢纽站（地面带圆环与标尺杆的站点）。');
      }
      if (k === 'cloud') renderClock();
      $('legend').classList.toggle('muted', !S.layers.cloud && !S.layers.heatmap);
    }
    Object.keys(S.layers).forEach(function (k) { if (layerBtns[k]) setPressed(layerBtns[k], S.layers[k]); city.setLayer(k, S.layers[k]); });

    segmented($('scenario-seg'), Object.keys(M.SCENARIOS).map(function (k) { return { value: k, label: M.SCENARIOS[k].label }; }), function () { return S.scenario; }, function (v) {
      S.scenario = v; $('scenario-note').textContent = M.SCENARIOS[v].note;
      app.dataset.scenario = v;
      computeCloud(false); renderClock(); renderStationPane();
    });

    var prefBtn = document.createElement('button'); prefBtn.type = 'button'; prefBtn.className = 'switch';
    prefBtn.innerHTML = '<span class="sw" aria-hidden="true"></span>减少动态效果';
    prefBtn.addEventListener('click', function () { S.reducedPref = !S.reducedPref; applyMotion(); });
    $('pref-switches').appendChild(prefBtn);
    function applyMotion() {
      setPressed(prefBtn, reduced());
      prefBtn.title = sysReduced.matches ? '系统已开启「减少动态效果」' : '';
      document.documentElement.dataset.motion = reduced() ? 'reduced' : 'full';
    }
    if (sysReduced.addEventListener) sysReduced.addEventListener('change', applyMotion);
    applyMotion();

    var layersPop = $('layers-pop');
    function toggleLayers(on) {
      if (on === undefined) on = layersPop.hidden;
      if (on) closePopovers('layers');
      layersPop.hidden = !on;
      $('btn-layers').setAttribute('aria-expanded', String(on));
      $('btn-layers').classList.toggle('on', on);
    }
    $('btn-layers').addEventListener('click', function () { toggleLayers(); });
    function closePopovers(except) {
      if (except !== 'calendar' && !calEl.hidden) toggleCalendar(false);
      if (except !== 'layers' && !layersPop.hidden) toggleLayers(false);
      if (except !== 'search' && !searchBox.hidden) { searchBox.hidden = true; searchInput.setAttribute('aria-expanded', 'false'); }
    }
    document.addEventListener('pointerdown', function (e) {
      if (!e.target.closest('#date-picker') && !calEl.hidden) toggleCalendar(false);
      if (!e.target.closest('#layers-pop') && !e.target.closest('#btn-layers') && !layersPop.hidden) toggleLayers(false);
      if (!e.target.closest('#search') && !searchBox.hidden) { searchBox.hidden = true; searchInput.setAttribute('aria-expanded', 'false'); }
    });

    // 底图状态：内置高精矢量路网+跨江大桥始终就绪，离线打开时安静回退、不弹出干扰性错误框
    function onTileStatus(st) {
      var el = $('tile-status');
      if (!el) return;
      if (st.disabled) el.textContent = '离线模式：已启用内置高精矢量路网与水系底图';
      else if (st.loading) el.textContent = '内置矢量路网已就绪 · 在线瓦片叠层加载中（' + st.loaded + '/' + st.total + '）';
      else if (st.loaded === 0) el.textContent = '离线模式：内置高精矢量路网与跨江大桥已完整呈现';
      else if (st.failed) el.textContent = '内置矢量路网 + 在线瓦片已融合（' + st.loaded + '/' + st.total + '）';
      else el.textContent = '内置高精矢量路网 + 在线瓦片底图已完整融合（' + st.loaded + '/' + st.total + '）';
      el.dataset.state = st.loading ? 'loading' : st.loaded === 0 ? 'offline' : st.failed ? 'partial' : 'ok';
      var retry = $('btn-tile-retry');
      if (retry) retry.hidden = st.loading || !st.failed || st.disabled;
      var ab = $('about-tiles');
      if (ab) ab.textContent = el.textContent;
    }
    $('btn-tile-retry').addEventListener('click', function () { city.retryTiles(); });

    // ── 左下：镜头预设与 10 条骨干线路速览带 ─────────────────────────────
    var presetBtns = {};
    [
      { k: 'overview', l: '城市全景' },
      { k: 'westlake', l: '西湖湖滨' },
      { k: 'qianjiang', l: '钱江新城' },
      { k: 'east_hub', l: '东站枢纽' }
    ].forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'chip' + (p.k === 'overview' ? ' on' : '');
      b.textContent = p.l; b.dataset.preset = p.k;
      b.addEventListener('click', function () {
        city.flyPreset(p.k);
        setActivePreset(p.k);
      });
      $('view-presets').appendChild(b);
      presetBtns[p.k] = b;
    });
    function setActivePreset(key) {
      S.preset = key;
      Object.keys(presetBtns).forEach(function (k) { presetBtns[k].classList.toggle('on', k === key); });
    }
    function clearActivePreset() { setActivePreset(null); }

    $('btn-dim').addEventListener('click', function () {
      var on = !city.is2D; city.setMode2D(on); setPressed($('btn-dim'), on);
      $('btn-dim').textContent = on ? '3D 立体' : '2D 平面';
      $('btn-dim').title = on ? '回到 3D 立体城市' : '切换为 2D 平面正射俯视';
    });
    $('btn-reset-view').addEventListener('click', function () { goCity(); });

    function renderAdChips() {
      var wrap = $('ad-presets');
      if (!wrap) return;
      wrap.replaceChildren();
      (M.adSpots || []).forEach(function (ad) {
        var isOn = S.sel && S.sel.kind === 'ad' && S.sel.id === ad.id;
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip ad-chip' + (isOn ? ' on' : '');
        b.dataset.ad = ad.id;
        b.title = '[' + ad.tier + ' 级] ' + ad.name + '\n' + ad.tag;
        b.innerHTML = '<i class="ad-tier' + (ad.tier === 'S' ? ' ad-tier-s' : '') + '" aria-hidden="true">' + esc(ad.tier) + '</i><span>' + esc(ad.short) + '</span>';
        b.addEventListener('click', function () {
          if (S.sel && S.sel.kind === 'ad' && S.sel.id === ad.id) clearSelection();
          else selectTarget({ kind: 'ad', id: ad.id }, { fly: true });
        });
        wrap.appendChild(b);
      });
    }
    function syncAdChips() {
      var wrap = $('ad-presets');
      if (!wrap) return;
      Array.prototype.forEach.call(wrap.children, function (b) {
        b.classList.toggle('on', !!(S.sel && S.sel.kind === 'ad' && b.dataset.ad === S.sel.id));
      });
    }

    function renderRouteChips() {
      var wrap = $('route-presets');
      if (!wrap) return;
      wrap.replaceChildren();
      M.lines.forEach(function (l) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip route-chip' + (S.focus.line === l.id ? ' on' : '');
        b.dataset.line = l.id;
        b.style.setProperty('--c', l.color);
        b.title = l.id + ' · ' + l.route + (l.km ? '（' + l.km + ' km）' : '');
        b.innerHTML = '<i class="route-dot" aria-hidden="true"></i><span>' + esc(l.id) + '</span>';
        b.addEventListener('click', function () {
          if (S.focus.line === l.id) clearFocus();
          else setFocus({ line: l.id });
        });
        wrap.appendChild(b);
      });
    }
    function syncRouteChips() {
      var wrap = $('route-presets');
      if (!wrap) return;
      Array.prototype.forEach.call(wrap.children, function (b) {
        b.classList.toggle('on', b.dataset.line === S.focus.line);
      });
    }

    // ── 右下：五级潮位标尺与核密度热力图例 ───────────────────────────────
    function renderLegend() {
      var ramp = $('legend-ramp');
      if (ramp.children.length !== M.heat.labels.length) {
        ramp.replaceChildren();
        M.heat.labels.forEach(function (lab, i) {
          var li = document.createElement('li');
          li.innerHTML = '<i style="background:' + M.heat.colors[i] + ';height:' + (7 + i * 5.5) + 'px"></i><span>' + lab + '</span>';
          ramp.appendChild(li);
        });
      } else {
        M.heat.colors.forEach(function (col, i) {
          var bar = ramp.children[i] && ramp.children[i].querySelector('i');
          if (bar) bar.style.background = col;
        });
      }
      if ($('legend-thermal')) {
        $('legend-thermal').hidden = false;
        $('legend-thermal').classList.toggle('on', S.thermal);
      }
      if ($('legend-title')) $('legend-title').textContent = S.thermal ? '站点潮位与核密度热力' : '站点本时段客流';
      if ($('legend-note')) {
        $('legend-note').textContent = S.thermal
          ? '地表热力光斑按本时段实测站点高斯核密度实时合成；无记录站不参与核叠加。'
          : '柱体缺席表示该站本时段无记录，不按 0 处理。';
      }
      $('legend').classList.toggle('muted', !S.layers.cloud && !S.layers.heatmap);
    }

    // ── 键盘快捷键 ───────────────────────────────────────────────────────
    document.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName) || '';
      var typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
      if (e.key === 'Escape') {
        if (!calEl.hidden) { toggleCalendar(false); $('date-current').focus(); return; }
        if (!layersPop.hidden) { toggleLayers(false); $('btn-layers').focus(); return; }
        if (S.sel) { clearSelection(); return; }
        if (focusLabel()) { clearFocus(); return; }
        if (S.sheetOpen) { closeSheet(); return; }
        return;
      }
      if (typing) return;
      if (e.key === ' ' && (e.target === document.body || e.target === tideEl || e.target.tagName === 'CANVAS')) {
        e.preventDefault(); setPlaying(!S.playing);
      } else if (e.key === 'h' || e.key === 'H') {
        e.preventDefault(); setThermal(!S.thermal);
      } else if (e.key === '[') stepDate(-1);
      else if (e.key === ']') stepDate(1);
      else if (e.key === '/') { e.preventDefault(); searchInput.focus(); }
    });

    // ── 尺寸自适应 ───────────────────────────────────────────────────────
    var resizeTimer = 0;
    function onResize() {
      city.resize(); renderTide(); updateInsets();
      clearTimeout(resizeTimer); resizeTimer = setTimeout(resizeCharts, 120);
    }
    g.addEventListener('resize', onResize);
    if (g.ResizeObserver) new ResizeObserver(function () { renderTide(); }).observe(tideEl);

    g.addEventListener('error', function (e) { (g.HZ_BOOT.errors).push(String(e.message)); toast('运行出错：' + e.message + '。可刷新页面恢复。', 8000); });
    g.addEventListener('unhandledrejection', function (e) { (g.HZ_BOOT.errors).push(String(e.reason)); });

    // ── 主渲染循环 ───────────────────────────────────────────────────────
    var prev = performance.now(), fps = { frames: 0, t0: prev, value: 0, worst: 0 };
    function loop(now) {
      requestAnimationFrame(loop);
      var dt = Math.min(0.1, Math.max(0, (now - prev) / 1000)); prev = now;
      fps.frames++; fps.worst = Math.max(fps.worst, dt);
      if (now - fps.t0 > 1000) {
        fps.value = fps.frames * 1000 / (now - fps.t0);
        fps.frames = 0; fps.t0 = now; fps.lastWorst = fps.worst; fps.worst = 0;
      }
      if (S.playing && !document.hidden) {
        if (S.smooth) {
          var t = S.t + dt * 0.35 * S.speed;
          if (t >= 24) advancePlaybackDay(t - 24);
          else { S.t = t; computeCloud(false); renderClock(); refreshTimeChartsThrottled(now); }
        } else {
          S.dwell += dt * S.speed;
          if (S.dwell >= 1.6) {
            S.dwell = 0;
            var nextHour = nextRecordedHour(Math.floor(S.t));
            if (nextHour === null) advancePlaybackDay(0);
            else { setTime(nextHour, { fromLoop: true }); refreshTimeChartsThrottled(now, true); }
          }
        }
      }
      city.frame(now, dt);
    }
    var lastChartT = 0;
    function refreshTimeChartsThrottled(now, force) {
      if (force || now - lastChartT > 400) { lastChartT = now; renderStationChart(); renderInsight(['hourly']); }
    }

    // ── 启动初始化 ───────────────────────────────────────────────────────
    renderLegend();
    renderAdChips();
    renderRouteChips();
    computeCloud(true);
    renderMasthead(); renderTide(); renderCalendar(); renderTrail(); updateInsets();
    $('scenario-note').textContent = M.SCENARIOS.record.note;
    app.dataset.state = 'ready'; app.dataset.sheet = ''; app.dataset.scenario = 'record';
    requestAnimationFrame(loop);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        renderTide(); resizeCharts();
        if (S.sheet === 'insight') renderInsight();
      });
    }

    // 供答辩演示与自动化核查读取的公开接口
    g.HZ_APP = {
      model: M, city: city, state: S, cityError: cityError ? String(cityError.message) : null,
      fps: function () { return { fps: Math.round(fps.value), worstFrameMs: Math.round((fps.lastWorst || 0) * 1000) }; },
      actions: {
        setDate: setDate, setTime: setTime, setPlaying: setPlaying, selectTarget: selectTarget,
        setFocus: setFocus, clearFocus: clearFocus, clearSelection: clearSelection, goCity: goCity,
        openSheet: openSheet, closeSheet: closeSheet, setLayer: setLayer, setThermal: setThermal,
        setPalette: function (k) { setThermal(k === 'thermal'); }
      },
      snapshot: function () {
        var r = cityReading();
        return {
          date: S.date, t: S.t, palette: S.palette, thermal: S.thermal, playing: S.playing, smooth: S.smooth,
          scenario: S.scenario, clock: $('clock-time').textContent, clockKind: r.kind,
          cityValue: r.v, barsShown: S.barsShown, focus: Object.assign({}, S.focus),
          sel: S.sel, sheet: S.sheetOpen ? S.sheet : null,
          trail: $('trail').textContent, city: city.debug(), errors: g.HZ_BOOT.errors.slice()
        };
      }
    };
  };
})(window);

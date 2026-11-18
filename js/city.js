/* ═══════════════════════════════════════════════════════════════════════════
   三维城市引擎
   - GLSL 动态波光釉面水系（西湖、钱塘江、京杭大运河）与双层水岸光晕
   - 城市经纬网格与高精度矢量双层路网（离线状态下依然完整细腻）
   - 精雕五大杭州地标白模（大莲花 24 瓣花冠、市民中心六合双环、杭州之门悬挑双塔、火车东站梭形穹顶、西湖文化广场塔尖）+ 钱塘江跨江大桥斜拉索
   - 建筑体块底部环境光遮蔽（Vertex AO）与屋顶微光渐变
   - 1,800 站客流潮位柱 + 发光顶冠 + 峰值涟漪标尺
   - 实时支持三套釉色主题切换（湖镜冷白 / 宋韵天青 / 钱塘夜潮）
   ═══════════════════════════════════════════════════════════════════════════ */
(function (g) {
  'use strict';
  var HZ = g.HZ = g.HZ || {};

  HZ.createCity = function createCity(o) {
    var THREE = g.THREE, M = o.model, GIS = M.GIS, P = M.project;
    var container = o.container, labelsEl = o.labelsEl;
    var reduced = o.reducedMotion || function () { return false; };

    var COLORS = Object.assign({
      skyTop: '#fbfdff', skyMid: '#edf4fa', skyBottom: '#dce9f3', fog: 0xe6eff6,
      ground: 0xeaf1f6, gridMinor: 0xdce7ef, gridMajor: 0xcbdbe6,
      waterDeep: 0x7eaac4, waterShallow: 0xa4cadf, waterSpec: 0xeaf6fc,
      shore: 0x5c8da8, shoreGlow: 0xd3e8f4,
      mountain: 0xdbe6ee, mountainTop: 0xedf3f8, contour: 0x9ab2c3,
      building: 0xf9fcff, buildingBase: 0xd5e3ee, buildingEdge: 0xc2d5e3,
      road: 0xc8d7e3, roadMain: 0xa8bfd0, roadCasing: 0xdfeaf2, bridge: 0xf4f8fc,
      ink: 0x102536, seal: 0xb8823b, accent: 0x1f7496, district: 0x628096,
      glaze: 0xeef4f8, island: 0xe4eef4, park: 0xdcebe6,
      landmark: 0xffffff, landmarkEdge: 0x8fb0c7,
      skyLight: 0xffffff, groundLight: 0xb9cedd, sun: 0xfffaf2,
      tileTint: '#e9f2f8', crown: 0xffffff
    }, g.HZ_PALETTE ? g.HZ_PALETTE.city : {});

    // ── 渲染器 ────────────────────────────────────────────────────────────
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (err) {
      var e = new Error('此设备或浏览器无法创建 WebGL，三维城市不可用。'); e.code = 'WEBGL'; throw e;
    }
    renderer.setPixelRatio(Math.min(g.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth || 1, container.clientHeight || 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    container.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('tabindex', '-1');

    var disposables = [];
    function track(x) { disposables.push(x); return x; }

    var scene = new THREE.Scene();
    var skyCanvas = document.createElement('canvas'); skyCanvas.width = 4; skyCanvas.height = 256;
    var skyCtx = skyCanvas.getContext('2d');
    var skyTex = track(new THREE.CanvasTexture(skyCanvas));
    skyTex.colorSpace = THREE.SRGBColorSpace;
    scene.background = skyTex;
    function updateSkyTexture(topCol, midCol, botCol) {
      var gr = skyCtx.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, topCol || COLORS.skyTop);
      gr.addColorStop(0.55, midCol || COLORS.skyMid || COLORS.skyTop);
      gr.addColorStop(1, botCol || COLORS.skyBottom);
      skyCtx.fillStyle = gr; skyCtx.fillRect(0, 0, 4, 256);
      skyTex.needsUpdate = true;
    }
    updateSkyTexture();
    scene.fog = new THREE.Fog(COLORS.fog, 122, 268);

    var camera = new THREE.PerspectiveCamera(33.5, 1, 0.5, 620);

    var hemiLight = new THREE.HemisphereLight(COLORS.skyLight, COLORS.groundLight, 2.05);
    scene.add(hemiLight);

    var sun = new THREE.DirectionalLight(COLORS.sun, 1.72);
    sun.position.set(-48, 86, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 10; sun.shadow.camera.far = 230;
    sun.shadow.camera.left = -78; sun.shadow.camera.right = 78;
    sun.shadow.camera.top = 78; sun.shadow.camera.bottom = -78;
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    var rimLight = new THREE.DirectionalLight(COLORS.waterShallow, 0.45);
    rimLight.position.set(55, 36, -52);
    scene.add(rimLight);

    var world = new THREE.Group(); scene.add(world);
    var vertical = new THREE.Group(); world.add(vertical);

    // ── 地面与精密制图经纬网（离线亦具纸面地图质感） ──────────────────────
    var groundMat = track(new THREE.MeshLambertMaterial({ color: COLORS.ground }));
    var ground = new THREE.Mesh(track(new THREE.PlaneGeometry(760, 760)), groundMat);
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.14; ground.receiveShadow = true;
    world.add(ground);

    var gridGroup = new THREE.Group();
    var gridMinorMat = track(new THREE.LineBasicMaterial({ color: COLORS.gridMinor, transparent: true, opacity: 0.48 }));
    var gridMajorMat = track(new THREE.LineBasicMaterial({ color: COLORS.gridMajor, transparent: true, opacity: 0.62 }));
    (function buildCartoGrid() {
      var minorPts = [], majorPts = [], span = 150, step = 6;
      for (var v = -span; v <= span; v += step) {
        var arr = (v % 30 === 0) ? majorPts : minorPts;
        arr.push(new THREE.Vector3(v, -0.09, -span), new THREE.Vector3(v, -0.09, span));
        arr.push(new THREE.Vector3(-span, -0.09, v), new THREE.Vector3(span, -0.09, v));
      }
      gridGroup.add(new THREE.LineSegments(track(new THREE.BufferGeometry().setFromPoints(minorPts)), gridMinorMat));
      gridGroup.add(new THREE.LineSegments(track(new THREE.BufferGeometry().setFromPoints(majorPts)), gridMajorMat));
      // 城市中心罗盘环（武林—西湖外围细刻度圈）
      var ringGeo = track(new THREE.RingGeometry(46, 46.18, 128)); ringGeo.rotateX(-Math.PI / 2);
      var ringMesh = new THREE.Mesh(ringGeo, track(new THREE.MeshBasicMaterial({ color: COLORS.gridMajor, transparent: true, opacity: 0.35, depthWrite: false })));
      ringMesh.position.set(0, -0.085, 0);
      gridGroup.add(ringMesh);
      world.add(gridGroup);
    })();

    // ── 高德路网瓦片（可选增强层；失败时静默退回矢量底图，绝不遮挡画面） ────
    var tiles = { total: 25, loaded: 0, failed: 0, loading: true, plane: null, retry: function () {} };
    (function buildTiles() {
      var z = 12, n = Math.pow(2, z);
      var LON0 = GIS.CENTER[0], LAT0 = GIS.CENTER[1];
      var lon2x = function (lon) { return (lon + 180) / 360 * n; };
      var lat2y = function (lat) { var r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n; };
      var x2lon = function (x) { return x / n * 360 - 180; };
      var y2lat = function (y) { var a = Math.PI - 2 * Math.PI * y / n; return 180 / Math.PI * Math.atan(0.5 * (Math.exp(a) - Math.exp(-a))); };
      var cx = Math.floor(lon2x(LON0)), cy = Math.floor(lat2y(LAT0));
      var x0 = cx - 2, y0 = cy - 2, cols = 5, rows = 5;
      var nw = P(x2lon(x0), y2lat(y0)), se = P(x2lon(x0 + cols), y2lat(y0 + rows));
      var canvas = document.createElement('canvas'); canvas.width = cols * 256; canvas.height = rows * 256;
      var ctx = canvas.getContext('2d');
      var tex = track(new THREE.CanvasTexture(canvas)); tex.colorSpace = THREE.SRGBColorSpace;
      var mat = track(new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false }));
      var geo = track(new THREE.PlaneGeometry(se[0] - nw[0], se[1] - nw[1])); geo.rotateX(-Math.PI / 2);
      var plane = new THREE.Mesh(geo, mat);
      plane.position.set((nw[0] + se[0]) / 2, -0.07, (nw[1] + se[1]) / 2);
      plane.renderOrder = -1;
      world.add(plane); tiles.plane = plane;
      var list = [];
      for (var dx = 0; dx < cols; dx++) for (var dy = 0; dy < rows; dy++) list.push({ dx: dx, dy: dy, tx: x0 + dx, ty: y0 + dy, state: 'pending' });
      var active = 0, queue = [];
      function report() {
        tiles.loaded = list.filter(function (t) { return t.state === 'loaded'; }).length;
        tiles.failed = list.filter(function (t) { return t.state === 'failed'; }).length;
        tiles.loading = list.some(function (t) { return t.state === 'pending' || t.state === 'loading'; });
        if (o.onTileStatus) o.onTileStatus({ total: list.length, loaded: tiles.loaded, failed: tiles.failed, loading: tiles.loading });
      }
      function load(t, attempt) {
        t.state = 'loading';
        var img = new Image(); img.crossOrigin = 'anonymous';
        var done = false;
        var timer = setTimeout(function () { finish(false); }, 6500);
        function finish(ok) {
          if (done) return; done = true; clearTimeout(timer); img.onload = img.onerror = null;
          if (ok) {
            try {
              ctx.save();
              ctx.filter = 'grayscale(1) contrast(1.2) brightness(1.06)';
              ctx.drawImage(img, t.dx * 256, t.dy * 256, 256, 256);
              ctx.restore();
              ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = COLORS.tileTint || '#e9f2f8';
              ctx.fillRect(t.dx * 256, t.dy * 256, 256, 256); ctx.restore();
              tex.needsUpdate = true; t.state = 'loaded';
            } catch (err) { ok = false; }
          }
          if (!ok && attempt < 1) { load(t, attempt + 1); return; }
          if (!ok) t.state = 'failed';
          active--; report(); pump();
        }
        img.onload = function () { finish(true); };
        img.onerror = function () { finish(false); };
        var sub = ((t.dx + t.dy + attempt) % 4) + 1;
        img.src = 'https://webrd0' + sub + '.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x=' + t.tx + '&y=' + t.ty + '&z=' + z;
      }
      function pump() { while (active < 4 && queue.length) { var t = queue.shift(); active++; load(t, 0); } }
      tiles.retry = function () {
        if (active) return;
        queue = list.filter(function (t) { return t.state !== 'loaded'; });
        queue.forEach(function (t) { t.state = 'pending'; });
        report(); pump();
      };
      if (o.loadTiles === false || location.protocol === 'file:') {
        list.forEach(function (t) { t.state = 'failed'; });
        report();
      } else tiles.retry();
    })();

    // ── 行政区界 ─────────────────────────────────────────────────────────
    var districtGroup = new THREE.Group(); world.add(districtGroup);
    var districtFx = {};
    var districtLineMat = track(new THREE.LineBasicMaterial({ color: COLORS.district, transparent: true, opacity: 0.34 }));
    M.districtsGeo.forEach(function (d) {
      var entry = {
        lines: [], fills: [],
        fillMat: track(new THREE.MeshBasicMaterial({ color: COLORS.accent, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })),
        lineMat: track(new THREE.LineBasicMaterial({ color: COLORS.accent, transparent: true, opacity: 0 }))
      };
      (d.polygons || []).forEach(function (poly) {
        var ring = poly[0]; if (!ring || ring.length < 3) return;
        var step = Math.max(1, Math.floor(ring.length / 220));
        var pts = [], shape = new THREE.Shape();
        for (var i = 0; i < ring.length; i += step) {
          var xz = P(ring[i][0], ring[i][1]);
          pts.push(new THREE.Vector3(xz[0], 0.03, xz[1]));
          if (i === 0) shape.moveTo(xz[0], -xz[1]); else shape.lineTo(xz[0], -xz[1]);
        }
        var lg = track(new THREE.BufferGeometry().setFromPoints(pts));
        districtGroup.add(new THREE.LineLoop(lg, districtLineMat));
        var hi = new THREE.LineLoop(lg, entry.lineMat); hi.position.y = 0.055; hi.visible = false; hi.renderOrder = 4;
        districtGroup.add(hi); entry.lines.push(hi);
        var fg = track(new THREE.ShapeGeometry(shape)); fg.rotateX(-Math.PI / 2);
        var fill = new THREE.Mesh(fg, entry.fillMat); fill.position.y = 0.05; fill.visible = false; fill.renderOrder = 3;
        districtGroup.add(fill); entry.fills.push(fill);
      });
      districtFx[d.name] = entry;
    });

    // ── GLSL 丝绸微澜水系（西湖、钱塘江、京杭大运河） ─────────────────────
    var waterUniforms = {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(COLORS.waterDeep) },
      uShallow: { value: new THREE.Color(COLORS.waterShallow) },
      uSpec: { value: new THREE.Color(COLORS.waterSpec) },
      uFogColor: { value: new THREE.Color(COLORS.fog) },
      uFogNear: { value: 122 },
      uFogFar: { value: 268 }
    };
    var waterMat = track(new THREE.ShaderMaterial({
      uniforms: waterUniforms,
      vertexShader: [
        'varying vec3 vWorld;',
        'varying float vFogDepth;',
        'void main() {',
        '  vec4 wp = modelMatrix * vec4(position, 1.0);',
        '  vWorld = wp.xyz;',
        '  vec4 mv = viewMatrix * wp;',
        '  vFogDepth = -mv.z;',
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform float uTime;',
        'uniform vec3 uDeep;',
        'uniform vec3 uShallow;',
        'uniform vec3 uSpec;',
        'uniform vec3 uFogColor;',
        'uniform float uFogNear;',
        'uniform float uFogFar;',
        'varying vec3 vWorld;',
        'varying float vFogDepth;',
        'void main() {',
        '  float w1 = sin(vWorld.x * 0.55 + uTime * 0.75) * cos(vWorld.z * 0.48 - uTime * 0.55);',
        '  float w2 = sin((vWorld.x + vWorld.z) * 1.15 - uTime * 1.05) * 0.5;',
        '  float w3 = cos(vWorld.x * 2.1 - vWorld.z * 1.8 + uTime * 1.4) * 0.25;',
        '  float wave = clamp((w1 + w2 + w3) * 0.32 + 0.5, 0.0, 1.0);',
        '  vec3 col = mix(uDeep, uShallow, smoothstep(0.18, 0.85, wave));',
        '  float glint = pow(max(0.0, w1 * 0.5 + w2 * 0.55 + 0.12), 4.0);',
        '  col = mix(col, uSpec, glint * 0.36);',
        '  float fogF = smoothstep(uFogNear, uFogFar, vFogDepth);',
        '  col = mix(col, uFogColor, fogF);',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n')
    }));

    var isleMat = track(new THREE.MeshLambertMaterial({ color: COLORS.island }));
    var shoreMat = track(new THREE.LineBasicMaterial({ color: COLORS.shore, transparent: true, opacity: 0.72 }));
    var shoreGlowMat = track(new THREE.LineBasicMaterial({ color: COLORS.shoreGlow, transparent: true, opacity: 0.55 }));

    function buildWaterBody(ring, y, mat, shore) {
      var shape = new THREE.Shape(), pts = [], innerPts = [];
      var cx = 0, cz = 0;
      var proj = ring.map(function (p) { var xz = P(p[0], p[1]); cx += xz[0]; cz += xz[1]; return xz; });
      cx /= proj.length; cz /= proj.length;
      proj.forEach(function (xz, i) {
        if (i) shape.lineTo(xz[0], -xz[1]); else shape.moveTo(xz[0], -xz[1]);
        pts.push(new THREE.Vector3(xz[0], y + 0.012, xz[1]));
        innerPts.push(new THREE.Vector3(xz[0] + (cx - xz[0]) * 0.025, y + 0.014, xz[1] + (cz - xz[1]) * 0.025));
      });
      var geo = track(new THREE.ShapeGeometry(shape, 28)); geo.rotateX(-Math.PI / 2);
      var m = new THREE.Mesh(geo, mat); m.position.y = y; m.receiveShadow = true; world.add(m);
      if (shore) {
        world.add(new THREE.LineLoop(track(new THREE.BufferGeometry().setFromPoints(pts)), shoreMat));
        world.add(new THREE.LineLoop(track(new THREE.BufferGeometry().setFromPoints(innerPts)), shoreGlowMat));
      }
      return m;
    }
    buildWaterBody(GIS.QIANTANG_RIVER_POLYGON, 0.02, waterMat, true);
    buildWaterBody(GIS.WEST_LAKE_OUTER, 0.032, waterMat, true);
    buildWaterBody(GIS.GUSHAN_ISLAND, 0.075, isleMat, false);

    // 三潭印月与湖心亭微缩岛屿点缀
    [[120.1445, 30.2392, 0.24], [120.1469, 30.2468, 0.14], [120.1415, 30.2482, 0.12]].forEach(function (isl) {
      var xz = P(isl[0], isl[1]);
      var ig = track(new THREE.CylinderGeometry(isl[2], isl[2] * 1.25, 0.06, 20));
      var im = new THREE.Mesh(ig, isleMat); im.position.set(xz[0], 0.055, xz[1]);
      world.add(im);
    });

    (GIS.CAUSEWAYS || []).forEach(function (cw) {
      var pts = cw.path.map(function (p) { var xz = P(p[0], p[1]); return new THREE.Vector3(xz[0], 0.082, xz[1]); });
      var curve = new THREE.CatmullRomCurve3(pts);
      world.add(new THREE.Mesh(track(new THREE.TubeGeometry(curve, 32, 0.075, 6, false)), isleMat));
    });
    (function canal() {
      var pts = GIS.GRAND_CANAL_PATH.map(function (p) { var xz = P(p[0], p[1]); return new THREE.Vector3(xz[0], 0.032, xz[1]); });
      var geo = track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, 0.24, 6, false)); geo.scale(1, 0.12, 1);
      world.add(new THREE.Mesh(geo, waterMat));
    })();

    // ── 西湖群山：青瓷叠层等高线台地（逐层渐变色） ──────────────────────
    var mountainMeshes = [];
    var contourMat = track(new THREE.LineBasicMaterial({ color: COLORS.contour, transparent: true, opacity: 0.42 }));
    var mountainBounds = [];
    (GIS.MOUNTAIN_PEAKS || []).forEach(function (pk) {
      var c = P(pk.center[0], pk.center[1]), rx = pk.rx * 370, rz = pk.ry * 427;
      mountainBounds.push({ cx: c[0], cz: c[1], rx: rx * 1.15, rz: rz * 1.15 });
      for (var lv = 0; lv < pk.levels; lv++) {
        var tLv = lv / Math.max(1, pk.levels - 1);
        var ratio = 1 - (lv / pk.levels) * 0.72, h = 0.33, shape = new THREE.Shape();
        for (var s = 0; s <= 40; s++) {
          var a = s / 40 * Math.PI * 2, wob = 1 + 0.11 * Math.sin(a * 3 + lv * 0.8) + 0.07 * Math.cos(a * 2 - lv * 0.4);
          var px = Math.cos(a) * rx * ratio * wob, py = Math.sin(a) * rz * ratio * wob;
          if (s) shape.lineTo(px, py); else shape.moveTo(px, py);
        }
        var geo = track(new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1 }));
        geo.rotateX(-Math.PI / 2);
        var lvMat = track(new THREE.MeshLambertMaterial({
          color: new THREE.Color(COLORS.mountain).lerp(new THREE.Color(COLORS.mountainTop), tLv * 0.85)
        }));
        var mesh = new THREE.Mesh(geo, lvMat);
        mesh.position.set(c[0], lv * h, c[1]); mesh.rotation.y = pk.rot;
        mesh.receiveShadow = true; mesh.castShadow = true;
        vertical.add(mesh);
        mountainMeshes.push({ mat: lvMat, t: tLv });
        var edge = new THREE.LineSegments(track(new THREE.EdgesGeometry(geo, 36)), contourMat);
        edge.position.copy(mesh.position); edge.rotation.copy(mesh.rotation);
        vertical.add(edge);
      }
    });

    // ── 双层描边道路网 + 钱塘江跨江斜拉桥 ───────────────────────────────
    var roadCasingMat = track(new THREE.MeshBasicMaterial({ color: COLORS.roadCasing }));
    var roadMatA = track(new THREE.MeshBasicMaterial({ color: COLORS.roadMain }));
    var roadMatB = track(new THREE.MeshBasicMaterial({ color: COLORS.road }));
    var bridgeMat = track(new THREE.MeshStandardMaterial({ color: COLORS.bridge, roughness: 0.35, metalness: 0.1 }));

    (GIS.ROAD_NETWORK || []).forEach(function (r) {
      var ex = r.tier === 'express';
      var pts = r.path.map(function (p) { var xz = P(p[0], p[1]); return new THREE.Vector3(xz[0], ex ? 0.062 : 0.052, xz[1]); });
      var curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.15);
      if (ex) {
        var cPts = r.path.map(function (p) { var xz = P(p[0], p[1]); return new THREE.Vector3(xz[0], 0.056, xz[1]); });
        var cGeo = track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cPts, false, 'catmullrom', 0.15), 56, 0.155, 5, false));
        cGeo.scale(1, 0.12, 1);
        world.add(new THREE.Mesh(cGeo, roadCasingMat));
      }
      var geo = track(new THREE.TubeGeometry(curve, 56, ex ? 0.105 : 0.068, 5, false));
      geo.scale(1, 0.15, 1);
      world.add(new THREE.Mesh(geo, ex ? roadMatA : roadMatB));
    });

    // 钱塘江代表性跨江大桥（复兴大桥、西兴大桥、庆春东路过江走廊意象索塔）
    [
      [[120.1795, 30.2095], [120.1905, 30.1975]],
      [[120.2075, 30.2335], [120.2215, 30.2195]],
      [[120.2290, 30.2565], [120.2445, 30.2435]]
    ].forEach(function (br) {
      var a = P(br[0][0], br[0][1]), b = P(br[1][0], br[1][1]);
      var p0 = new THREE.Vector3(a[0], 0.16, a[1]), p2 = new THREE.Vector3(b[0], 0.16, b[1]);
      var mid = p0.clone().add(p2).multiplyScalar(0.5); mid.y = 0.42;
      var curve = new THREE.QuadraticBezierCurve3(p0, mid, p2);
      var deck = new THREE.Mesh(track(new THREE.TubeGeometry(curve, 24, 0.12, 6, false)), bridgeMat);
      deck.scale.set(1, 0.35, 1); deck.castShadow = true;
      vertical.add(deck);
      [0.32, 0.68].forEach(function (u) {
        var pt = curve.getPointAt(u);
        var pylon = new THREE.Mesh(track(new THREE.BoxGeometry(0.12, 1.35, 0.12)), bridgeMat);
        pylon.position.set(pt.x, 0.68, pt.z); pylon.castShadow = true;
        vertical.add(pylon);
      });
    });

    // ── 精雕五大杭州城市地标白模 ─────────────────────────────────────────
    var glazeMat = track(new THREE.MeshStandardMaterial({ color: COLORS.landmark, roughness: 0.32, metalness: 0.08 }));
    var lmEdgeMat = track(new THREE.LineBasicMaterial({ color: COLORS.landmarkEdge, transparent: true, opacity: 0.55 }));
    var landmarks = [];
    (GIS.LANDMARKS || []).forEach(function (lm) {
      var xz = P(lm.lngLat[0], lm.lngLat[1]), grp = new THREE.Group(), top = 4;
      grp.position.set(xz[0], 0, xz[1]);
      function addPart(geo, x, y, z, rx, ry, rz, withEdge) {
        track(geo);
        var m = new THREE.Mesh(geo, glazeMat);
        m.position.set(x, y, z);
        if (rx) m.rotation.x = rx;
        if (ry) m.rotation.y = ry;
        if (rz) m.rotation.z = rz;
        m.castShadow = true; m.receiveShadow = true;
        grp.add(m);
        if (withEdge !== false) {
          var eg = new THREE.LineSegments(track(new THREE.EdgesGeometry(geo, 28)), lmEdgeMat);
          eg.position.copy(m.position); eg.rotation.copy(m.rotation);
          grp.add(eg);
        }
        return m;
      }

      if (lm.type === 'civic_ring') {
        // 杭州市民中心：“天圆地方”六座斜切塔楼 + 空中双连廊圆环 + 底座广场盘
        addPart(new THREE.CylinderGeometry(1.75, 1.9, 0.18, 32), 0, 0.09, 0, 0, 0, 0, false);
        var tg = new THREE.TorusGeometry(1.12, 0.22, 14, 36); tg.rotateX(Math.PI / 2);
        addPart(tg, 0, 2.55, 0);
        var tg2 = new THREE.TorusGeometry(0.72, 0.10, 10, 28); tg2.rotateX(Math.PI / 2);
        addPart(tg2, 0, 3.35, 0);
        for (var k = 0; k < 6; k++) {
          var a = k / 6 * Math.PI * 2;
          addPart(new THREE.BoxGeometry(0.34, 3.45, 0.44), Math.cos(a) * 1.02, 1.72, Math.sin(a) * 1.02, 0, -a, 0);
        }
        top = 4.0;
      } else if (lm.type === 'lotus_bowl') {
        // 奥体大莲花：底座玉盘 + 24 片绽放莲花瓣环绕碗体
        addPart(new THREE.CylinderGeometry(2.05, 2.25, 0.16, 36), 0, 0.08, 0, 0, 0, 0, false);
        addPart(new THREE.CylinderGeometry(1.38, 0.92, 0.95, 28, 1, true), 0, 0.56, 0, 0, 0, 0, false);
        for (var p = 0; p < 24; p++) {
          var pa = p / 24 * Math.PI * 2;
          var petal = new THREE.ConeGeometry(0.28, 1.35, 4);
          petal.scale(1, 1, 0.26);
          addPart(petal, Math.cos(pa) * 1.36, 0.78, Math.sin(pa) * 1.36, Math.sin(pa) * 0.42, -pa + Math.PI / 2, -Math.cos(pa) * 0.42, true);
        }
        top = 2.25;
      } else if (lm.type === 'gate_twins') {
        // 杭州之门：H 型双子悬挑曲线门拱超高层
        addPart(new THREE.BoxGeometry(1.85, 0.22, 0.95), 0, 0.11, 0);
        addPart(new THREE.CylinderGeometry(0.26, 0.42, 6.1, 6), -0.56, 3.05, 0, 0, Math.PI / 6, -0.055);
        addPart(new THREE.CylinderGeometry(0.26, 0.42, 6.1, 6), 0.56, 3.05, 0, 0, Math.PI / 6, 0.055);
        var arch = new THREE.TorusGeometry(0.58, 0.13, 10, 24, Math.PI);
        arch.rotateZ(Math.PI);
        addPart(arch, 0, 2.75, 0);
        top = 6.4;
      } else if (lm.type === 'east_station') {
        // 杭州火车东站：流线型巨幅梭形张拉网壳屋盖 + 肋拱格栅
        var dome = new THREE.SphereGeometry(1.65, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.42);
        dome.scale(1.65, 0.52, 1.02);
        addPart(dome, 0, 0.18, 0);
        addPart(new THREE.BoxGeometry(4.8, 0.22, 2.6), 0, 0.11, 0, 0, 0, 0, false);
        top = 1.85;
      } else if (lm.type === 'wulin_spire') {
        // 西湖文化广场环球中心：八角收分阶梯摩天塔楼 + 纤细天线塔尖
        addPart(new THREE.CylinderGeometry(0.58, 0.72, 1.2, 8), 0, 0.6, 0);
        addPart(new THREE.CylinderGeometry(0.36, 0.54, 2.4, 8), 0, 2.4, 0);
        addPart(new THREE.CylinderGeometry(0.16, 0.34, 1.5, 8), 0, 4.35, 0);
        addPart(new THREE.CylinderGeometry(0.025, 0.07, 1.15, 6), 0, 5.65, 0, 0, 0, 0, false);
        top = 6.35;
      }
      vertical.add(grp);
      landmarks.push({ name: lm.name, x: xz[0], z: xz[1], y: top });
    });

    // ── 建筑体块（带底部环境光遮蔽 Vertex AO 与屋顶提亮） ─────────────────
    var buildings = (function () {
      var TOTAL = 1350;
      var geo = track(new THREE.BoxGeometry(1, 1, 1)); geo.translate(0, 0.5, 0);
      var pos = geo.attributes.position, nrm = geo.attributes.normal;
      var vCols = new Float32Array(pos.count * 3);
      function paintBuildingVerts() {
        var cTop = new THREE.Color(COLORS.building), cBot = new THREE.Color(COLORS.buildingBase);
        var tmp = new THREE.Color();
        for (var i = 0; i < pos.count; i++) {
          var py = pos.getY(i), ny = nrm.getY(i);
          var k = ny > 0.5 ? 1.0 : (0.35 + py * 0.65);
          tmp.copy(cBot).lerp(cTop, k);
          vCols[i * 3] = tmp.r; vCols[i * 3 + 1] = tmp.g; vCols[i * 3 + 2] = tmp.b;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(vCols, 3));
        geo.attributes.color.needsUpdate = true;
      }
      paintBuildingVerts();

      var mat = track(new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true }));
      var inst = new THREE.InstancedMesh(geo, mat, TOTAL); inst.castShadow = true; inst.receiveShadow = true;

      function inPoly(lng, lat, poly) {
        var inside = false;
        for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
          if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi + 1e-9) + xi)) inside = !inside;
        }
        return inside;
      }
      var segs = [];
      function collect(ring) { for (var i = 0; i < ring.length - 1; i++) { var a = P(ring[i][0], ring[i][1]), b = P(ring[i + 1][0], ring[i + 1][1]); segs.push([a[0], a[1], b[0], b[1]]); } }
      (GIS.ROAD_NETWORK || []).forEach(function (r) { collect(r.path); });
      (GIS.BUS_LINES || []).forEach(function (l) { collect(l.waypoints); });
      function nearestRoad(px, pz) {
        var best = Infinity, nx = px, nz = pz, sdx = 1, sdz = 0;
        for (var i = 0; i < segs.length; i++) {
          var s = segs[i], dx = s[2] - s[0], dz = s[3] - s[1], L = dx * dx + dz * dz, t = 0;
          if (L > 1e-6) t = Math.max(0, Math.min(1, ((px - s[0]) * dx + (pz - s[1]) * dz) / L));
          var cx = s[0] + t * dx, cz = s[1] + t * dz, d = (px - cx) * (px - cx) + (pz - cz) * (pz - cz);
          if (d < best) { best = d; nx = cx; nz = cz; sdx = dx; sdz = dz; }
        }
        return { dist: Math.sqrt(best), nx: nx, nz: nz, sdx: sdx, sdz: sdz };
      }
      function blocked(px, pz) {
        for (var i = 0; i < mountainBounds.length; i++) { var m = mountainBounds[i], a = (px - m.cx) / m.rx, b = (pz - m.cz) / m.rz; if (a * a + b * b < 1.05) return true; }
        for (var j = 0; j < landmarks.length; j++) if (Math.hypot(px - landmarks[j].x, pz - landmarks[j].z) < 2.0) return true;
        return false;
      }
      function nearHub(px, pz, r) { for (var i = 0; i < M.hubs.length; i++) if (Math.hypot(px - M.hubs[i].x, pz - M.hubs[i].z) < r) return true; return false; }
      var rnd = function (s) { var x = Math.sin(s * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
      var dummy = new THREE.Object3D(), count = 0, seed = 1;
      (GIS.REAL_BUILDINGS || []).forEach(function (rb, idx) {
        if (count >= TOTAL) return;
        var lng = rb.lngLat[0], lat = rb.lngLat[1];
        if (inPoly(lng, lat, GIS.WEST_LAKE_OUTER) || inPoly(lng, lat, GIS.QIANTANG_RIVER_POLYGON)) return;
        var xz = P(lng, lat), bx = xz[0], bz = xz[1];
        if (blocked(bx, bz)) return;
        var w = rb.isTower ? 0.28 + rnd(idx * 5 + 1) * 0.2 : 0.3 + rnd(idx * 5 + 2) * 0.22;
        var d = rb.isTower ? 0.28 + rnd(idx * 5 + 3) * 0.2 : 0.26 + rnd(idx * 5 + 4) * 0.2;
        var clear = 0.42 + Math.hypot(w, d) * 0.5, rd = nearestRoad(bx, bz);
        if (rd.dist < clear) {
          var vx = bx - rd.nx, vz = bz - rd.nz, vl = Math.hypot(vx, vz);
          if (vl < 1e-3) { var sl = Math.hypot(rd.sdx, rd.sdz) || 1, sg = idx % 2 ? -1 : 1; vx = -rd.sdz / sl * sg; vz = rd.sdx / sl * sg; }
          else { vx /= vl; vz /= vl; }
          bx = rd.nx + vx * clear; bz = rd.nz + vz * clear;
        }
        if (nearHub(bx, bz, 0.58)) return;
        dummy.position.set(bx, 0, bz); dummy.scale.set(w, Math.max(0.45, (rb.h || 2.5) * 0.42), d);
        dummy.rotation.y = idx % 5 === 0 ? Math.PI / 6 : 0; dummy.updateMatrix();
        inst.setMatrixAt(count++, dummy.matrix);
      });
      (GIS.URBAN_CLUSTERS || []).forEach(function (cl) {
        var placed = 0, tries = 0, target = Math.floor(cl.count * 0.52);
        while (placed < target && count < TOTAL && tries < target * 4) {
          tries++; seed++;
          var r = Math.sqrt(rnd(seed * 3)) * cl.radius, ang = rnd(seed * 7) * Math.PI * 2;
          var lng = cl.center[0] + Math.cos(ang) * r * 1.15, lat = cl.center[1] + Math.sin(ang) * r * 0.85;
          if (inPoly(lng, lat, GIS.WEST_LAKE_OUTER) || inPoly(lng, lat, GIS.QIANTANG_RIVER_POLYGON)) continue;
          var xz = P(lng, lat);
          if (blocked(xz[0], xz[1])) continue;
          var ratio = 1 - (r / cl.radius) * 0.65, w = 0.26 + rnd(seed * 11) * 0.32, d = 0.26 + rnd(seed * 13) * 0.32;
          if (nearestRoad(xz[0], xz[1]).dist < 0.46 + Math.hypot(w, d) * 0.5) continue;
          if (nearHub(xz[0], xz[1], 0.65)) continue;
          dummy.position.set(xz[0], 0, xz[1]);
          dummy.scale.set(w, Math.max(0.35, Math.pow(rnd(seed * 17), 1.9) * cl.maxH * ratio * 0.29), d);
          dummy.rotation.y = rnd(seed * 19) > 0.75 ? Math.PI / 4 : 0; dummy.updateMatrix();
          inst.setMatrixAt(count++, dummy.matrix); placed++;
        }
      });
      inst.count = count; inst.instanceMatrix.needsUpdate = true;
      vertical.add(inst);
      return { mesh: inst, mat: mat, count: count, repaint: paintBuildingVerts };
    })();

    // ── 公交线路、沿线站点与精致双色示意车辆 ──────────────────────────────
    var lineGroup = new THREE.Group(); world.add(lineGroup);
    var busGroup = new THREE.Group(); world.add(busGroup);
    var stopGroup = new THREE.Group(); world.add(stopGroup);
    var lineFx = {}, buses = [];
    var stopGeo = track(new THREE.CylinderGeometry(0.085, 0.085, 0.055, 12));
    var busBody = track(new THREE.BoxGeometry(0.21, 0.14, 0.48)), busRoof = track(new THREE.BoxGeometry(0.18, 0.04, 0.40));
    var busBodyMat = track(new THREE.MeshLambertMaterial({ color: 0xffffff }));
    M.lines.forEach(function (line, li) {
      var y = 0.15 + li * 0.006;
      var pts = line.waypoints.map(function (p) { var xz = P(p[0], p[1]); return new THREE.Vector3(xz[0], y, xz[1]); });
      var curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.12);
      var mat = track(new THREE.MeshBasicMaterial({ color: line.color, transparent: true, opacity: 0.9 }));
      var mesh = new THREE.Mesh(track(new THREE.TubeGeometry(curve, Math.min(260, Math.max(100, pts.length)), 0.068, 6, false)), mat);
      lineGroup.add(mesh);
      var stopMat = track(new THREE.MeshBasicMaterial({ color: line.color }));
      var stopMeshes = line.stops.map(function (s) {
        var xz = P(s.lngLat[0], s.lngLat[1]); var m = new THREE.Mesh(stopGeo, stopMat); m.position.set(xz[0], y + 0.025, xz[1]); m.visible = false; stopGroup.add(m); return m;
      });
      var roofMat = track(new THREE.MeshBasicMaterial({ color: line.color }));
      for (var k = 0; k < 3; k++) {
        var bus = new THREE.Group();
        var b = new THREE.Mesh(busBody, busBodyMat); b.position.y = 0.1; b.castShadow = true; bus.add(b);
        var r = new THREE.Mesh(busRoof, roofMat); r.position.y = 0.19; bus.add(r);
        busGroup.add(bus);
        buses.push({ line: line.id, curve: curve, mesh: bus, t: (k / 3 + li * 0.07) % 1, dir: k % 2 ? -1 : 1, lane: k % 2 ? -0.09 : 0.09 });
      }
      lineFx[line.id] = { mesh: mesh, mat: mat, stopMat: stopMat, roofMat: roofMat, curve: curve, stops: stopMeshes, samples: curve.getPoints(140), y: y, idx: li };
    });

    // ── 32 个核心枢纽：双环罗盘潮位标尺 ──────────────────────────────────
    var hubGroup = new THREE.Group(); world.add(hubGroup);
    var hubFx = {}, hubProxies = [];
    var hubRingGeo = track(new THREE.RingGeometry(0.32, 0.42, 40)); hubRingGeo.rotateX(-Math.PI / 2);
    var hubInnerGeo = track(new THREE.RingGeometry(0.14, 0.20, 28)); hubInnerGeo.rotateX(-Math.PI / 2);
    var hubStaffGeo = track(new THREE.CylinderGeometry(0.028, 0.028, 1, 8)); hubStaffGeo.translate(0, 0.5, 0);
    var hubCapGeo = track(new THREE.OctahedronGeometry(0.13, 0));
    var hubProxyGeo = track(new THREE.CylinderGeometry(0.56, 0.56, 2.3, 8)); hubProxyGeo.translate(0, 1.15, 0);
    var proxyMat = track(new THREE.MeshBasicMaterial({ visible: false }));
    M.hubs.forEach(function (h) {
      var mat = track(new THREE.MeshBasicMaterial({ color: COLORS.accent, transparent: true, opacity: 0.88 }));
      var capMat = track(new THREE.MeshBasicMaterial({ color: COLORS.seal, transparent: true, opacity: 0.95 }));
      var ring = new THREE.Mesh(hubRingGeo, mat); ring.position.set(h.x, 0.17, h.z);
      var inner = new THREE.Mesh(hubInnerGeo, capMat); inner.position.set(h.x, 0.175, h.z);
      var staff = new THREE.Mesh(hubStaffGeo, mat); staff.position.set(h.x, 0.17, h.z); staff.scale.y = 1.52;
      var cap = new THREE.Mesh(hubCapGeo, capMat); cap.position.set(h.x, 1.72, h.z);
      var proxy = new THREE.Mesh(hubProxyGeo, proxyMat); proxy.position.set(h.x, 0, h.z); proxy.userData.hubId = h.id;
      hubGroup.add(ring, inner, staff, cap, proxy); hubProxies.push(proxy);
      hubFx[h.id] = { ring: ring, inner: inner, staff: staff, cap: cap, mat: mat, capMat: capMat };
    });

    // ── 12 处多线路公交交汇黄金广告路口地标与 500m 覆盖圈 ────────────────
    var adGroup = new THREE.Group(); world.add(adGroup);
    var adFx = {}, adProxies = [];
    var adBaseGeo = track(new THREE.RingGeometry(0.46, 0.58, 6)); adBaseGeo.rotateX(-Math.PI / 2);
    var adHaloGeo = track(new THREE.CircleGeometry(0.82, 32)); adHaloGeo.rotateX(-Math.PI / 2);
    var adStemGeo = track(new THREE.CylinderGeometry(0.032, 0.032, 1, 8)); adStemGeo.translate(0, 0.5, 0);
    var adPrismGeo = track(new THREE.OctahedronGeometry(0.20, 0));
    var adProxyGeo = track(new THREE.CylinderGeometry(0.68, 0.68, 2.7, 8)); adProxyGeo.translate(0, 1.35, 0);
    (M.adSpots || []).forEach(function (ad) {
      var isS = ad.tier === 'S';
      var goldHex = isS ? 0xd89228 : 0x2682a6;
      var ringMat = track(new THREE.MeshBasicMaterial({ color: goldHex, transparent: true, opacity: 0.94, depthWrite: false }));
      var haloMat = track(new THREE.MeshBasicMaterial({ color: goldHex, transparent: true, opacity: isS ? 0.18 : 0.12, depthWrite: false }));
      var prismMat = track(new THREE.MeshBasicMaterial({ color: isS ? 0xffb84d : COLORS.seal, transparent: true, opacity: 0.96 }));
      var base = new THREE.Mesh(adBaseGeo, ringMat); base.position.set(ad.x, 0.19, ad.z); base.rotation.y = Math.PI / 4;
      var halo = new THREE.Mesh(adHaloGeo, haloMat); halo.position.set(ad.x, 0.165, ad.z);
      var stem = new THREE.Mesh(adStemGeo, ringMat); stem.position.set(ad.x, 0.19, ad.z); stem.scale.y = isS ? 2.15 : 1.78;
      var prism = new THREE.Mesh(adPrismGeo, prismMat); prism.position.set(ad.x, 0.22 + stem.scale.y, ad.z);
      if (isS) prism.scale.set(1.18, 1.32, 1.18);
      var proxy = new THREE.Mesh(adProxyGeo, proxyMat); proxy.position.set(ad.x, 0, ad.z); proxy.userData.adId = ad.id;
      adGroup.add(halo, base, stem, prism, proxy);
      adProxies.push(proxy);
      adFx[ad.id] = { base: base, halo: halo, stem: stem, prism: prism, ringMat: ringMat, haloMat: haloMat, prismMat: prismMat, isS: isS, baseY: 0.22 + stem.scale.y };
    });

    // 500m 局部步程辐射圈（选中站点 / 枢纽 / 黄金广告口或悬停广告口时显现）
    var catchR = M.catchmentRadius || 1.92;
    var catchGroup = new THREE.Group(); catchGroup.visible = false; catchGroup.renderOrder = 16; world.add(catchGroup);
    var catchFillMat = track(new THREE.MeshBasicMaterial({ color: COLORS.seal, transparent: true, opacity: 0.085, depthWrite: false, side: THREE.DoubleSide }));
    var catchEdgeMat = track(new THREE.MeshBasicMaterial({ color: COLORS.seal, transparent: true, opacity: 0.78, depthWrite: false }));
    var catchInnerMat = track(new THREE.MeshBasicMaterial({ color: COLORS.accent, transparent: true, opacity: 0.36, depthWrite: false }));
    var catchFill = new THREE.Mesh(track(new THREE.CircleGeometry(catchR, 64)), catchFillMat); catchFill.geometry.rotateX(-Math.PI / 2); catchFill.position.y = 0.13;
    var catchEdge = new THREE.Mesh(track(new THREE.RingGeometry(catchR - 0.045, catchR, 72)), catchEdgeMat); catchEdge.geometry.rotateX(-Math.PI / 2); catchEdge.position.y = 0.145;
    var catchMid = new THREE.Mesh(track(new THREE.RingGeometry(catchR * 0.5 - 0.022, catchR * 0.5, 56)), catchInnerMat); catchMid.geometry.rotateX(-Math.PI / 2); catchMid.position.y = 0.14;
    catchGroup.add(catchFill, catchEdge, catchMid);

    // ── 全局核密度热力场（512×512 高斯核辐射平滑色带层） ──────────────────
    var heatField = (function buildHeatField() {
      var minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (var i = 0; i < M.cloud.length; i++) {
        var c = M.cloud[i];
        if (c.x < minX) minX = c.x; if (c.x > maxX) maxX = c.x;
        if (c.z < minZ) minZ = c.z; if (c.z > maxZ) maxZ = c.z;
      }
      var pad = 8;
      minX -= pad; maxX += pad; minZ -= pad; maxZ += pad;
      var spanX = maxX - minX, spanZ = maxZ - minZ;
      var W = 512, H = 512;
      var grid = new Float32Array(W * H);
      var outC = document.createElement('canvas'); outC.width = W; outC.height = H;
      var octx = outC.getContext('2d');

      // 256 阶平滑热力色谱表（深海蓝 → 电光青 → 翡翠绿 → 琥珀金 → 炽金核，配合 AdditiveBlending 透出底图路网）
      var lut = new Uint8ClampedArray(256 * 4);
      var stops = [
        [0.00, [0, 0, 0, 0]],
        [0.07, [10, 54, 112, 74]],
        [0.22, [16, 120, 188, 136]],
        [0.44, [24, 198, 226, 180]],
        [0.66, [92, 236, 176, 210]],
        [0.85, [255, 174, 52, 235]],
        [1.00, [255, 244, 196, 248]]
      ];
      for (var v = 0; v < 256; v++) {
        var t = v / 255, s0 = stops[0], s1 = stops[stops.length - 1];
        for (var si = 0; si < stops.length - 1; si++) {
          if (t >= stops[si][0] && t <= stops[si + 1][0]) { s0 = stops[si]; s1 = stops[si + 1]; break; }
        }
        var f = (t - s0[0]) / Math.max(1e-5, s1[0] - s0[0]);
        lut[v * 4] = Math.round(s0[1][0] + (s1[1][0] - s0[1][0]) * f);
        lut[v * 4 + 1] = Math.round(s0[1][1] + (s1[1][1] - s0[1][1]) * f);
        lut[v * 4 + 2] = Math.round(s0[1][2] + (s1[1][2] - s0[1][2]) * f);
        lut[v * 4 + 3] = Math.round(s0[1][3] + (s1[1][3] - s0[1][3]) * f);
      }

      var tex = track(new THREE.CanvasTexture(outC));
      tex.colorSpace = THREE.SRGBColorSpace;
      var mat = track(new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      }));
      var geo = track(new THREE.PlaneGeometry(spanX, spanZ)); geo.rotateX(-Math.PI / 2);
      var mesh = new THREE.Mesh(geo, mat);
      mesh.position.set((minX + maxX) / 2, 0.095, (minZ + maxZ) / 2);
      mesh.visible = false;
      mesh.renderOrder = 5;
      world.add(mesh);

      var dirty = true;
      function redraw(vals, dimArr) {
        grid.fill(0);
        var scaleX = W / spanX, scaleZ = H / spanZ;
        for (var j = 0; j < M.cloud.length; j++) {
          var v2 = vals[j];
          if (!(v2 === v2) || v2 <= 0 || dimArr[j]) continue;
          var st = M.cloud[j];
          var cx = (st.x - minX) * scaleX;
          var cz = (st.z - minZ) * scaleZ;
          // 物理核半径约 520m ~ 880m（1.98 ~ 3.35 世界单位），避免全城糊成一片
          var worldR = 1.98 + Math.min(1.37, Math.sqrt(v2) * 0.088);
          var rx = worldR * scaleX, rz = worldR * scaleZ;
          var invRx2 = 1 / Math.max(1, rx * rx), invRz2 = 1 / Math.max(1, rz * rz);
          var weight = Math.pow(v2, 0.72) * (1 + Math.min(0.46, (st.routes || 0) * 0.022));

          var x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(W - 1, Math.ceil(cx + rx));
          var z0 = Math.max(0, Math.floor(cz - rz)), z1 = Math.min(H - 1, Math.ceil(cz + rz));
          for (var gz = z0; gz <= z1; gz++) {
            var dz2 = (gz - cz) * (gz - cz) * invRz2;
            if (dz2 >= 1) continue;
            var rowOff = gz * W;
            for (var gx = x0; gx <= x1; gx++) {
              var d2 = (gx - cx) * (gx - cx) * invRx2 + dz2;
              if (d2 >= 1) continue;
              // 平滑紧支集近似高斯核 (1 - d^2)^2 * exp(-1.85 * d^2)，边缘零截断伪影
              var omt = 1 - d2;
              grid[rowOff + gx] += weight * omt * omt * Math.exp(-1.85 * d2);
            }
          }
        }

        var maxAcc = 0;
        for (var k = 0, totalPx = W * H; k < totalPx; k++) {
          if (grid[k] > maxAcc) maxAcc = grid[k];
        }
        // 设定最低参考峰值下限，防止凌晨极低客流时零星站点过曝成炽白色
        var denom = Math.max(maxAcc * 0.90, 26);
        var dstImg = octx.createImageData(W, H), dst = dstImg.data;
        for (var m = 0; m < W * H; m++) {
          var gVal = grid[m];
          if (gVal <= 0) continue;
          var u = gVal / denom;
          if (u < 0.018) continue;
          var shaped = Math.pow(u > 1 ? 1 : u, 1.28);
          var li = Math.min(255, Math.round(shaped * 255)) * 4;
          var p = m * 4;
          dst[p] = lut[li];
          dst[p + 1] = lut[li + 1];
          dst[p + 2] = lut[li + 2];
          dst[p + 3] = lut[li + 3];
        }
        octx.putImageData(dstImg, 0, 0);
        tex.needsUpdate = true;
        dirty = false;
      }

      return { mesh: mesh, mat: mat, redraw: redraw, markDirty: function () { dirty = true; }, isDirty: function () { return dirty; } };
    })();

    // ── 1,800 站客流潮位柱 + 晶莹顶冠盖片 ───────────────────────────────
    var N = M.cloud.length;
    var cloudGeo = track(new THREE.BoxGeometry(0.185, 1, 0.185)); cloudGeo.translate(0, 0.5, 0);
    (function shadeFaces() {
      var pos = cloudGeo.attributes.position, n = cloudGeo.attributes.normal, col = new Float32Array(n.count * 3);
      for (var i = 0; i < n.count; i++) {
        var nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i), py = pos.getY(i);
        var vGrad = 0.78 + py * 0.26;
        var face = ny > 0.5 ? 1.14 : ny < -0.5 ? 0.55 : Math.abs(nx) > 0.5 ? (nx > 0 ? 0.82 : 0.94) : (nz > 0 ? 0.98 : 0.76);
        var k = Math.min(1.0, face * (ny > 0.5 ? 1.0 : vGrad));
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
      }
      cloudGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    })();
    var cloudMat = track(new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true }));
    var cloud = new THREE.InstancedMesh(cloudGeo, cloudMat, N);
    cloud.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    cloud.frustumCulled = false;
    vertical.add(cloud);

    // 柱顶晶冠薄片：让每根潮位柱顶端如釉瓷切面般清晰可辨
    var crownGeo = track(new THREE.BoxGeometry(0.192, 0.045, 0.192));
    var crownMat = track(new THREE.MeshBasicMaterial({ color: COLORS.crown, transparent: true, opacity: 0.78 }));
    var crowns = new THREE.InstancedMesh(crownGeo, crownMat, N);
    crowns.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    crowns.frustumCulled = false;
    vertical.add(crowns);

    var curH = new Float32Array(N), tgtH = new Float32Array(N), widths = new Float32Array(N).fill(1);
    var values = new Float32Array(N).fill(NaN), dimmed = new Uint8Array(N);
    var heatColors = M.heat.colors.map(function (c) { return new THREE.Color(c); });
    var glaze = new THREE.Color(COLORS.glaze), tmpC = new THREE.Color();
    var cloudSettled = false;
    (function initCloud() {
      var a = cloud.instanceMatrix.array, ca = crowns.instanceMatrix.array;
      for (var i = 0; i < N; i++) {
        var o16 = i * 16;
        a[o16] = 0; a[o16 + 5] = 0; a[o16 + 10] = 0; a[o16 + 15] = 1;
        a[o16 + 12] = M.cloud[i].x; a[o16 + 13] = 0.02; a[o16 + 14] = M.cloud[i].z;
        ca[o16] = 0; ca[o16 + 5] = 0; ca[o16 + 10] = 0; ca[o16 + 15] = 1;
        ca[o16 + 12] = M.cloud[i].x; ca[o16 + 13] = 0.02; ca[o16 + 14] = M.cloud[i].z;
        cloud.setColorAt(i, heatColors[0]);
      }
      cloud.instanceMatrix.needsUpdate = true; cloud.instanceColor.needsUpdate = true;
      crowns.instanceMatrix.needsUpdate = true;
    })();
    function heightOf(v) {
      if (!(v === v)) return 0;
      if (v <= 0) return 0.05;
      return Math.min(6.6, 0.16 + Math.sqrt(v) * 0.29);
    }
    function paintCloud() {
      var thermalMode = !!(g.HZ_PALETTE && g.HZ_PALETTE.thermal);
      cloudMat.transparent = thermalMode;
      cloudMat.opacity = thermalMode ? 0.88 : 1.0;
      crownMat.opacity = thermalMode ? 0.96 : 0.78;
      var wScale = thermalMode ? 0.76 : 1.0;
      for (var i = 0; i < N; i++) {
        var v = values[i];
        var cls = v === v ? M.heat.classOf(v) : 0;
        tmpC.copy(heatColors[cls]);
        if (dimmed[i]) tmpC.lerp(glaze, 0.68);
        cloud.setColorAt(i, tmpC);
        widths[i] = (v === v ? 0.85 + Math.min(1, cls / 4) * 0.48 : 1) * wScale;
      }
      cloud.instanceColor.needsUpdate = true;
    }
    function writeCloudMatrices() {
      var a = cloud.instanceMatrix.array, ca = crowns.instanceMatrix.array;
      for (var i = 0; i < N; i++) {
        var o16 = i * 16, h = curH[i], show = h > 0.002 && !dimmed[i];
        var w = h > 0.001 ? widths[i] : 0;
        a[o16] = w; a[o16 + 5] = h > 0.001 ? h : 0; a[o16 + 10] = w;
        ca[o16] = show ? w : 0;
        ca[o16 + 5] = show ? 1 : 0;
        ca[o16 + 10] = show ? w : 0;
        ca[o16 + 13] = 0.02 + h + 0.022;
      }
      cloud.instanceMatrix.needsUpdate = true;
      crowns.instanceMatrix.needsUpdate = true;
    }
    function setCloud(vals, opt) {
      for (var i = 0; i < N; i++) { values[i] = vals[i]; tgtH[i] = heightOf(vals[i]); }
      paintCloud();
      rankValues();
      heatField.markDirty();
      if (layerOn.heatmap) heatField.redraw(values, dimmed);
      if ((opt && opt.instant) || reduced()) { curH.set(tgtH); writeCloudMatrices(); cloudSettled = true; cloud.computeBoundingSphere(); }
      else cloudSettled = false;
    }
    function stepCloud(dt) {
      if (cloudSettled) return;
      var k = 1 - Math.exp(-dt * 10.5), moving = false;
      for (var i = 0; i < N; i++) {
        var d = tgtH[i] - curH[i];
        if (Math.abs(d) > 0.004) { curH[i] += d * k; moving = true; } else curH[i] = tgtH[i];
      }
      writeCloudMatrices();
      if (!moving) { cloudSettled = true; cloud.computeBoundingSphere(); }
    }

    // ── 选中与悬停标记 ───────────────────────────────────────────────────
    var sealMat = track(new THREE.MeshBasicMaterial({ color: COLORS.seal, transparent: true, opacity: 0.96, depthTest: false }));
    var selPulseMat = track(new THREE.MeshBasicMaterial({ color: COLORS.seal, transparent: true, opacity: 0, depthTest: false }));
    var selStaffMat = track(new THREE.MeshBasicMaterial({ color: COLORS.seal }));
    var selGroup = new THREE.Group(); selGroup.visible = false; selGroup.renderOrder = 20; world.add(selGroup);
    var selRingGeo = track(new THREE.RingGeometry(0.62, 0.78, 56)); selRingGeo.rotateX(-Math.PI / 2);
    var selRing = new THREE.Mesh(selRingGeo, sealMat); selRing.position.y = 0.22; selRing.renderOrder = 20;
    var selPulse = new THREE.Mesh(selRingGeo, selPulseMat); selPulse.position.y = 0.21; selPulse.renderOrder = 19;
    var selStaff = new THREE.Mesh(track(new THREE.CylinderGeometry(0.036, 0.036, 1, 8)), selStaffMat);
    selStaff.geometry.translate(0, 0.5, 0);
    selGroup.add(selRing, selPulse, selStaff);
    var selection = null, selPulseT = 1;

    var hoverMat = track(new THREE.MeshBasicMaterial({ color: COLORS.accent, transparent: true, opacity: 0.9, depthTest: false }));
    var hoverRing = new THREE.Mesh(track(new THREE.RingGeometry(0.44, 0.56, 44)), hoverMat);
    hoverRing.geometry.rotateX(-Math.PI / 2); hoverRing.visible = false; hoverRing.renderOrder = 18; world.add(hoverRing);

    // ── 关联示意线（引力模型，非实测 OD） ───────────────────────────────────
    var arcGroup = new THREE.Group(); arcGroup.visible = false; world.add(arcGroup);
    var arcDots = [];
    var arcMat = track(new THREE.MeshBasicMaterial({ color: COLORS.accent, transparent: true, opacity: 0.48 }));
    var dotGeo = track(new THREE.SphereGeometry(0.15, 12, 10)), dotMat = track(new THREE.MeshBasicMaterial({ color: COLORS.seal }));
    var GIS_STATIONS = {}; (GIS.STATIONS || []).forEach(function (s) { GIS_STATIONS[s.id] = s; });
    function clearArcs() {
      while (arcGroup.children.length) { var c = arcGroup.children.pop(); if (c.geometry && c.geometry !== dotGeo) c.geometry.dispose(); }
      arcDots.length = 0;
    }
    function buildArcs(hubId) {
      clearArcs();
      var origin = hubId && M.hubById[hubId]; if (!origin) return;
      var ob = (GIS_STATIONS[origin.id] || {}).baseBoard || 1;
      M.hubs.filter(function (h) { return h.id !== origin.id; }).map(function (h) {
        var d = Math.hypot(h.x - origin.x, h.z - origin.z);
        return { h: h, score: (((GIS_STATIONS[h.id] || {}).baseBoard || 1) + ob) / (d * 0.35 + 4) };
      }).sort(function (a, b) { return b.score - a.score; }).slice(0, 6).forEach(function (it, i) {
        var p0 = new THREE.Vector3(origin.x, 0.4, origin.z), p2 = new THREE.Vector3(it.h.x, 0.4, it.h.z);
        var mid = p0.clone().add(p2).multiplyScalar(0.5); mid.y = Math.min(14, 3.6 + p0.distanceTo(p2) * 0.25);
        var curve = new THREE.QuadraticBezierCurve3(p0, mid, p2);
        arcGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 44, 0.045, 6, false), arcMat));
        var dot = new THREE.Mesh(dotGeo, dotMat); arcGroup.add(dot);
        arcDots.push({ curve: curve, dot: dot, t: i * 0.17 % 1 });
      });
    }

    // ── 屏幕标注（DOM） ──────────────────────────────────────────────────
    var labels = [];
    function addLabel(text, x, y, z, cls, prio, data) {
      var el = document.createElement('div'); el.className = 'lbl ' + cls; el.textContent = text;
      labelsEl.appendChild(el);
      var L = { el: el, x: x, y: y, z: z, cls: cls, prio: prio, w: 0, h: 0, on: true, data: data || null, shown: false };
      labels.push(L); return L;
    }
    M.regions.forEach(function (r) { var xz = P(r.labelLngLat[0], r.labelLngLat[1]); addLabel(r.name, xz[0], r.height * 0.6, xz[1], 'lbl-region', 3 + (r.priority || 0) * 0.1, { group: 'regions' }); });
    landmarks.forEach(function (l) { addLabel(l.name, l.x, l.y + 0.45, l.z, 'lbl-landmark', 6, { group: 'regions' }); });
    M.hubs.filter(function (h) { return h.major; }).forEach(function (h) { addLabel(h.short, h.x, 1.95, h.z, 'lbl-hub', 5, { group: 'hubs', hubId: h.id }); });
    (M.adSpots || []).forEach(function (ad, ai) {
      var L = addLabel('', ad.x, ad.tier === 'S' ? 2.62 : 2.18, ad.z, 'lbl-ad lbl-ad-' + ad.tier.toLowerCase(), (ad.tier === 'S' ? 2.1 : 4.6) + ai * 0.02, { group: 'adSpots', adId: ad.id, tier: ad.tier });
      L.el.innerHTML = '<i>' + ad.tier + '</i><span>' + ad.short + '</span>';
    });
    var selLabel = addLabel('', 0, 0, 0, 'lbl-selected', -10, { group: 'selection' }); selLabel.on = false;
    var valueLabels = [];
    for (var vl = 0; vl < 12; vl++) { var VL = addLabel('', 0, 0, 0, 'lbl-value', 4 + vl * 0.01, { group: 'values' }); VL.on = false; VL.idx = -1; valueLabels.push(VL); }
    var ranked = [], lastValuePick = 0;
    function rankValues() {
      ranked = [];
      for (var i = 0; i < N; i++) if (values[i] === values[i] && values[i] > 0) ranked.push(i);
      ranked.sort(function (a, b) { return values[b] - values[a]; });
      ranked = ranked.slice(0, 160);
      lastValuePick = 0;
    }
    function pickValueLabels(now) {
      if (now - lastValuePick < 320) return; lastValuePick = now;
      var w = container.clientWidth, h = container.clientHeight, want = cur.radius < 50 ? 12 : cur.radius < 78 ? 8 : 6, used = 0;
      var show = layerOn.cloud && morph > 0.6 && !mode2D;
      for (var k = 0; k < ranked.length && used < want && show; k++) {
        var i = ranked[k]; if (dimmed[i]) continue;
        if (selection && selection.kind === 'cloud' && selection.idx === i) continue;
        var c = M.cloud[i], sp = toScreen(c.x, tgtH[i] * morph, c.z);
        if (sp.z > 1 || sp.x < 40 || sp.x > w - 40 || sp.y < 60 || sp.y > h - 60) continue;
        var L = valueLabels[used++];
        if (L.idx !== i) {
          L.idx = i;
          L.el.innerHTML = '<b>' + Math.round(values[i]).toLocaleString('zh-CN') + '</b>' + (cur.radius < 65 ? '<span>' + c.name.replace(/[（(].*?[）)]/g, '') + '</span>' : '');
          L.w = 0;
        }
        L.x = c.x; L.z = c.z; L.on = true;
      }
      for (var r = used; r < valueLabels.length; r++) valueLabels[r].on = false;
    }
    var stopLabels = [];
    function measureLabels() { labels.forEach(function (L) { L.w = L.el.offsetWidth; L.h = L.el.offsetHeight; }); }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureLabels);

    // ── 镜头 ─────────────────────────────────────────────────────────────
    var PRESETS = {
      overview: { theta: 0.30, phi: 0.87, radius: 96, target: [3, 0, -1] },
      westlake: { theta: -0.28, phi: 0.81, radius: 29, target: P(120.148, 30.248) },
      qianjiang: { theta: 0.52, phi: 0.83, radius: 33, target: P(120.218, 30.242) },
      east_hub: { theta: -0.30, phi: 0.83, radius: 35, target: P(120.195, 30.291) }
    };
    function presetState(p) { var t = p.target; return { theta: p.theta, phi: p.phi, radius: p.radius, tx: t[0], ty: t.length === 3 ? t[1] : 0, tz: t.length === 3 ? t[2] : t[1] }; }
    var cur = presetState(PRESETS.overview), goal = Object.assign({}, cur), tween = null;
    var mode2D = false, morph = 1, morphGoal = 1, saved3D = null;
    var inset = { right: 0, bottom: 0, left: 0, top: 0 }, insetCur = { right: 0, bottom: 0, left: 0, top: 0 };
    var PHI_MIN = 0.16, PHI_MAX = 1.3, R_MIN = 12, R_MAX = 160;
    function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    function nearestAngle(from, to) { var d = ((to - from) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI; return from + d; }
    function flyTo(to, dur) {
      var dest = Object.assign({}, cur, to);
      dest.theta = nearestAngle(cur.theta, dest.theta);
      if (mode2D) { dest.phi = 0.02; dest.theta = nearestAngle(cur.theta, 0); }
      dest.radius = Math.max(R_MIN, Math.min(R_MAX, dest.radius));
      if (dur === undefined) dur = 950;
      if (reduced() || dur <= 0) { tween = null; cur = dest; goal = Object.assign({}, dest); return; }
      tween = { from: Object.assign({}, cur), to: dest, t0: performance.now(), dur: dur };
      goal = Object.assign({}, dest);
    }
    function stopTween() { if (tween) { tween = null; goal = Object.assign({}, cur); } }
    function flyPreset(name) { var p = PRESETS[name]; if (p) flyTo(presetState(p)); }
    function flyToPoint(x, z, radius) {
      flyTo({ tx: x, ty: mode2D ? 0 : 1.4, tz: z, radius: radius || 31, phi: mode2D ? 0.02 : Math.min(Math.max(cur.phi, 0.74), 0.94) });
    }
    function flyToBounds(pts) {
      if (!pts.length) return;
      var xs = pts.map(function (p) { return p.x; }).sort(function (a, b) { return a - b; });
      var zs = pts.map(function (p) { return p.z; }).sort(function (a, b) { return a - b; });
      var cut = pts.length > 20 ? Math.floor(pts.length * 0.05) : 0;
      var minX = xs[cut], maxX = xs[xs.length - 1 - cut], minZ = zs[cut], maxZ = zs[zs.length - 1 - cut];
      var span = Math.max(maxX - minX, (maxZ - minZ) * 1.3);
      flyTo({ tx: (minX + maxX) / 2, ty: 0, tz: (minZ + maxZ) / 2, radius: Math.max(26, Math.min(86, span * 1.15 + 14)), phi: mode2D ? 0.02 : 0.85 });
    }
    function applyCamera() {
      var w = container.clientWidth || 1, h = container.clientHeight || 1;
      camera.aspect = w / h;
      var ox = (insetCur.right - insetCur.left) / 2, oy = (insetCur.bottom - insetCur.top) / 2;
      if (Math.abs(ox) > 0.5 || Math.abs(oy) > 0.5) camera.setViewOffset(w, h, ox, oy, w, h); else camera.clearViewOffset();
      camera.updateProjectionMatrix();
      var sp = Math.sin(cur.phi);
      camera.position.set(cur.tx + cur.radius * sp * Math.sin(cur.theta), cur.ty + cur.radius * Math.cos(cur.phi), cur.tz + cur.radius * sp * Math.cos(cur.theta));
      camera.lookAt(cur.tx, cur.ty, cur.tz);
      camera.updateMatrixWorld(true);
    }
    function setMode2D(on) {
      if (on === mode2D) return;
      if (on) {
        saved3D = { theta: goal.theta, phi: goal.phi, radius: goal.radius };
        mode2D = true; morphGoal = 0;
        flyTo({ theta: 0, phi: 0.02, radius: Math.min(cur.radius, 76) });
      } else {
        mode2D = false; morphGoal = 1;
        var s = saved3D || { theta: 0.3, phi: 0.87, radius: 96 };
        flyTo({ theta: s.theta, phi: Math.max(0.7, s.phi), radius: s.radius });
      }
      if (reduced()) morph = morphGoal;
    }

    // ── 交互 ─────────────────────────────────────────────────────────────
    var el = renderer.domElement, ptrs = {}, drag = null, pinch = null, lastHover = 0, hoverPos = null;
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    el.addEventListener('pointerdown', function (e) {
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(ptrs);
      if (ids.length === 2) { var a = ptrs[ids[0]], b = ptrs[ids[1]]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), r: goal.radius }; drag = null; return; }
      stopTween();
      drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, pan: e.button === 2 || e.shiftKey || mode2D, moved: 0, button: e.button };
      if (o.onInteract) o.onInteract();
    });
    el.addEventListener('pointermove', function (e) {
      if (ptrs[e.pointerId]) ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (pinch) {
        var ids = Object.keys(ptrs); if (ids.length < 2) return;
        var a = ptrs[ids[0]], b = ptrs[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y);
        goal.radius = Math.max(R_MIN, Math.min(R_MAX, pinch.r * pinch.d / Math.max(20, d))); return;
      }
      if (drag) {
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
        drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy));
        if (drag.pan) {
          var s = goal.radius * 0.0016, ct = Math.cos(cur.theta), st = Math.sin(cur.theta);
          goal.tx -= (dx * ct + dy * st) * s; goal.tz -= (-dx * st + dy * ct) * s;
          goal.tx = Math.max(-110, Math.min(110, goal.tx)); goal.tz = Math.max(-100, Math.min(100, goal.tz));
        } else {
          goal.theta -= dx * 0.0052;
          goal.phi = Math.max(PHI_MIN, Math.min(PHI_MAX, goal.phi - dy * 0.0042));
        }
        if (hoverPos) { hoverPos = null; if (o.onHover) o.onHover(null); }
        return;
      }
      var r = el.getBoundingClientRect(); hoverPos = { x: e.clientX - r.left, y: e.clientY - r.top, cx: e.clientX, cy: e.clientY };
    });
    function endPointer(e) {
      delete ptrs[e.pointerId];
      if (pinch) { if (Object.keys(ptrs).length < 2) pinch = null; drag = null; return; }
      if (!drag) return;
      var d = drag; drag = null;
      if (d.moved < 5 && e.type === 'pointerup' && d.button === 0) {
        var r = el.getBoundingClientRect(), hit = pick(e.clientX - r.left, e.clientY - r.top);
        if (o.onPick) o.onPick(hit);
      }
    }
    el.addEventListener('pointerup', endPointer);
    el.addEventListener('pointercancel', endPointer);
    el.addEventListener('pointerleave', function () { hoverPos = null; if (o.onHover) o.onHover(null); });
    el.addEventListener('wheel', function (e) {
      e.preventDefault(); stopTween();
      goal.radius = Math.max(R_MIN, Math.min(R_MAX, goal.radius * Math.exp(e.deltaY * 0.0011)));
    }, { passive: false });

    var ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), v3 = new THREE.Vector3();
    var layerOn = { cloud: true, heatmap: false, adSpots: true, lines: true, buses: true, hubs: true, tiles: true, regions: true, districts: true, arcs: false, buildings: true };
    var focus = { district: null, category: null, line: null };
    function toScreen(x, y, z) {
      v3.set(x, y, z).project(camera);
      return { x: (v3.x * 0.5 + 0.5) * container.clientWidth, y: (-v3.y * 0.5 + 0.5) * container.clientHeight, z: v3.z };
    }
    function pick(px, py) {
      var w = container.clientWidth, h = container.clientHeight;
      ndc.set(px / w * 2 - 1, -(py / h) * 2 + 1); ray.setFromCamera(ndc, camera);
      var best = null;
      if (layerOn.adSpots) {
        var ah = ray.intersectObjects(adProxies, false);
        if (ah.length) best = { kind: 'ad', id: ah[0].object.userData.adId, dist: ah[0].distance };
      }
      if (layerOn.hubs) {
        var hh = ray.intersectObjects(hubProxies, false);
        if (hh.length && (!best || hh[0].distance < best.dist - 0.35)) {
          best = { kind: 'hub', id: hh[0].object.userData.hubId, dist: hh[0].distance };
        }
      }
      if (layerOn.cloud && morph > 0.5) {
        vertical.updateMatrixWorld(true);
        var ch = ray.intersectObject(cloud, false);
        for (var i = 0; i < ch.length; i++) {
          var id = ch[i].instanceId;
          if (id !== undefined && curH[id] > 0.01) {
            if (!best || ch[i].distance < best.dist - 0.6) best = { kind: 'cloud', idx: id, dist: ch[i].distance };
            break;
          }
        }
      }
      if (best) return best;
      if (layerOn.lines) {
        var min = 9 * 9, sel = null;
        Object.keys(lineFx).forEach(function (id) {
          if (focus.line && focus.line !== id) return;
          var prev = null;
          lineFx[id].samples.forEach(function (p) {
            var s = toScreen(p.x, p.y, p.z);
            if (prev && s.z < 1 && prev.z < 1) {
              var dx = s.x - prev.x, dy = s.y - prev.y, den = dx * dx + dy * dy;
              var t = den ? Math.max(0, Math.min(1, ((px - prev.x) * dx + (py - prev.y) * dy) / den)) : 0;
              var d = Math.pow(px - prev.x - t * dx, 2) + Math.pow(py - prev.y - t * dy, 2);
              if (d < min) { min = d; sel = id; }
            }
            prev = s;
          });
        });
        if (sel) return { kind: 'line', id: sel };
      }
      return null;
    }

    // ── 焦点与图层 ───────────────────────────────────────────────────────
    function setFocus(f) {
      focus = Object.assign({ district: null, category: null, line: null }, f || {});
      for (var i = 0; i < N; i++) {
        var c = M.cloud[i];
        dimmed[i] = (focus.district && c.district !== focus.district) || focus.category ? 1 : 0;
      }
      paintCloud(); writeCloudMatrices(); lastValuePick = 0;
      heatField.markDirty();
      if (layerOn.heatmap) heatField.redraw(values, dimmed);
      Object.keys(districtFx).forEach(function (name) {
        var on = focus.district === name, fx = districtFx[name];
        fx.fillMat.opacity = on ? 0.11 : 0; fx.lineMat.opacity = on ? 0.95 : 0;
        fx.fills.forEach(function (m) { m.visible = on; }); fx.lines.forEach(function (m) { m.visible = on; });
      });
      M.hubs.forEach(function (h) {
        var fx = hubFx[h.id];
        var match = (!focus.district || h.district === focus.district) && (!focus.category || h.category === focus.category);
        fx.mat.opacity = match ? 0.9 : 0.16;
        fx.capMat.opacity = match ? 0.96 : 0.18;
        var s = focus.category && match ? 1.55 : 1;
        fx.ring.scale.set(s, 1, s); fx.inner.scale.set(s, 1, s);
        fx.staff.scale.y = focus.category && match ? 2.6 : 1.52;
        fx.cap.position.y = 0.2 + fx.staff.scale.y;
      });
      (M.adSpots || []).forEach(function (ad) {
        var fx = adFx[ad.id];
        if (!fx) return;
        var match = (!focus.district || ad.district === focus.district) && !focus.category;
        fx.ringMat.opacity = match ? 0.94 : 0.18;
        fx.prismMat.opacity = match ? 0.96 : 0.20;
        fx.haloMat.opacity = match ? (fx.isS ? 0.18 : 0.12) : 0.03;
      });
      Object.keys(lineFx).forEach(function (id) {
        var fx = lineFx[id], on = !focus.line || focus.line === id;
        fx.mat.opacity = on ? (focus.line ? 1 : 0.9) : 0.10;
        fx.stops.forEach(function (m) { m.visible = focus.line === id; });
      });
      buses.forEach(function (b) { b.mesh.visible = layerOn.buses && (!focus.line || focus.line === b.line); });
      labels.forEach(function (L) {
        if (L.data && L.data.hubId) {
          var h = M.hubById[L.data.hubId];
          L.dim = !((!focus.district || h.district === focus.district) && (!focus.category || h.category === focus.category));
        }
        if (L.data && L.data.adId) {
          var ad = M.adSpotById[L.data.adId];
          L.dim = !((!focus.district || ad.district === focus.district) && !focus.category);
        }
      });
      stopLabels.forEach(function (L) { L.el.remove(); labels.splice(labels.indexOf(L), 1); });
      stopLabels = [];
      if (focus.line) {
        var line = M.lines.filter(function (l) { return l.id === focus.line; })[0];
        (line ? line.stops : []).forEach(function (s, i) {
          var xz = P(s.lngLat[0], s.lngLat[1]);
          var L = addLabel((i + 1) + ' ' + s.name, xz[0], 0.32, xz[1], 'lbl-stop', 7 + i * 0.001, { group: 'stops' });
          L.w = 0; stopLabels.push(L);
        });
        requestAnimationFrame(function () { stopLabels.forEach(function (L) { L.w = L.el.offsetWidth; L.h = L.el.offsetHeight; }); });
      }
    }

    // ── 热力切换径向流光扫描波纹（切换瞬间由西湖—武林核心向全城掠过） ────
    var scanWave = (function () {
      var geo = track(new THREE.RingGeometry(0.955, 1.0, 96)); geo.rotateX(-Math.PI / 2);
      var mat = track(new THREE.MeshBasicMaterial({
        color: 0x38c8f2, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false
      }));
      var mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, 0.14, 0);
      mesh.visible = false;
      mesh.renderOrder = 8;
      world.add(mesh);
      return { mesh: mesh, mat: mat, t: 1, dir: 1 };
    })();

    function setLayer(name, on) {
      layerOn[name] = !!on;
      cloud.visible = layerOn.cloud; crowns.visible = layerOn.cloud;
      if (name === 'heatmap') {
        heatAlphaGoal = layerOn.heatmap ? 1 : 0;
        if (layerOn.heatmap && heatField.isDirty()) heatField.redraw(values, dimmed);
        if (reduced()) {
          heatAlpha = heatAlphaGoal;
          heatField.mat.opacity = 0.92 * heatAlpha;
          heatField.mesh.visible = heatAlpha > 0.004;
        } else {
          heatField.mesh.visible = true;
          scanWave.t = 0;
          scanWave.dir = layerOn.heatmap ? 1 : -1;
          scanWave.mat.color.setHex(layerOn.heatmap ? 0x4ce0ff : 0x62b6d9);
          scanWave.mesh.visible = true;
        }
      } else {
        heatField.mesh.visible = layerOn.heatmap || heatAlpha > 0.004;
        if (layerOn.heatmap && heatField.isDirty()) heatField.redraw(values, dimmed);
      }
      adGroup.visible = layerOn.adSpots;
      lineGroup.visible = layerOn.lines; stopGroup.visible = layerOn.lines;
      busGroup.visible = layerOn.buses && layerOn.lines;
      hubGroup.visible = layerOn.hubs;
      districtGroup.visible = layerOn.districts;
      buildings.mesh.visible = layerOn.buildings;
      arcGroup.visible = layerOn.arcs;
      if (tiles.plane) tiles.plane.visible = layerOn.tiles;
    }

    var hoverTarget = null;
    function updateCatchmentRing() {
      var ref = selection || (hoverTarget && hoverTarget.kind === 'ad' ? hoverTarget : null);
      if (!ref) { catchGroup.visible = false; return; }
      var pt = null;
      if (ref.kind === 'cloud' && M.cloud[ref.idx]) pt = M.cloud[ref.idx];
      else if (ref.kind === 'hub' && M.hubById[ref.id]) pt = M.hubById[ref.id];
      else if (ref.kind === 'ad' && M.adSpotById[ref.id]) pt = M.adSpotById[ref.id];
      if (!pt) { catchGroup.visible = false; return; }
      catchGroup.visible = true;
      catchGroup.position.set(pt.x, 0, pt.z);
      var isAd = ref.kind === 'ad';
      catchFillMat.opacity = isAd ? 0.12 : 0.075;
      catchEdgeMat.opacity = isAd ? 0.90 : 0.68;
    }

    function select(target) {
      selection = target || null;
      updateCatchmentRing();
      if (!selection) { selGroup.visible = false; selLabel.on = false; return; }
      selGroup.visible = true; selLabel.on = true; selLabel.w = 0;
      selLabel.el.textContent = selection.label || '';
      requestAnimationFrame(function () { selLabel.w = selLabel.el.offsetWidth; selLabel.h = selLabel.el.offsetHeight; });
      selPulseT = reduced() ? 1 : 0;
      if (layerOn.arcs) {
        var arcHub = selection.kind === 'hub' ? selection.id : (selection.kind === 'ad' && M.adSpotById[selection.id] ? M.adSpotById[selection.id].hubId : null);
        buildArcs(arcHub);
      }
    }
    function setSelectionLabel(text) { selLabel.el.textContent = text; selLabel.w = selLabel.el.offsetWidth; selLabel.h = selLabel.el.offsetHeight; }
    function selectionPoint() {
      if (!selection) return null;
      if (selection.kind === 'cloud') { var c = M.cloud[selection.idx]; return { x: c.x, z: c.z, top: curH[selection.idx] * morph }; }
      if (selection.kind === 'hub') { var h = M.hubById[selection.id]; return { x: h.x, z: h.z, top: 1.75 * morph }; }
      if (selection.kind === 'ad') { var ad = M.adSpotById[selection.id]; return ad ? { x: ad.x, z: ad.z, top: (ad.tier === 'S' ? 2.4 : 2.0) * morph } : null; }
      return null;
    }

    // ── 动态切换釉色与暗夜热力场（支持平滑补间过渡） ──────────────────────
    var heatAlpha = 0, heatAlphaGoal = 0;
    var palMix = (g.HZ_PALETTE && g.HZ_PALETTE.thermal) ? 1 : 0;
    var palGoal = palMix;
    var cTmpA = new THREE.Color(), cTmpB = new THREE.Color(), cTmpOut = new THREE.Color();

    function mixHex(hexA, hexB, t, targetColor) {
      cTmpA.setHex(hexA); cTmpB.setHex(hexB);
      return (targetColor || cTmpOut).copy(cTmpA).lerp(cTmpB, t);
    }
    function mixCss(strA, strB, t) {
      cTmpA.set(strA); cTmpB.set(strB);
      return '#' + cTmpOut.copy(cTmpA).lerp(cTmpB, t).getHexString();
    }

    function applyBlendedTheme(t) {
      var pals = g.HZ_PALETTES;
      if (!pals || !pals.lake || !pals.thermal) return;
      var L = pals.lake.city, D = pals.thermal.city;
      updateSkyTexture(mixCss(L.skyTop, D.skyTop, t), mixCss(L.skyMid, D.skyMid, t), mixCss(L.skyBottom, D.skyBottom, t));
      mixHex(L.fog, D.fog, t, scene.fog.color);
      mixHex(L.skyLight, D.skyLight, t, hemiLight.color);
      mixHex(L.groundLight, D.groundLight, t, hemiLight.groundColor);
      mixHex(L.sun, D.sun, t, sun.color);
      mixHex(L.waterShallow, D.waterShallow, t, rimLight.color);
      mixHex(L.ground, D.ground, t, groundMat.color);
      mixHex(L.gridMinor, D.gridMinor, t, gridMinorMat.color);
      mixHex(L.gridMajor, D.gridMajor, t, gridMajorMat.color);
      mixHex(L.district, D.district, t, districtLineMat.color);
      var accHex = mixHex(L.accent, D.accent, t).getHex();
      var sealHex = mixHex(L.seal, D.seal, t).getHex();
      Object.keys(districtFx).forEach(function (k) {
        districtFx[k].fillMat.color.setHex(accHex);
        districtFx[k].lineMat.color.setHex(accHex);
      });
      mixHex(L.waterDeep, D.waterDeep, t, waterUniforms.uDeep.value);
      mixHex(L.waterShallow, D.waterShallow, t, waterUniforms.uShallow.value);
      mixHex(L.waterSpec, D.waterSpec, t, waterUniforms.uSpec.value);
      mixHex(L.fog, D.fog, t, waterUniforms.uFogColor.value);
      mixHex(L.island, D.island, t, isleMat.color);
      mixHex(L.shore, D.shore, t, shoreMat.color);
      mixHex(L.shoreGlow, D.shoreGlow, t, shoreGlowMat.color);
      mixHex(L.contour, D.contour, t, contourMat.color);
      var mBot = new THREE.Color().copy(mixHex(L.mountain, D.mountain, t));
      var mTop = new THREE.Color().copy(mixHex(L.mountainTop, D.mountainTop, t));
      mountainMeshes.forEach(function (mm) { mm.mat.color.copy(mBot).lerp(mTop, mm.t * 0.85); });
      mixHex(L.roadCasing, D.roadCasing, t, roadCasingMat.color);
      mixHex(L.roadMain, D.roadMain, t, roadMatA.color);
      mixHex(L.road, D.road, t, roadMatB.color);
      mixHex(L.bridge, D.bridge, t, bridgeMat.color);
      mixHex(L.landmark, D.landmark, t, glazeMat.color);
      mixHex(L.landmarkEdge, D.landmarkEdge, t, lmEdgeMat.color);

      COLORS.building = mixHex(L.building, D.building, t).getHex();
      COLORS.buildingBase = mixHex(L.buildingBase, D.buildingBase, t).getHex();
      buildings.repaint();

      M.lines.forEach(function (line, li) {
        var fx = lineFx[line.id];
        if (fx) {
          var lCol = mixCss(pals.lake.lines[li % pals.lake.lines.length], pals.thermal.lines[li % pals.thermal.lines.length], t);
          fx.mat.color.set(lCol); fx.stopMat.color.set(lCol); fx.roofMat.color.set(lCol);
        }
      });
      Object.keys(hubFx).forEach(function (id) {
        hubFx[id].mat.color.setHex(accHex);
        hubFx[id].capMat.color.setHex(sealHex);
      });
      Object.keys(adFx).forEach(function (id) {
        var fx = adFx[id];
        var ringHex = fx.isS ? mixHex(0xd89228, 0xffc45c, t).getHex() : mixHex(0x2682a6, 0x38c8f2, t).getHex();
        fx.ringMat.color.setHex(ringHex);
        fx.haloMat.color.setHex(ringHex);
        fx.prismMat.color.setHex(fx.isS ? 0xffcb6b : sealHex);
      });
      catchFillMat.color.setHex(sealHex);
      catchEdgeMat.color.setHex(sealHex);
      catchInnerMat.color.setHex(accHex);
      sealMat.color.setHex(sealHex);
      selPulseMat.color.setHex(sealHex);
      selStaffMat.color.setHex(sealHex);
      hoverMat.color.setHex(accHex);
      arcMat.color.setHex(accHex);
      dotMat.color.setHex(sealHex);
      mixHex(L.crown, D.crown, t, crownMat.color);
      mixHex(L.glaze, D.glaze, t, glaze);

      for (var hc = 0; hc < heatColors.length; hc++) {
        cTmpA.set(pals.lake.heat[hc]); cTmpB.set(pals.thermal.heat[hc]);
        heatColors[hc].copy(cTmpA).lerp(cTmpB, t);
      }
      cloudMat.transparent = t > 0.02;
      cloudMat.opacity = 1 - 0.12 * t;
      crownMat.opacity = 0.78 + 0.18 * t;
      var wScale = 1 - 0.24 * t;
      for (var ci = 0; ci < N; ci++) {
        var v = values[ci];
        var cls = v === v ? M.heat.classOf(v) : 0;
        tmpC.copy(heatColors[cls]);
        if (dimmed[ci]) tmpC.lerp(glaze, 0.68);
        cloud.setColorAt(ci, tmpC);
        widths[ci] = (v === v ? 0.85 + Math.min(1, cls / 4) * 0.48 : 1) * wScale;
      }
      cloud.instanceColor.needsUpdate = true;
      writeCloudMatrices();
    }

    function applyPalette() {
      if (!g.HZ_PALETTE) return;
      Object.assign(COLORS, g.HZ_PALETTE.city);
      palGoal = g.HZ_PALETTE.thermal ? 1 : 0;
      if (reduced() || !g.HZ_PALETTES) {
        palMix = palGoal;
        applyBlendedTheme(palMix);
      }
    }

    // ── 每帧更新 ─────────────────────────────────────────────────────────
    var occupied = [];
    function layoutLabels() {
      var w = container.clientWidth, h = container.clientHeight;
      occupied.length = 0;
      var safeTop = o.safeArea ? o.safeArea() : { top: 0, bottom: 0, left: 0, right: 0 };
      (safeTop.avoid || []).forEach(function (r) { occupied.push({ l: r.left, r: r.right, t: r.top, b: r.bottom }); });
      var order = labels.slice().sort(function (a, b) { return a.prio - b.prio; });
      for (var i = 0; i < order.length; i++) {
        var L = order[i], grp = L.data && L.data.group;
        var allowed = L.on && (
          grp === 'selection' || grp === 'stops' || grp === 'values' ||
          (grp === 'regions' && layerOn.regions && morph > 0.5) ||
          (grp === 'hubs' && layerOn.hubs && !L.dim) ||
          (grp === 'adSpots' && layerOn.adSpots && !L.dim)
        );
        if (allowed && grp === 'hubs' && cur.radius > 72 && !focus.category) allowed = false;
        if (allowed && grp === 'adSpots' && L.data.tier !== 'S' && cur.radius > 66) allowed = false;
        if (allowed && grp === 'adSpots' && selection && selection.kind === 'ad' && selection.id === L.data.adId) allowed = false;
        var visible = false;
        if (allowed) {
          var y = L.y * Math.max(morph, 0.05);
          if (grp === 'selection') { var sp = selectionPoint(); if (sp) { L.x = sp.x; L.z = sp.z; y = sp.top + 0.62; } }
          if (grp === 'values') { y = curH[L.idx] * morph + 0.36; if (!L.w) { L.w = L.el.offsetWidth; L.h = L.el.offsetHeight; } }
          if (grp === 'adSpots' && !L.w) { L.w = L.el.offsetWidth; L.h = L.el.offsetHeight; }
          var s = toScreen(L.x, y, L.z);
          var bw = L.w || 60, bh = L.h || 20;
          var box = { l: s.x - bw / 2, r: s.x + bw / 2, t: s.y - bh - 8, b: s.y - 8 };
          var inView = s.z < 1 && box.l > safeTop.left + 4 && box.r < w - safeTop.right - 4 && box.t > safeTop.top && box.b < h - safeTop.bottom;
          if (grp === 'selection') inView = s.z < 1 && s.x > 0 && s.x < w && s.y > 0 && s.y < h;
          var overlap = false;
          if (inView && grp !== 'selection') for (var j = 0; j < occupied.length; j++) { var q = occupied[j]; if (box.l < q.r + 7 && box.r > q.l - 7 && box.t < q.b + 4 && box.b > q.t - 4) { overlap = true; break; } }
          if (inView && !overlap) {
            visible = true; occupied.push(box);
            if (grp === 'selection') {
              var g0 = toScreen(L.x, 0, L.z);
              occupied.push({ l: Math.min(box.l, g0.x - 40), r: Math.max(box.r, g0.x + 40), t: box.b, b: Math.max(box.b, g0.y + 16) });
            }
            L.el.style.transform = 'translate(' + Math.round(box.l) + 'px,' + Math.round(box.t) + 'px)';
          }
        }
        if (visible !== L.shown) { L.shown = visible; L.el.classList.toggle('on', visible); }
      }
    }

    function setHoverMarker(t) {
      hoverTarget = t || null;
      updateCatchmentRing();
      if (!t) { hoverRing.visible = false; return; }
      var p = t.kind === 'cloud' ? M.cloud[t.idx] : t.kind === 'hub' ? M.hubById[t.id] : t.kind === 'ad' ? M.adSpotById[t.id] : null;
      if (!p) { hoverRing.visible = false; return; }
      hoverRing.visible = true; hoverRing.position.set(p.x, 0.2, p.z);
    }

    function frame(now, dt) {
      if (tween) {
        var p = Math.min(1, (now - tween.t0) / tween.dur), e = ease(p), f = tween.from, t = tween.to;
        cur = { theta: f.theta + (t.theta - f.theta) * e, phi: f.phi + (t.phi - f.phi) * e, radius: f.radius + (t.radius - f.radius) * e,
          tx: f.tx + (t.tx - f.tx) * e, ty: f.ty + (t.ty - f.ty) * e, tz: f.tz + (t.tz - f.tz) * e };
        if (p >= 1) { tween = null; goal = Object.assign({}, cur); }
      } else {
        var k = reduced() ? 1 : 1 - Math.exp(-dt * 9);
        if (mode2D) { goal.phi = 0.02; }
        ['theta', 'phi', 'radius', 'tx', 'ty', 'tz'].forEach(function (key) { cur[key] += (goal[key] - cur[key]) * k; });
      }
      var ki = reduced() ? 1 : 1 - Math.exp(-dt * 9);
      ['right', 'bottom', 'left', 'top'].forEach(function (key) { insetCur[key] += (inset[key] - insetCur[key]) * ki; });
      morph += (morphGoal - morph) * (reduced() ? 1 : 1 - Math.exp(-dt * 5));
      if (Math.abs(morphGoal - morph) < 0.002) morph = morphGoal;
      vertical.scale.y = Math.max(0.002, morph);
      vertical.visible = morph > 0.01;
      hubGroup.scale.y = Math.max(0.05, morph);
      adGroup.scale.y = Math.max(0.06, morph);
      if (tiles.plane) tiles.plane.material.opacity = tiles.loaded ? 0.30 * morph + 0.88 * (1 - morph) : 0;
      var fogNear = 122 + (1 - morph) * 400, fogFar = 268 + (1 - morph) * 400;
      scene.fog.near = fogNear; scene.fog.far = fogFar;
      waterUniforms.uFogNear.value = fogNear; waterUniforms.uFogFar.value = fogFar;

      applyCamera();
      stepCloud(dt);

      // 热力场透明度、底图昼夜色彩与径向流光波纹平滑过渡
      if (Math.abs(palGoal - palMix) > 0.001) {
        palMix += (palGoal - palMix) * (reduced() ? 1 : Math.min(1, dt * 6.2));
        if (Math.abs(palGoal - palMix) <= 0.002) palMix = palGoal;
        applyBlendedTheme(palMix);
      }
      if (Math.abs(heatAlphaGoal - heatAlpha) > 0.001) {
        heatAlpha += (heatAlphaGoal - heatAlpha) * (reduced() ? 1 : Math.min(1, dt * 5.8));
        if (Math.abs(heatAlphaGoal - heatAlpha) <= 0.003) heatAlpha = heatAlphaGoal;
        heatField.mat.opacity = 0.92 * heatAlpha;
        var hs = 0.965 + 0.035 * heatAlpha;
        heatField.mesh.scale.set(hs, 1, hs);
        heatField.mesh.visible = heatAlpha > 0.004;
      }
      if (scanWave.t < 1) {
        scanWave.t = Math.min(1, scanWave.t + dt / 0.72);
        var swEase = 1 - Math.pow(1 - scanWave.t, 3);
        var swR = scanWave.dir > 0 ? (2 + swEase * 88) : (82 - swEase * 76);
        scanWave.mesh.scale.set(swR, 1, swR);
        scanWave.mat.opacity = Math.sin(scanWave.t * Math.PI) * (scanWave.dir > 0 ? 0.52 : 0.28);
        if (scanWave.t >= 1) scanWave.mesh.visible = false;
      }

      var motion = !reduced() && !document.hidden;
      if (motion) {
        var sec = now * 0.001;
        waterUniforms.uTime.value = sec;
        if (layerOn.adSpots) {
          Object.keys(adFx).forEach(function (id, idx) {
            var fx = adFx[id];
            fx.prism.rotation.y = sec * 0.85 + idx * 0.5;
            fx.prism.position.y = fx.baseY + Math.sin(sec * 1.8 + idx) * 0.045;
          });
        }
      }

      if (motion && layerOn.buses && layerOn.lines) {
        for (var i = 0; i < buses.length; i++) {
          var b = buses[i]; if (!b.mesh.visible) continue;
          b.t = (b.t + dt * 0.011 * b.dir + 1) % 1;
          var pos = b.curve.getPointAt(b.t), tan = b.curve.getTangentAt(b.t);
          var nl = Math.hypot(tan.x, tan.z) || 1;
          b.mesh.position.set(pos.x - tan.z / nl * b.lane, pos.y - 0.12, pos.z + tan.x / nl * b.lane);
          b.mesh.lookAt(b.mesh.position.x + tan.x * b.dir, b.mesh.position.y, b.mesh.position.z + tan.z * b.dir);
        }
      }
      if (layerOn.arcs && motion) arcDots.forEach(function (a) { a.t = (a.t + dt * 0.35) % 1; a.dot.position.copy(a.curve.getPointAt(a.t)); });

      var sp = selectionPoint();
      if (sp) {
        selGroup.position.set(sp.x, 0, sp.z);
        selStaff.scale.y = Math.max(0.3, sp.top + 0.56); selStaff.position.y = 0;
        if (selPulseT < 1) {
          selPulseT = Math.min(1, selPulseT + dt / 0.8);
          var s = 1 + (1 - selPulseT) * 2.4; selPulse.scale.set(s, 1, s); selPulse.material.opacity = (1 - selPulseT) * 0.65;
        } else selPulse.material.opacity = 0;
      }
      if (hoverPos && !drag && now - lastHover > 65) {
        lastHover = now;
        var hit = pick(hoverPos.x, hoverPos.y);
        setHoverMarker(hit);
        if (o.onHover) o.onHover(hit, hoverPos.cx, hoverPos.cy);
      }
      renderer.render(scene, camera);
      pickValueLabels(now);
      layoutLabels();
    }

    function resize() {
      renderer.setSize(container.clientWidth || 1, container.clientHeight || 1);
      applyCamera(); measureLabels();
    }

    function dispose() {
      clearArcs();
      if (skyTex) skyTex.dispose();
      disposables.forEach(function (d) { if (d && d.dispose) d.dispose(); });
      cloud.dispose(); crowns.dispose(); buildings.mesh.dispose();
      renderer.dispose(); el.remove();
      labels.forEach(function (L) { L.el.remove(); });
    }

    return {
      frame: frame, resize: resize, dispose: dispose, applyPalette: applyPalette,
      setCloud: setCloud, setFocus: setFocus, setLayer: setLayer, select: select, setSelectionLabel: setSelectionLabel,
      setHoverMarker: setHoverMarker,
      flyPreset: flyPreset, flyToPoint: flyToPoint, flyToBounds: flyToBounds, flyTo: flyTo,
      setInset: function (v) { Object.assign(inset, v); },
      getPose: function () { return Object.assign({}, tween ? tween.to : goal); },
      isMoving: function () { return !!tween || Math.abs(goal.theta - cur.theta) + Math.abs(goal.phi - cur.phi) + Math.abs(goal.radius - cur.radius) > 0.01; },
      setMode2D: setMode2D, get is2D() { return mode2D; },
      retryTiles: function () { tiles.retry(); },
      buildArcs: buildArcs, clearArcs: clearArcs,
      lineCenter: function (id) { var fx = lineFx[id]; if (!fx) return null; var pts = fx.samples; return pts.map(function (p) { return { x: p.x, z: p.z }; }); },
      screenOf: function (x, y, z) { return toScreen(x, y, z); },
      debug: function () {
        var shown = 0; for (var i = 0; i < N; i++) if (tgtH[i] > 0) shown++;
        var objects = 0; scene.traverse(function () { objects++; });
        return {
          camera: Object.assign({}, cur), tween: !!tween, morph: morph, mode2D: mode2D, inset: Object.assign({}, insetCur), barsShown: shown,
          cloudSettled: cloudSettled, layers: Object.assign({}, layerOn), cloudVisible: cloud.visible, focus: Object.assign({}, focus), selection: selection,
          info: { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, calls: renderer.info.render.calls },
          buildings: buildings.count, sceneObjects: objects, arcObjects: arcGroup.children.length,
          tiles: { loaded: tiles.loaded, failed: tiles.failed, loading: tiles.loading }, labelsShown: labels.filter(function (L) { return L.shown; }).length
        };
      }
    };
  };
})(window);

// The map runs MapLibre GL JS inside a WebView, so the app still works in Expo Go.
// Street view: standard OpenStreetMap tiles. 3D view: OpenStreetMap data via OpenFreeMap
// vector tiles. God's Eye: a CesiumJS 3D globe (inspired by bilawalsidhu/gods-eye-view) with
// Google Photorealistic 3D Tiles when a Cesium ion token or Google Maps key is configured,
// otherwise Esri World Imagery. Optional "lens" filters: night vision, thermal, CRT.
// RN -> web: window.__recv(msg)   web -> RN: ReactNativeWebView.postMessage(json)

export const MAPLIBRE_VERSION = '4.7.1';
export const CESIUM_VERSION = '1.123.0';

export const mapHtml = /* html */ `<!doctype html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<link href="https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css" rel="stylesheet" />
<script src="https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js"></script>
<style>
  html,body,#map{margin:0;height:100%;width:100%;background:#f2efe9;overflow:hidden}
  .maplibregl-ctrl-attrib{font-size:9px;opacity:.8}
  .maplibregl-ctrl-bottom-right,.maplibregl-ctrl-bottom-left{bottom:var(--attr-bottom,0)}
  .me{width:20px;height:20px;border-radius:50%;background:var(--c);border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35),0 0 0 0 var(--h);animation:pulse 2s infinite}
  @keyframes pulse{0%{box-shadow:0 1px 4px rgba(0,0,0,.35),0 0 0 0 var(--h)}70%{box-shadow:0 1px 4px rgba(0,0,0,.35),0 0 0 22px transparent}100%{box-shadow:0 1px 4px rgba(0,0,0,.35),0 0 0 0 transparent}}
  .poi{display:flex;flex-direction:column;align-items:center;cursor:pointer}
  .poi .b{width:30px;height:30px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;border:2.5px solid #fff;position:relative;box-shadow:0 1px 4px rgba(0,0,0,.3)}
  .poi .crown{position:absolute;top:-8px;right:-8px;font-size:12px}
  .poi .lv{font:600 11px -apple-system,system-ui,Segoe UI,Roboto,sans-serif;color:#111827;margin-top:3px;max-width:110px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff,0 0 3px #fff}
  .poi.small .b{width:22px;height:22px;font-size:12px;border-width:2px}
  .poi.small .lv{display:none}
  .ring{position:absolute;inset:-6px;border-radius:50%}
  #globe{position:absolute;inset:0;display:none;background:#000}
  #globe .cesium-viewer-bottom{bottom:var(--attr-bottom,0)!important}
  body.globe #map .maplibregl-marker,body.globe #map .maplibregl-ctrl{display:none}
  #globe .cesium-widget-credits{font-size:9px}
  body.globe #globe{display:block}
  #fx{position:absolute;inset:0;pointer-events:none;display:none;z-index:2}
  body.lens-nvg #fx,body.lens-crt #fx,body.lens-thermal #fx{display:block}
  body.lens-nvg #globe,body.lens-nvg #map{filter:grayscale(1) brightness(1.25) contrast(1.3) sepia(1) hue-rotate(65deg) saturate(4)}
  body.lens-thermal #globe,body.lens-thermal #map{filter:grayscale(1) contrast(1.8) brightness(1.15)}
  body.lens-crt #globe,body.lens-crt #map{filter:contrast(1.15) saturate(1.35)}
  body.lens-nvg #fx{background:repeating-linear-gradient(0deg,rgba(0,0,0,.18) 0 1px,transparent 1px 3px),radial-gradient(ellipse at center,transparent 45%,rgba(0,0,0,.75) 100%)}
  body.lens-thermal #fx{background:radial-gradient(ellipse at center,transparent 55%,rgba(0,0,0,.55) 100%)}
  body.lens-crt #fx{background:repeating-linear-gradient(0deg,rgba(0,0,0,.22) 0 1px,transparent 1px 3px),radial-gradient(ellipse at center,transparent 60%,rgba(0,0,0,.5) 100%);animation:flick 4s infinite steps(1)}
  @keyframes flick{0%{opacity:1}50%{opacity:.93}}
</style></head>
<body><div id="map"></div><div id="globe"></div><div id="fx"></div>
<script>
(function(){
  const post = (m) => window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(m));
  window.onerror = (msg) => post({type:'error', msg: String(msg)});
  if (!window.maplibregl) { post({type:'error', msg:'Map library failed to load (offline?)'}); return; }

  const OFM = 'https://tiles.openfreemap.org';
  // invisible layer so OSM place data (vector tiles) still loads for place detection
  const POI_PROBE = { id:'poi-probe', type:'circle', source:'openmaptiles', 'source-layer':'poi', paint:{'circle-opacity':0,'circle-radius':1} };
  const osm = {
    version: 8,
    sources: {
      osm: { type:'raster', tileSize:256, maxzoom:19,
        tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' },
      openmaptiles: { type:'vector', url: OFM + '/planet' },
    },
    layers: [ { id:'osm', type:'raster', source:'osm' }, POI_PROBE ],
  };
  const satellite = {
    version: 8,
    sources: {
      sat: { type:'raster', tileSize:256, maxzoom:19,
        tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        attribution:'Imagery © Esri, Maxar, Earthstar Geographics' },
      openmaptiles: { type:'vector', url: OFM + '/planet' },
    },
    layers: [
      { id:'sat', type:'raster', source:'sat' },
      { id:'shade', type:'background', paint:{'background-color':'#000','background-opacity':0.1} },
      POI_PROBE,
    ],
  };
  const STYLES = { street: osm, tilt: OFM + '/styles/liberty', gods: satellite };
  const CAMERA = { street:{pitch:0, zoom:17}, tilt:{pitch:60, zoom:17.5}, gods:{pitch:0, zoom:16} };

  let mode = 'street', follow = true, last = null, heading = 0;
  const empty = { type:'FeatureCollection', features:[] };
  let data = { terr: empty, trails: empty, shields: empty, target: empty };

  const map = new maplibregl.Map({
    container:'map', style: STYLES.street, center:[-95.37,29.76], zoom:16,
    attributionControl:{compact:true}, pitchWithRotate:true, maxPitch:70,
  });

  function addOverlay(){
    const g = mode === 'gods';
    for (const k of Object.keys(data)) if (!map.getSource(k)) map.addSource(k, {type:'geojson', data:data[k]});
    const add = (l) => { if (!map.getLayer(l.id)) map.addLayer(l); };
    add({ id:'terr-fill', type:'fill', source:'terr', paint:{ 'fill-color':['get','color'], 'fill-opacity': g ? 0.42 : 0.28 }});
    add({ id:'terr-glow', type:'line', source:'terr', paint:{ 'line-color':['get','color'], 'line-width': g?9:6, 'line-blur': g?7:4, 'line-opacity': g?0.6:0.35 }});
    add({ id:'terr-line', type:'line', source:'terr', layout:{'line-join':'round'}, paint:{ 'line-color':['get','color'], 'line-width':2.5 }});
    add({ id:'shield-line', type:'line', source:'shields', paint:{ 'line-color': g ? '#ffffff' : '#1f2937', 'line-width':1.2, 'line-dasharray':[2,3], 'line-opacity':0.45 }});
    add({ id:'trail-casing', type:'line', source:'trails', layout:{'line-cap':'round','line-join':'round'}, paint:{ 'line-color':'#ffffff', 'line-width':8, 'line-opacity':0.9 }});
    add({ id:'trail-line', type:'line', source:'trails', layout:{'line-cap':'round','line-join':'round'}, paint:{ 'line-color':['get','color'], 'line-width':4.5 }});
    add({ id:'target-line', type:'line', source:'target', layout:{'line-cap':'round'}, paint:{ 'line-color':'#2b7cff', 'line-width':2.5, 'line-dasharray':[1,2], 'line-opacity':0.8 }});
  }
  map.on('style.load', () => { addOverlay(); setTimeout(scanPois, 600); });
  // belt & braces: if a style swap ever drops our layers, put them back
  map.on('styledata', () => { if (map.isStyleLoaded() && !map.getLayer('terr-fill')) addOverlay(); });

  // ---- markers ----
  const meEl = document.createElement('div'); meEl.className = 'me';
  const meMarker = new maplibregl.Marker({element: meEl});
  const pois = {};

  function setMe(me){
    if (!me) return;
    meEl.style.setProperty('--c', me.color); meEl.style.setProperty('--h', me.color + '66');
    meMarker.setLngLat([me.lng, me.lat]); if (!meMarker._map) meMarker.addTo(map);
    heading = me.heading ?? heading;
    const first = !last;
    const moved = first || Math.abs(last[0]-me.lng) + Math.abs(last[1]-me.lat) > 1e-7;
    last = [me.lng, me.lat];
    if (first) { map.jumpTo({ center:last }); setTimeout(scanPois, 1500); return; }
    if (follow && moved) map.easeTo({ center:last, bearing: mode==='tilt' ? heading : map.getBearing(), duration:700 });
  }
  function setPois(list){
    const seen = {};
    const z = map.getZoom();
    for (const p of list) {
      seen[p.id] = 1;
      let m = pois[p.id];
      if (!m) {
        const el = document.createElement('div'); el.className = 'poi';
        el.innerHTML = '<div class="b"><div class="ring"></div><span class="e"></span><span class="crown"></span></div><div class="lv"></div>';
        el.addEventListener('click', (e) => { e.stopPropagation(); post({type:'poi', id:p.id}); });
        m = pois[p.id] = new maplibregl.Marker({element: el, anchor:'bottom'}).setLngLat([p.lng,p.lat]).addTo(map);
      }
      const el = m.getElement();
      el.classList.toggle('small', !p.badge && !p.target && z < 17.2);
      el.querySelector('.e').textContent = p.emoji;
      el.querySelector('.crown').textContent = p.holder ? '👑' : '';
      el.querySelector('.crown').style.filter = p.holderMine ? '' : 'grayscale(1) brightness(.8)';
      const b = el.querySelector('.b');
      b.style.borderColor = p.tierColor || '#fff';
      const pr = Math.round((p.progress||0)*360);
      el.querySelector('.ring').style.background = pr > 0 ? 'conic-gradient(#2b7cff ' + pr + 'deg, transparent 0)' : 'none';
      el.querySelector('.ring').style.mask = 'radial-gradient(circle, transparent 62%, #000 64%)';
      el.querySelector('.ring').style.webkitMask = 'radial-gradient(circle, transparent 62%, #000 64%)';
      el.querySelector('.lv').textContent = p.name;
      el.style.zIndex = p.target ? 5 : p.badge ? 3 : 1;
    }
    for (const id in pois) if (!seen[id]) { pois[id].remove(); delete pois[id]; }
  }
  let lastPoiList = [];
  map.on('zoomend', () => setPois(lastPoiList));

  // ---- POIs straight from the vector tiles ----
  let scanTimer = null;
  function scanPois(){
    try {
      if (!map.getSource('openmaptiles')) return;
      const feats = map.querySourceFeatures('openmaptiles', { sourceLayer:'poi' });
      const c = map.getCenter(); const out = {};
      for (const f of feats) {
        const p = f.properties || {}; const name = p['name:en'] || p.name || p['name:latin'];
        if (!name || f.geometry.type !== 'Point') continue;
        const [lng, lat] = f.geometry.coordinates;
        const dx = (lng - c.lng) * 111320 * Math.cos(c.lat*Math.PI/180), dy = (lat - c.lat) * 110574;
        if (dx*dx + dy*dy > 1200*1200) continue;
        out[name + '@' + lng.toFixed(4) + ',' + lat.toFixed(4)] = { name, cls:p.class, sub:p.subclass, lng, lat };
      }
      const items = Object.values(out);
      if (items.length) post({ type:'pois', items });
    } catch (e) { post({type:'error', msg:'poi scan: ' + e.message}); }
  }
  map.on('idle', () => { clearTimeout(scanTimer); scanTimer = setTimeout(scanPois, 500); });
  // while walking the camera rarely goes idle, so also scan every few seconds
  setInterval(scanPois, 5000);

  // ---- input ----
  map.on('click', (e) => post({ type:'tap', lng:e.lngLat.lng, lat:e.lngLat.lat }));
  map.on('dragstart', (e) => { if (e.originalEvent && follow) { follow = false; post({type:'follow', on:false}); } });

  function setMode(m){
    if (m === mode && map.isStyleLoaded()) return;
    mode = m; map.setStyle(STYLES[m], { diff:false });
    globe.show(m === 'gods');
    applyLens();
    const cam = CAMERA[m];
    map.easeTo({ pitch:cam.pitch, zoom:cam.zoom, bearing: m==='tilt' ? heading : 0, center: last || map.getCenter(), duration:900 });
  }


  // ================= God's Eye: CesiumJS 3D globe =================
  let lens = 'normal';
  function applyLens(){
    document.body.className = document.body.className.replace(/\\blens-\\w+/g, '').trim();
    if (mode === 'gods' && lens !== 'normal') document.body.classList.add('lens-' + lens);
  }
  const CESIUM = 'https://cdn.jsdelivr.net/npm/cesium@${CESIUM_VERSION}/Build/Cesium';
  const globe = {
    cfg: {}, viewer: null, loading: null, failed: false, on: false, tiles: null, last: null,
    ents: { terr: [], poi: {} }, terrKey: '', me: null, trail: null, target: null, trailPos: [], targetPos: [],
    pos: null, h: 0, locked: false,
    load(){
      if (this.loading) return this.loading;
      window.CESIUM_BASE_URL = CESIUM + '/';
      this.loading = new Promise((res, rej) => {
        const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = CESIUM + '/Widgets/widgets.css'; document.head.appendChild(l);
        const s = document.createElement('script'); s.src = CESIUM + '/Cesium.js'; s.onload = res;
        s.onerror = () => rej(new Error('3D globe failed to load'));
        document.head.appendChild(s);
      });
      return this.loading;
    },
    async init(){
      await this.load();
      const C = window.Cesium;
      const cfg = this.cfg || {};
      if (cfg.cesiumToken) C.Ion.defaultAccessToken = cfg.cesiumToken;
      if (cfg.googleKey) C.GoogleMaps.defaultApiKey = cfg.googleKey;
      const esri = new C.ImageryLayer(new C.UrlTemplateImageryProvider({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        maximumLevel: 19, credit: 'Imagery © Esri, Maxar, Earthstar Geographics' }));
      const v = this.viewer = new C.Viewer('globe', {
        baseLayer: esri, baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
        navigationHelpButton: false, animation: false, timeline: false, fullscreenButton: false, infoBox: false,
        selectionIndicator: false, requestRenderMode: true, maximumRenderTimeChange: Infinity, msaaSamples: 1,
      });
      v.scene.screenSpaceCameraController.enableCollisionDetection = true;
      if (cfg.cesiumToken || cfg.googleKey) {
        try {
          const ts = await C.createGooglePhotorealistic3DTileset(undefined, {
            cacheBytes: 256 * 1024 * 1024, maximumCacheOverflowBytes: 128 * 1024 * 1024,
            maximumScreenSpaceError: 20, showCreditsOnScreen: true,
          });
          v.scene.primitives.add(ts);
          v.scene.globe.show = false; // the photoreal tiles cover the ground
          this.tiles = ts;
          post({ type: 'globe', photoreal: true });
        } catch (e) {
          post({ type: 'error', msg: 'Photorealistic 3D unavailable (' + (e.message || e) + '), using satellite imagery' });
        }
      }
      // taps: places first, otherwise the ground point (used by the walk simulator)
      const h = new C.ScreenSpaceEventHandler(v.scene.canvas);
      h.setInputAction((e) => {
        const picked = v.scene.pick(e.position);
        const id = picked && picked.id && picked.id.id;
        if (typeof id === 'string' && id.indexOf('poi:') === 0) return post({ type: 'poi', id: id.slice(4) });
        let cart = this.tiles && v.scene.pickPositionSupported ? v.scene.pickPosition(e.position) : undefined;
        if (!cart) cart = v.camera.pickEllipsoid(e.position);
        if (!cart) return;
        const c = C.Cartographic.fromCartesian(cart);
        post({ type: 'tap', lng: C.Math.toDegrees(c.longitude), lat: C.Math.toDegrees(c.latitude) });
      }, C.ScreenSpaceEventType.LEFT_CLICK);
      if (this.last) this.update(this.last, true);
    },
    show(on){
      this.on = on;
      document.body.classList.toggle('globe', on && !this.failed);
      if (!on) { if (this.viewer) this.viewer.useDefaultRenderLoop = false; return; }
      if (this.viewer) {
        this.viewer.useDefaultRenderLoop = true; this.viewer.resize();
        if (this.last) this.update(this.last, true);
        return;
      }
      this.init().catch((e) => { this.failed = true; document.body.classList.remove('globe'); post({ type: 'error', msg: e.message || String(e) }); });
    },
    groundHeight(lng, lat){
      const C = window.Cesium, v = this.viewer;
      if (!this.tiles || !v.scene.sampleHeightSupported) return 0;
      const h = v.scene.sampleHeight(C.Cartographic.fromDegrees(lng, lat), [this.me].filter(Boolean));
      return h === undefined ? this.h : h;
    },
    update(msg, force){
      this.last = msg;
      if (!this.on || !this.viewer) return;
      const C = window.Cesium, v = this.viewer, E = v.entities;
      const color = (hex, a) => C.Color.fromCssColorString(hex).withAlpha(a);
      const deg = (ring) => C.Cartesian3.fromDegreesArray([].concat.apply([], ring));
      // territory: only rebuilt when it changes
      const key = JSON.stringify(msg.terr.features.map((f) => f.geometry.coordinates.map((r) => r.length + ':' + r[0])));
      if (force || key !== this.terrKey) {
        this.terrKey = key;
        this.ents.terr.forEach((e) => E.remove(e)); this.ents.terr = [];
        for (const f of msg.terr.features) {
          const rings = f.geometry.coordinates;
          this.ents.terr.push(E.add({ polygon: {
            hierarchy: new C.PolygonHierarchy(deg(rings[0]), rings.slice(1).map((r) => new C.PolygonHierarchy(deg(r)))),
            material: color(f.properties.color, 0.4), classificationType: C.ClassificationType.BOTH } }));
          this.ents.terr.push(E.add({ polyline: { positions: deg(rings[0]), width: 3, clampToGround: true, material: color(f.properties.color, 1) } }));
        }
      }
      // your trail
      const tf = msg.trails.features[0];
      // live lines float just above the ground (ground-clamped lines rebuild too slowly to follow a walker)
      const lift = (coords) => C.Cartesian3.fromDegreesArrayHeights([].concat.apply([], coords.map((c) => [c[0], c[1], this.h + 1.5])));
      this.trailPos = tf ? lift(tf.geometry.coordinates) : [];
      if (!this.trail) {
        const mat = new C.PolylineOutlineMaterialProperty({ color: color(msg.me ? msg.me.color : '#2b7cff', 1), outlineColor: C.Color.WHITE, outlineWidth: 2 });
        this.trail = E.add({ polyline: { positions: new C.CallbackProperty(() => this.trailPos, false), width: 7, material: mat, depthFailMaterial: mat } });
      }
      this.trail.show = this.trailPos.length > 1;
      // line to target
      const tg = msg.target.features[0];
      this.targetPos = tg ? lift(tg.geometry.coordinates) : [];
      if (!this.target) {
        const dash = new C.PolylineDashMaterialProperty({ color: color('#2b7cff', 0.9), dashLength: 12 });
        this.target = E.add({ polyline: { positions: new C.CallbackProperty(() => this.targetPos, false), width: 3, material: dash, depthFailMaterial: dash } });
      }
      this.target.show = this.targetPos.length > 1;
      // places (nearest 40)
      const seen = {};
      for (const p of (msg.pois || []).slice(0, 40)) {
        seen[p.id] = 1;
        let e = this.ents.poi[p.id];
        const text = p.emoji + ' ' + p.name + (p.badge ? ' · ' + p.tierName : '');
        if (!e) e = this.ents.poi[p.id] = E.add({ id: 'poi:' + p.id, position: C.Cartesian3.fromDegrees(p.lng, p.lat),
          point: { pixelSize: 9, color: C.Color.WHITE, outlineColor: color('#111827', 0.6), outlineWidth: 2,
            heightReference: C.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
          label: { text: text, font: '600 13px -apple-system, system-ui, sans-serif', fillColor: C.Color.WHITE, outlineColor: color('#000000', 0.85),
            outlineWidth: 3, style: C.LabelStyle.FILL_AND_OUTLINE, verticalOrigin: C.VerticalOrigin.BOTTOM, pixelOffset: new C.Cartesian2(0, -10),
            heightReference: C.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY,
            distanceDisplayCondition: new C.DistanceDisplayCondition(0, 1600) } });
        else if (e.label.text.getValue() !== text) e.label.text = text;
        e.point.color = p.tierColor ? color(p.tierColor, 1) : C.Color.WHITE;
      }
      for (const id in this.ents.poi) if (!seen[id]) { E.remove(this.ents.poi[id]); delete this.ents.poi[id]; }
      // you + drone camera
      if (msg.me) {
        const pos = C.Cartesian3.fromDegrees(msg.me.lng, msg.me.lat);
        if (!this.me) this.me = E.add({ position: pos, point: { pixelSize: 18, color: color(msg.me.color, 1), outlineColor: C.Color.WHITE,
          outlineWidth: 3, heightReference: C.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY } });
        else this.me.position = pos;
        const moved = !this.pos || Math.abs(this.pos[0] - msg.me.lng) + Math.abs(this.pos[1] - msg.me.lat) > 1e-7;
        this.pos = [msg.me.lng, msg.me.lat];
        if (follow && (moved || force)) this.lookAtMe(force && !this.locked);
      }
      v.scene.requestRender();
    },
    lookAtMe(reset){
      const C = window.Cesium, cam = this.viewer.camera;
      this.h = this.groundHeight(this.pos[0], this.pos[1]);
      const target = C.Cartesian3.fromDegrees(this.pos[0], this.pos[1], this.h);
      // keep whatever angle and zoom the player orbited to; start as a 45° drone shot
      const hpr = !reset && this.locked
        ? new C.HeadingPitchRange(cam.heading, cam.pitch, C.Cartesian3.magnitude(cam.position))
        : new C.HeadingPitchRange(C.Math.toRadians(heading || 0), C.Math.toRadians(-42), 380);
      cam.lookAt(target, hpr);
      this.locked = true;
    },
    recenter(){
      if (!this.viewer || !this.pos) return;
      this.locked = false; this.lookAtMe(true); this.viewer.scene.requestRender();
    },
    flyTo(lng, lat){
      if (!this.viewer) return;
      const C = window.Cesium;
      this.viewer.camera.lookAtTransform(C.Matrix4.IDENTITY); this.locked = false;
      this.viewer.camera.flyTo({ destination: C.Cartesian3.fromDegrees(lng, lat - 0.0032, 450 + this.h),
        orientation: { heading: 0, pitch: C.Math.toRadians(-45), roll: 0 }, duration: 1.4 });
    },
  };

  window.__globe = globe; // handy for debugging in a browser console
  window.__recv = (msg) => {
    try {
      if (msg.type === 'world') {
        for (const k of ['terr','trails','shields','target']) { data[k] = msg[k] || empty; const s = map.getSource(k); if (s) s.setData(data[k]); }
        lastPoiList = msg.pois || []; setPois(lastPoiList);
        setMe(msg.me);
        globe.update(msg);
      } else if (msg.type === 'mode') setMode(msg.mode);
      else if (msg.type === 'config') globe.cfg = msg;
      else if (msg.type === 'lens') { lens = msg.lens || 'normal'; applyLens(); }
      else if (msg.type === 'recenter') {
        follow = true; post({type:'follow', on:true}); globe.recenter();
        if (last) map.easeTo({ center:last, zoom: Math.max(map.getZoom(), CAMERA[mode].zoom - 0.5), duration:600 });
      } else if (msg.type === 'padding') {
        document.documentElement.style.setProperty('--attr-bottom', (msg.bottom || 0) + 'px');
        map.setPadding({ top: msg.top || 0, bottom: msg.bottom || 0, left: 0, right: 0 });
      } else if (msg.type === 'flyTo') {
        follow = false; post({type:'follow', on:false}); globe.flyTo(msg.lng, msg.lat);
        map.flyTo({ center:[msg.lng, msg.lat], zoom: msg.zoom || 17, duration:1200 });
      }
    } catch (e) { post({type:'error', msg: e.message}); }
  };
  map.on('load', () => post({ type:'ready' }));
})();
</script></body></html>`;

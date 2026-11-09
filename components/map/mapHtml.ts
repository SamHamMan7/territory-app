// The map runs MapLibre GL JS inside a WebView, so the app still works in Expo Go.
// Street view: standard OpenStreetMap tiles. 3D view: OpenStreetMap data via OpenFreeMap
// vector tiles. God's Eye imagery: Esri World Imagery.
// RN -> web: window.__recv(msg)   web -> RN: ReactNativeWebView.postMessage(json)

export const MAPLIBRE_VERSION = '4.7.1';

export const mapHtml = /* html */ `<!doctype html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<link href="https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css" rel="stylesheet" />
<script src="https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js"></script>
<style>
  html,body,#map{margin:0;height:100%;width:100%;background:#0b0d12;overflow:hidden}
  .maplibregl-ctrl-attrib{font-size:9px;opacity:.7}
  .me{width:18px;height:18px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 0 var(--c);animation:pulse 1.8s infinite}
  @keyframes pulse{0%{box-shadow:0 0 0 0 var(--c)}70%{box-shadow:0 0 0 18px transparent}100%{box-shadow:0 0 0 0 transparent}}
  .bot{width:22px;height:22px;border-radius:50%;border:2px solid #0b0d12;color:#0b0d12;font:800 11px system-ui;display:flex;align-items:center;justify-content:center}
  .poi{display:flex;flex-direction:column;align-items:center;cursor:pointer;transform-origin:bottom center}
  .poi .b{width:30px;height:30px;border-radius:50%;background:rgba(15,18,26,.88);display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid #3a4152;position:relative}
  .poi .crown{position:absolute;top:-9px;right:-7px;font-size:11px}
  .poi .lv{font:700 9px system-ui;color:#fff;background:rgba(0,0,0,.6);padding:1px 4px;border-radius:6px;margin-top:2px;max-width:90px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .poi.small .b{width:22px;height:22px;font-size:12px}
  .poi.small .lv{display:none}
  .ring{position:absolute;inset:-5px;border-radius:50%}
</style></head>
<body><div id="map"></div>
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
      { id:'shade', type:'background', paint:{'background-color':'#000','background-opacity':0.18} },
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
    add({ id:'terr-fill', type:'fill', source:'terr', paint:{ 'fill-color':['get','color'], 'fill-opacity':['case',['get','mine'], g?0.45:0.38, g?0.35:0.26] }});
    add({ id:'terr-glow', type:'line', source:'terr', paint:{ 'line-color':['get','color'], 'line-width': g?10:6, 'line-blur': g?8:5, 'line-opacity':0.55 }});
    add({ id:'terr-line', type:'line', source:'terr', paint:{ 'line-color':['get','color'], 'line-width':2 }});
    add({ id:'shield-line', type:'line', source:'shields', paint:{ 'line-color':'#ffffff', 'line-width':1.5, 'line-dasharray':[1,2], 'line-opacity':0.7 }});
    add({ id:'trail-glow', type:'line', source:'trails', layout:{'line-cap':'round','line-join':'round'}, paint:{ 'line-color':['get','color'], 'line-width':10, 'line-blur':6, 'line-opacity':0.5 }});
    add({ id:'trail-line', type:'line', source:'trails', layout:{'line-cap':'round','line-join':'round'}, paint:{ 'line-color':['get','color'], 'line-width':4, 'line-dasharray':[2,1.2] }});
    add({ id:'target-line', type:'line', source:'target', paint:{ 'line-color':'#00f0ff', 'line-width':2, 'line-dasharray':[2,2] }});
  }
  map.on('style.load', () => { addOverlay(); setTimeout(scanPois, 600); });
  // belt & braces: if a style swap ever drops our layers, put them back
  map.on('styledata', () => { if (map.isStyleLoaded() && !map.getLayer('terr-fill')) addOverlay(); });

  // ---- markers ----
  const meEl = document.createElement('div'); meEl.className = 'me';
  const meMarker = new maplibregl.Marker({element: meEl});
  const bots = {}; const pois = {};

  function setMe(me){
    if (!me) return;
    meEl.style.background = me.color; meEl.style.setProperty('--c', me.color + 'aa');
    meMarker.setLngLat([me.lng, me.lat]); if (!meMarker._map) meMarker.addTo(map);
    heading = me.heading ?? heading;
    const first = !last;
    const moved = first || Math.abs(last[0]-me.lng) + Math.abs(last[1]-me.lat) > 1e-7;
    last = [me.lng, me.lat];
    if (first) { map.jumpTo({ center:last }); setTimeout(scanPois, 1500); return; }
    if (follow && moved) map.easeTo({ center:last, bearing: mode==='tilt' ? heading : map.getBearing(), duration:700 });
  }
  function setBots(list){
    const seen = {};
    for (const b of list) {
      seen[b.id] = 1;
      let m = bots[b.id];
      if (!m) { const el = document.createElement('div'); el.className = 'bot'; m = bots[b.id] = new maplibregl.Marker({element: el}).setLngLat([b.lng,b.lat]).addTo(map); }
      const el = m.getElement(); el.style.background = b.color; el.textContent = b.name[0];
      m.setLngLat([b.lng, b.lat]);
    }
    for (const id in bots) if (!seen[id]) { bots[id].remove(); delete bots[id]; }
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
      b.style.borderColor = p.tierColor || (p.holderColor || '#3a4152');
      const pr = Math.round((p.progress||0)*360);
      el.querySelector('.ring').style.background = pr > 0 ? 'conic-gradient(#00f0ff ' + pr + 'deg, transparent 0)' : 'none';
      el.querySelector('.ring').style.mask = 'radial-gradient(circle, transparent 62%, #000 64%)';
      el.querySelector('.ring').style.webkitMask = 'radial-gradient(circle, transparent 62%, #000 64%)';
      el.querySelector('.lv').textContent = p.badge ? (p.tierName + ' · ' + p.laps + (p.laps===1?' lap':' laps')) : p.name;
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
    const cam = CAMERA[m];
    map.easeTo({ pitch:cam.pitch, zoom:cam.zoom, bearing: m==='tilt' ? heading : 0, center: last || map.getCenter(), duration:900 });
  }

  window.__recv = (msg) => {
    try {
      if (msg.type === 'world') {
        for (const k of ['terr','trails','shields','target']) { data[k] = msg[k] || empty; const s = map.getSource(k); if (s) s.setData(data[k]); }
        setBots(msg.bots || []);
        lastPoiList = msg.pois || []; setPois(lastPoiList);
        setMe(msg.me);
      } else if (msg.type === 'mode') setMode(msg.mode);
      else if (msg.type === 'recenter') {
        follow = true; post({type:'follow', on:true});
        if (last) map.easeTo({ center:last, zoom: Math.max(map.getZoom(), CAMERA[mode].zoom - 0.5), duration:600 });
      } else if (msg.type === 'flyTo') {
        follow = false; post({type:'follow', on:false});
        map.flyTo({ center:[msg.lng, msg.lat], zoom: msg.zoom || 17, duration:1200 });
      }
    } catch (e) { post({type:'error', msg: e.message}); }
  };
  map.on('load', () => post({ type:'ready' }));
})();
</script></body></html>`;

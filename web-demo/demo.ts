// Browser demo: the real game engine + the real map page, with a simulated walker.
// Build: npm run demo:build  →  web-demo/index.html
import { BadgeState, emptyBadges, lapProgress, nextTier, tierFor, trackLaps } from '../game/badges';
import { CONFIG, MY_COLOR } from '../game/config';
import { GameEvent, World, areaOf, newPlayer, plantHome, processFix } from '../game/engine';
import { LngLat, distance, offset, pathLength, pointInMulti, projector } from '../game/geo';
import { Place, makePlace } from '../game/places';
import { buildMapMessage } from '../game/render';

declare global {
  interface Window { __recv?: (m: any) => void; __demo: any; ReactNativeWebView: { postMessage: (s: string) => void } }
}

const ME = 'me';
const START: LngLat = [-95.39555, 29.74405]; // Montrose, Houston — next to a real McDonald's
const world: World = { players: {} };
const me = newPlayer(ME, 'You', MY_COLOR, false);
world.players[ME] = me;
const badges: BadgeState = emptyBadges();
const places: Record<string, Place> = {};
let target: Place | null = null;
let selected: Place | null = null;
let now = Date.now();
let turbo = 4;
let pos: LngLat = START;
let queue: LngLat[] = [];
let heading = 0;
let mode = 'street';

// ---------- bridge from the map page ----------
window.ReactNativeWebView = {
  postMessage(s: string) {
    const m = JSON.parse(s);
    if (m.type === 'pois') for (const raw of m.items) { const p = makePlace(raw); places[p.id] ??= p; }
    if (m.type === 'tap') { queue = [[m.lng, m.lat]]; autoplay = false; selected = null; }
    if (m.type === 'poi') { selected = places[m.id] ?? null; }
  },
};
const send = (m: object) => window.__recv?.(m);

// ---------- HUD ----------
const $ = (id: string) => document.getElementById(id)!;
const tones: Record<string, string> = { good: '#16a34a', bad: '#e11d48', gold: '#b7791f', info: '#2b7cff' };
let toastTimer: any;
function toast(text: string, tone = 'info') {
  const el = $('toast');
  el.style.display = 'none'; void el.offsetWidth; el.style.display = 'flex';
  (el.firstElementChild as HTMLElement).style.background = tones[tone];
  el.lastElementChild!.textContent = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.style.display = 'none'), 3800);
}
const fmt = (m2: number) => (m2 >= 10000 ? `${(m2 / 10000).toFixed(2)} ha` : `${Math.round(m2).toLocaleString()} m²`);

function narrate(events: GameEvent[]) {
  for (const e of events) {
    if (e.type === 'claim' && e.playerId === ME) toast(`+${fmt(e.area)} captured`, 'good');
    else if (e.type === 'trail-broken' && e.playerId === ME) toast('Too fast — trail dropped', 'bad');
  }
}

function renderHud() {
  $('land').textContent = fmt(areaOf(me));
  const bl = Object.values(badges.places);
  $('bsum').textContent = `${bl.length} ${bl.length === 1 ? 'badge' : 'badges'} · ${bl.reduce((n, b) => n + b.laps, 0)} laps`;
  const inside = !!me.pos && pointInMulti(me.pos, me.territory);
  const trailM = me.trail.length > 1 ? pathLength([...me.trail, me.pos!]) : 0;
  const [icon, color, text] = me.tooFast ? ['directions_car', '#e11d48', 'Too fast — slow down to a walk']
    : trailM ? ['gesture', '#2b7cff', `Drawing ${Math.round(trailM)} m · head back to your land`]
    : inside ? ['home', '#16a34a', 'In your land'] : ['directions_walk', '#16a34a', 'Walking'];
  $('sicon').textContent = icon; $('sicon').style.color = color; $('status').textContent = text;
  document.querySelectorAll<HTMLElement>('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
  document.querySelectorAll<HTMLElement>('[data-turbo]').forEach((b) => b.classList.toggle('on', Number(b.dataset.turbo) === turbo));
  // place card replaces the stats card, like the app
  $('place').style.display = selected ? 'block' : 'none';
  $('stats').style.display = selected ? 'none' : 'flex';
  if (selected) {
    const b = badges.places[selected.id];
    const laps = b?.laps ?? 0;
    const tier = tierFor(laps), next = nextTier(laps);
    const d = distance(pos, [selected.lng, selected.lat]);
    $('pemoji').textContent = selected.emoji;
    $('pemoji').style.borderColor = tier?.color ?? '#e5e7eb';
    $('pname').textContent = selected.name;
    $('pmeta').textContent = `${selected.category.replace(/_/g, ' ')} · ${Math.round(d)} m`;
    $('ptier').textContent = tier ? `${tier.name} badge` : 'No badge yet';
    $('ptier').style.color = tier?.color ?? '#6b7280';
    $('plaps').textContent = `${laps} ${laps === 1 ? 'lap' : 'laps'}${next ? ` · ${next.laps - laps} more for ${next.name}` : ''}`;
    $('pbar').style.width = `${lapProgress(badges, selected.id) * 100}%`;
  }
}

// ---------- game loop ----------
function feed(p: LngLat) {
  const prev = me.pos;
  narrate(processFix(world, ME, { lng: p[0], lat: p[1], accuracy: 5, t: now }));
  if (prev && me.pos && me.pos !== prev) {
    const { toXY } = projector(prev);
    const [x, y] = toXY(me.pos);
    heading = (Math.atan2(x, y) * 180) / Math.PI;
  }
  const near = Object.values(places).filter((pl) => distance(p, [pl.lng, pl.lat]) < CONFIG.LAP_MAX_RADIUS_M + 20);
  for (const lap of trackLaps(badges, p, near, now)) {
    if (lap.tierUp) toast(`🏅 ${lap.place.name} badge → ${lap.tierUp.name}!`, 'gold');
    else toast(`${lap.place.emoji} Lap ${lap.laps} around ${lap.place.name}`, 'good');
    if (target?.id === lap.place.id) target = null;
  }
}

const TICK = 200;
setInterval(() => {
  const dt = TICK * turbo;
  now += dt;
  if (queue.length) {
    const dest = queue[0];
    const step = 1.35 * (dt / 1000);
    const d = distance(pos, dest);
    if (d <= step) { pos = dest; queue.shift(); }
    else { const { toXY } = projector(pos); const [x, y] = toXY(dest); pos = offset(pos, (x / d) * step, (y / d) * step); }
    feed(pos);
  } else if (autoplay) nextScene();
}, TICK);

setInterval(() => {
  send(buildMapMessage({ world, meId: ME, places: nearest(120), badges, target, heading, now }));
  renderHud();
}, 250);

function nearest(n: number) {
  return Object.values(places)
    .map((p) => ({ p, d: distance(pos, [p.lng, p.lat]) }))
    .filter((x) => x.d < 700 || badges.places[x.p.id] || target?.id === x.p.id)
    .sort((a, b) => a.d - b.d).slice(0, n).map((x) => x.p);
}

function lapPath(pl: Place, start = Math.PI): LngLat[] {
  const c: LngLat = [pl.lng, pl.lat];
  const pts: LngLat[] = [];
  for (let i = 0; i <= 14; i++) { const a = start + (i / 14) * Math.PI * 2; pts.push(offset(c, Math.cos(a) * 32, Math.sin(a) * 28)); }
  return pts;
}

// ---------- scripted tour so the demo plays itself ----------
let autoplay = true;
let scene = 0;
let mc: Place | undefined;
function findPlace(re: RegExp) {
  return Object.values(places).filter((p) => re.test(p.name)).sort((a, b) => distance(pos, [a.lng, a.lat]) - distance(pos, [b.lng, b.lat]))[0];
}
function nextScene() {
  const s = scene++;
  if (s === 0) { toast('Home base planted — walk out and loop back', 'info'); queue = [offset(START, 0, 2)]; }
  else if (s === 1) queue = [offset(START, 0, 45), offset(START, 55, 45), offset(START, 55, -10), offset(START, 5, -5)];
  else if (s === 2) {
    mc = findPlace(/McDonald/) ?? findPlace(/./);
    if (!mc) { scene = 3; return; }
    selected = mc; target = mc;
    queue = [...lapPath(mc, Math.PI * 0.9), offset(START, 20, 0)];
  } else if (s === 3) { // a bigger loop the other way
    selected = null;
    queue = [offset(START, -10, -20), offset(START, -70, -30), offset(START, -80, 40), offset(START, -15, 50), offset(START, -2, 10)];
  } else if (s === 4 && mc) { // second lap → progress toward Silver
    selected = mc;
    queue = [...lapPath(mc, Math.PI * 0.9), offset(START, 20, 0)];
  } else { autoplay = false; selected = null; toast('Your turn — click the map to walk there', 'info'); }
}

// ---------- controls ----------
const layers = $('layers');
$('layersBtn').addEventListener('click', () => {
  const open = layers.style.display !== 'block';
  layers.style.display = open ? 'block' : 'none';
  $('layersBtn').classList.toggle('on', open);
});
document.querySelectorAll<HTMLElement>('[data-mode]').forEach((b) =>
  b.addEventListener('click', () => { setMode(b.dataset.mode!); layers.style.display = 'none'; $('layersBtn').classList.remove('on'); }));
document.querySelectorAll<HTMLElement>('[data-turbo]').forEach((b) =>
  b.addEventListener('click', () => { turbo = Number(b.dataset.turbo); }));
$('recenter').addEventListener('click', () => send({ type: 'recenter' }));
$('pclose').addEventListener('click', () => { selected = null; });
$('plap').addEventListener('click', () => { if (selected) { autoplay = false; target = selected; queue = lapPath(selected); } });
$('placesBtn').addEventListener('click', () => { const p = nearest(1)[0]; if (p) { selected = p; send({ type: 'flyTo', lng: p.lng, lat: p.lat }); } });
function setMode(m: string) { mode = m; send({ type: 'mode', mode: m }); }

// keep the map focus clear of the bottom card, and the OSM credit visible
new ResizeObserver(() => send({ type: 'padding', top: 70, bottom: $('bottom').offsetHeight + 20 })).observe($('bottom'));

// ---------- start ----------
plantHome(me, START);
feed(START);
window.__demo = { world, badges, places, setMode, setTurbo: (t: number) => { turbo = t; }, get scene() { return scene; } };

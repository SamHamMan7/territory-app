// Browser demo: the real game engine + the real map page, with a simulated walker.
// Build: npm run demo:build  →  web-demo/index.html
import { BadgeState, emptyBadges, tierFor, trackLaps } from '../game/badges';
import { BotBrain, spawnBots, tickBots } from '../game/bots';
import { CONFIG } from '../game/config';
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
const me = newPlayer(ME, 'You', '#3dd6ff', false);
world.players[ME] = me;
let brains: BotBrain[] = [];
const badges: BadgeState = emptyBadges();
const places: Record<string, Place> = {};
let target: Place | null = null;
let now = Date.now();
let turbo = 3;
let pos: LngLat = START;
let queue: LngLat[] = [];
let heading = 0;
let mode = 'street';

// ---------- bridge from the map page ----------
window.ReactNativeWebView = {
  postMessage(s: string) {
    const m = JSON.parse(s);
    if (m.type === 'pois') for (const raw of m.items) { const p = makePlace(raw); places[p.id] ??= p; }
    if (m.type === 'tap') { queue = [[m.lng, m.lat]]; autoplay = false; }
    if (m.type === 'poi') lapAround(places[m.id]);
  },
};
const send = (m: object) => window.__recv?.(m);

// ---------- HUD ----------
const $ = (id: string) => document.getElementById(id)!;
function toast(text: string, tone = 'info') {
  const el = document.createElement('div');
  el.className = 'toast ' + tone;
  el.textContent = text;
  $('feed').appendChild(el);
  setTimeout(() => el.remove(), 4200);
  while ($('feed').children.length > 4) $('feed').firstChild!.remove();
}
const fmt = (m2: number) => (m2 >= 10000 ? `${(m2 / 10000).toFixed(2)} ha` : `${Math.round(m2).toLocaleString()} m²`);
const nameOf = (id: string) => world.players[id]?.name ?? '?';

function narrate(events: GameEvent[]) {
  for (const e of events) {
    if (e.type === 'claim' && e.playerId === ME) {
      toast(`+${fmt(e.area)} captured`, 'good');
      for (const s of e.stolen) toast(`Stole ${fmt(s.area)} from ${nameOf(s.from)}`, 'gold');
    } else if (e.type === 'claim') {
      const f = e.stolen.find((s) => s.from === ME);
      if (f) toast(`${nameOf(e.playerId)} stole ${fmt(f.area)} from you!`, 'bad');
    } else if (e.type === 'cut' && e.by === ME) toast(`✂️ You cut ${nameOf(e.victim)}'s trail`, 'gold');
    else if (e.type === 'trail-broken' && e.playerId === ME) toast('🚗 Too fast — trail dropped', 'bad');
    else if (e.type === 'eliminated' && e.by === ME) toast(`💥 You wiped out ${nameOf(e.playerId)}!`, 'gold');
  }
}

function renderHud() {
  const board = Object.values(world.players).map((p) => ({ p, a: areaOf(p) })).sort((x, y) => y.a - x.a);
  const rank = board.findIndex((b) => b.p.id === ME) + 1;
  $('land').textContent = fmt(areaOf(me));
  $('rank').innerHTML = `#${rank}<small>/${board.length}</small>`;
  $('board').innerHTML = board
    .map((b, i) => `<div class="lb"><b>${i + 1}</b><i style="background:${b.p.color}"></i><span>${b.p.name}${b.p.isBot ? ' 🤖' : ''}</span><em>${fmt(b.a)}</em></div>`)
    .join('');
  const bl = Object.values(badges.places).sort((a, b) => b.laps - a.laps);
  $('badges').innerHTML = bl.length
    ? bl.map((b) => { const t = tierFor(b.laps)!; return `<div class="bd" style="border-color:${t.color}">${b.emoji} <span>${b.name}</span><em style="color:${t.color}">${t.name} · ${b.laps}</em></div>`; }).join('')
    : '<div class="dim">Walk all the way around a place to earn its badge.</div>';
  const inside = !!me.pos && pointInMulti(me.pos, me.territory);
  const trailM = me.trail.length > 1 ? pathLength([...me.trail, me.pos!]) : 0;
  $('status').textContent = me.tooFast ? '🚗 Too fast — slow to a walk'
    : trailM ? `✏️ Drawing · ${Math.round(trailM)} m · get back to your land!`
    : inside ? '🏠 In your land · walk out to draw' : `🚶 ${(me.speed * 3.6).toFixed(1)} km/h`;
  $('dot').style.background = trailM ? me.color : me.tooFast ? '#ff5c7a' : '#7cff6b';
  document.querySelectorAll<HTMLElement>('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
  document.querySelectorAll<HTMLElement>('[data-turbo]').forEach((b) => b.classList.toggle('on', Number(b.dataset.turbo) === turbo));
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
  // walker
  if (queue.length) {
    const dest = queue[0];
    const step = 1.35 * (dt / 1000);
    const d = distance(pos, dest);
    if (d <= step) { pos = dest; queue.shift(); }
    else { const { toXY } = projector(pos); const [x, y] = toXY(dest); pos = offset(pos, (x / d) * step, (y / d) * step); }
    feed(pos);
  } else if (autoplay) nextScene();
  // rivals
  if (brains.length) for (let t = 0; t < dt; t += 1000) narrate(tickBots(world, brains, ME, now - dt + t + 1000, 1000));
}, TICK);

setInterval(() => {
  const msg = buildMapMessage({ world, meId: ME, places: nearest(120), badges, target, heading, now });
  send(msg);
  renderHud();
}, 250);

function nearest(n: number) {
  return Object.values(places)
    .map((p) => ({ p, d: distance(pos, [p.lng, p.lat]) }))
    .filter((x) => x.d < 700 || badges.places[x.p.id] || target?.id === x.p.id)
    .sort((a, b) => a.d - b.d).slice(0, n).map((x) => x.p);
}

function lapAround(pl?: Place) {
  if (!pl) return;
  target = pl;
  autoplay = false;
  const c: LngLat = [pl.lng, pl.lat];
  const pts: LngLat[] = [];
  for (let i = 0; i <= 14; i++) { const a = Math.PI + (i / 14) * Math.PI * 2; pts.push(offset(c, Math.cos(a) * 32, Math.sin(a) * 26)); }
  queue = pts;
}

// ---------- scripted tour so the demo plays itself ----------
let autoplay = true;
let scene = 0;
function findPlace(re: RegExp) {
  return Object.values(places).filter((p) => re.test(p.name)).sort((a, b) => distance(pos, [a.lng, a.lat]) - distance(pos, [b.lng, b.lat]))[0];
}
function nextScene() {
  const s = scene++;
  if (s === 0) { toast('🏠 Home base planted. Walk out and loop back!', 'info'); queue = [offset(START, 0, 2)]; }
  else if (s === 1) { // a first loop out of home and back
    queue = [offset(START, 0, 45), offset(START, 55, 45), offset(START, 55, -10), offset(START, 5, -5)];
  } else if (s === 2) { // lap the McDonald's
    const mc = findPlace(/McDonald/) ?? findPlace(/./);
    if (mc) { toast(`🎯 Target: ${mc.name} — walk all the way around it`, 'info'); target = mc; const c: LngLat = [mc.lng, mc.lat];
      const pts: LngLat[] = []; for (let i = 0; i <= 14; i++) { const a = Math.PI * 0.9 + (i / 14) * Math.PI * 2; pts.push(offset(c, Math.cos(a) * 32, Math.sin(a) * 28)); }
      queue = [...pts, offset(START, 20, 0)]; } else scene = 3;
  } else if (s === 3) { // raid the nearest rival
    const rival = Object.values(world.players).filter((p) => p.isBot && p.territory.length)
      .sort((a, b) => distance(pos, a.pos!) - distance(pos, b.pos!))[0];
    if (rival) {
      toast(`⚔️ Raiding ${rival.name}'s land`, 'info');
      const r = rival.territory[0][0];
      let cx = 0, cy = 0; r.forEach((q) => { cx += q[0]; cy += q[1]; }); const c: LngLat = [cx / r.length, cy / r.length];
      const { toXY } = projector(START); const [x, y] = toXY(c); const L = Math.hypot(x, y); const ux = x / L, uy = y / L;
      queue = [offset(START, -uy * 20, ux * 20), offset(c, -uy * 30, ux * 30), offset(c, ux * 30 + uy * 30, uy * 30 - ux * 30), offset(START, uy * 20, -ux * 20), START];
    }
  } else { autoplay = false; toast('Your turn — click the map to walk there', 'info'); }
}

// ---------- controls ----------
document.querySelectorAll<HTMLElement>('[data-mode]').forEach((b) =>
  b.addEventListener('click', () => { mode = b.dataset.mode!; send({ type: 'mode', mode }); }));
document.querySelectorAll<HTMLElement>('[data-turbo]').forEach((b) =>
  b.addEventListener('click', () => { turbo = Number(b.dataset.turbo); }));
$('recenter').addEventListener('click', () => send({ type: 'recenter' }));

// ---------- start ----------
function start() {
  plantHome(me, START);
  feed(START);
  // rivals spawn close by so the demo has action
  brains = spawnBots(world, offset(START, 40, 60), now, me.color);
  for (const b of brains) b.aggression = 0.5;
  // let rivals build up some land first, then let their shields wear off
  for (let t = 0; t < 12 * 60_000; t += 1000) tickBots(world, brains, ME, now + t, 1000);
  now += 12 * 60_000 + CONFIG.SHIELD_MS;
}
start();
window.__demo = { world, badges, places, setTurbo: (t: number) => { turbo = t; }, setMode: (m: string) => { mode = m; send({ type: 'mode', mode: m }); }, get scene() { return scene; } };

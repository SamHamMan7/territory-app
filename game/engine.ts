// Core paper.io-style rules, adapted for walking. Pure logic: no React, no I/O.
import { CONFIG } from './config';
import {
  LngLat, MultiPolygon, circle, closeRing, difference, distToMultiEdge, distance, dropSlivers,
  fillHoles, intersection, multiAreaM2, pathLength, pointInMulti, segmentIntersection, union,
} from './geo';

export type Shield = { poly: MultiPolygon; until: number };

export type Player = {
  id: string;
  name: string;
  color: string;
  isBot: boolean;
  territory: MultiPolygon;
  shields: Shield[];
  trail: LngLat[];
  pos: LngLat | null;
  lastT: number;
  speed: number; // smoothed m/s
  tooFast: boolean;
  stats: { captured: number; stolen: number; lost: number };
};

export type World = { players: Record<string, Player> };

export type Fix = { lng: number; lat: number; accuracy?: number | null; t: number };

export type GameEvent =
  | { type: 'claim'; playerId: string; area: number; stolen: { from: string; area: number }[] }
  | { type: 'trail-broken'; playerId: string; reason: 'too-fast' | 'gps-gap' }
  | { type: 'trail-started'; playerId: string }
  | { type: 'eliminated'; playerId: string; by: string };

export function newPlayer(id: string, name: string, color: string, isBot: boolean): Player {
  return {
    id, name, color, isBot,
    territory: [], shields: [], trail: [], pos: null, lastT: 0, speed: 0, tooFast: false,
    stats: { captured: 0, stolen: 0, lost: 0 },
  };
}

/** Give a player their starter base at a location (permanently shielded). */
export function plantHome(p: Player, at: LngLat) {
  const home = [circle(at, CONFIG.HOME_RADIUS_M, 20)];
  p.territory = union(p.territory, home);
  p.shields.push({ poly: home, until: Number.MAX_SAFE_INTEGER });
}

export function areaOf(p: Player) {
  return multiAreaM2(p.territory);
}

function activeShields(p: Player, now: number): MultiPolygon {
  p.shields = p.shields.filter((s) => s.until > now);
  return union(...p.shields.map((s) => s.poly));
}

/** Process one GPS fix for one player. Mutates the world, returns what happened. */
export function processFix(world: World, playerId: string, fix: Fix): GameEvent[] {
  const me = world.players[playerId];
  if (!me) return [];
  const events: GameEvent[] = [];
  if (fix.accuracy != null && fix.accuracy > CONFIG.MAX_ACCURACY_M) return events;

  const pos: LngLat = [fix.lng, fix.lat];
  const prev = me.pos;

  // First fix ever / after reset.
  if (!prev) {
    me.pos = pos;
    me.lastT = fix.t;
    return events;
  }

  const step = distance(prev, pos);
  const dt = Math.max(0.001, (fix.t - me.lastT) / 1000);

  // Long GPS gap: we can't know where you went, so the trail ends.
  if (fix.t - me.lastT > CONFIG.GAP_RESET_MS) {
    if (me.trail.length) events.push({ type: 'trail-broken', playerId, reason: 'gps-gap' });
    me.trail = [];
    me.pos = pos;
    me.lastT = fix.t;
    me.speed = 0;
    return events;
  }

  if (step < CONFIG.MIN_STEP_M) return events; // jitter

  // --- Walking-speed gate (smoothed, with hysteresis) ---
  const inst = step / dt;
  me.speed = me.speed ? me.speed + CONFIG.SPEED_SMOOTHING * (inst - me.speed) : Math.min(inst, CONFIG.MAX_SPEED_MS);
  me.pos = pos;
  me.lastT = fix.t;
  if (me.speed > CONFIG.MAX_SPEED_MS) {
    if (!me.tooFast && me.trail.length) events.push({ type: 'trail-broken', playerId, reason: 'too-fast' });
    me.tooFast = true;
    me.trail = [];
    return events;
  }
  if (me.tooFast) {
    if (me.speed > CONFIG.RESUME_SPEED_MS) return events;
    me.tooFast = false;
  }

  const inside =
    me.territory.length > 0 &&
    (pointInMulti(pos, me.territory) || distToMultiEdge(pos, me.territory) <= CONFIG.SNAP_TO_TERRITORY_M);

  if (!me.trail.length) {
    if (!inside) {
      // Leaving home (or wandering with no land): start drawing.
      me.trail = [prev, pos];
      events.push({ type: 'trail-started', playerId });
    }
    return events;
  }

  // Back on your own land → close the loop through your territory.
  if (inside) {
    const loop = [...me.trail, pos];
    me.trail = [];
    claim(world, me, loop, fix.t, events);
    return events;
  }

  // Crossed your own trail → that loop is closed.
  const trail = me.trail;
  const last = trail[trail.length - 1];
  for (let i = 0; i < trail.length - 2; i++) {
    const hit = segmentIntersection(last, pos, trail[i], trail[i + 1]);
    if (hit) {
      const loop = [hit, ...trail.slice(i + 1), hit];
      me.trail = [hit, pos];
      claim(world, me, loop, fix.t, events);
      return events;
    }
  }

  // Grace zone: GPS rarely crosses exactly, so getting close to an older part of the trail counts.
  for (let i = 0; i < trail.length - 2; i++) {
    if (distance(pos, trail[i]) <= CONFIG.SNAP_TO_TRAIL_M && pathLength(trail, i) >= CONFIG.SNAP_MIN_LOOP_M) {
      const loop = [...trail.slice(i), pos];
      me.trail = [pos];
      claim(world, me, loop, fix.t, events);
      return events;
    }
  }

  trail.push(pos);
  if (trail.length > CONFIG.MAX_TRAIL_POINTS) trail.splice(0, trail.length - CONFIG.MAX_TRAIL_POINTS);
  return events;
}

/** Claim the area enclosed by `loop` (plus anything it fully surrounds), stealing from rivals. */
export function claim(world: World, me: Player, loop: LngLat[], now: number, events: GameEvent[]) {
  if (loop.length < 3) return;
  const ring = closeRing(loop);
  const before = me.territory;
  const grown = fillHoles(union(before, [[ring]]));
  let gained = difference(grown, before);

  // Shielded rival land can't be taken.
  const others = Object.values(world.players).filter((p) => p.id !== me.id);
  const protectedLand = union(...others.map((o) => intersection(activeShields(o, now), o.territory)));
  gained = dropSlivers(difference(gained, protectedLand));
  const gainedArea = multiAreaM2(gained);
  if (gainedArea < CONFIG.MIN_CLAIM_M2) return;

  const stolen: { from: string; area: number }[] = [];
  for (const o of others) {
    const taken = intersection(o.territory, gained);
    const a = multiAreaM2(taken);
    if (a < 1) continue;
    o.territory = dropSlivers(difference(o.territory, gained));
    o.stats.lost += a;
    stolen.push({ from: o.id, area: Math.round(a) });
    if (o.territory.length === 0) events.push({ type: 'eliminated', playerId: o.id, by: me.id });
  }

  me.territory = union(before, gained);
  me.shields.push({ poly: gained, until: now + CONFIG.SHIELD_MS });
  me.stats.captured += gainedArea;
  me.stats.stolen += stolen.reduce((s, x) => s + x.area, 0);
  events.push({ type: 'claim', playerId: me.id, area: Math.round(gainedArea), stolen });
}

/** Is this point currently protected for its owner? */
export function isShielded(p: Player, at: LngLat, now: number) {
  return p.shields.some((s) => s.until > now && pointInMulti(at, s.poly));
}

export function ownerAt(world: World, at: LngLat): Player | null {
  for (const p of Object.values(world.players)) if (pointInMulti(at, p.territory)) return p;
  return null;
}

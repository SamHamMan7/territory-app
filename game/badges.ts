// Landmark laps: walk all the way around a place to earn/level its badge.
// Uses a winding-angle tracker, so it works for any loop shape and tolerates GPS wobble.
import { CONFIG } from './config';
import { LngLat, bearing, distance } from './geo';
import type { Place } from './places';

export type PlaceBadge = {
  placeId: string;
  name: string;
  brand: string | null;
  category: string;
  emoji: string;
  lng: number;
  lat: number;
  laps: number;
  firstAt: number;
  lastAt: number;
};

export type Winding = { angle: number; last: number };
export type BadgeState = { places: Record<string, PlaceBadge>; winding: Record<string, Winding> };

export const emptyBadges = (): BadgeState => ({ places: {}, winding: {} });

export type LapEvent = { place: Place; laps: number; tierUp: Tier | null };
export type Tier = (typeof CONFIG.LAP_TIERS)[number];

export function tierFor(laps: number): Tier | null {
  let t: Tier | null = null;
  for (const tier of CONFIG.LAP_TIERS) if (laps >= tier.laps) t = tier;
  return t;
}

export function nextTier(laps: number): Tier | null {
  return CONFIG.LAP_TIERS.find((t) => t.laps > laps) ?? null;
}

/** Fraction (0..1) of the current lap completed around a place. */
export function lapProgress(state: BadgeState, placeId: string) {
  const w = state.winding[placeId];
  return w ? Math.min(1, Math.abs(w.angle) / (Math.PI * 2)) : 0;
}

/** Feed a new position; returns any laps completed. */
export function trackLaps(state: BadgeState, pos: LngLat, places: Place[], now: number): LapEvent[] {
  const out: LapEvent[] = [];
  const nearby = new Set<string>();
  for (const pl of places) {
    const c: LngLat = [pl.lng, pl.lat];
    const d = distance(pos, c);
    if (d > CONFIG.LAP_MAX_RADIUS_M || d < CONFIG.LAP_MIN_RADIUS_M) continue;
    nearby.add(pl.id);
    const b = bearing(c, pos);
    const w = state.winding[pl.id];
    if (!w) {
      state.winding[pl.id] = { angle: 0, last: b };
      continue;
    }
    let delta = b - w.last;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    w.last = b;
    // A huge jump means we cut across the middle / GPS teleport — don't count it.
    if (Math.abs(delta) > Math.PI * 0.6) continue;
    w.angle += delta;
    if (Math.abs(w.angle) >= Math.PI * 2) {
      w.angle -= Math.sign(w.angle) * Math.PI * 2;
      const prev = state.places[pl.id];
      const laps = (prev?.laps ?? 0) + 1;
      state.places[pl.id] = {
        placeId: pl.id, name: pl.name, brand: pl.brand, category: pl.category, emoji: pl.emoji,
        lng: pl.lng, lat: pl.lat, laps, firstAt: prev?.firstAt ?? now, lastAt: now,
      };
      const before = tierFor(laps - 1);
      const after = tierFor(laps);
      out.push({ place: pl, laps, tierUp: after && after !== before ? after : null });
    }
  }
  // Leaving the area resets partial progress.
  for (const id of Object.keys(state.winding)) if (!nearby.has(id)) delete state.winding[id];
  return out;
}

/** Brand collections, e.g. every McDonald's you've lapped. */
export function brandCollections(state: BadgeState) {
  const m: Record<string, { brand: string; emoji: string; locations: number; laps: number }> = {};
  for (const b of Object.values(state.places)) {
    if (!b.brand) continue;
    const e = (m[b.brand] ??= { brand: b.brand, emoji: b.emoji, locations: 0, laps: 0 });
    e.locations++;
    e.laps += b.laps;
  }
  return Object.values(m).sort((a, b) => b.laps - a.laps);
}

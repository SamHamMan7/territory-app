// Geometry helpers. All coordinates are GeoJSON order: [lng, lat].
import * as pc from 'polygon-clipping';

export type LngLat = [number, number];
export type Ring = LngLat[];
export type Polygon = Ring[];
export type MultiPolygon = Polygon[];

const R = 6371008.8;
const toRad = (d: number) => (d * Math.PI) / 180;

export function distance(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/** Local flat projection (meters) around an origin. Accurate to <0.5% within a few km. */
export function projector(origin: LngLat) {
  const kx = Math.cos(toRad(origin[1])) * 111320;
  const ky = 110574;
  return {
    toXY: (p: LngLat): [number, number] => [(p[0] - origin[0]) * kx, (p[1] - origin[1]) * ky],
    toLngLat: (x: number, y: number): LngLat => [origin[0] + x / kx, origin[1] + y / ky],
  };
}

/** Move a point by meters east/north. */
export function offset(p: LngLat, east: number, north: number): LngLat {
  return projector(p).toLngLat(east, north);
}

export function ringAreaM2(ring: Ring): number {
  if (ring.length < 3) return 0;
  const { toXY } = projector(ring[0]);
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = toXY(ring[i]);
    const [x2, y2] = toXY(ring[(i + 1) % ring.length]);
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a / 2);
}

export function polygonAreaM2(poly: Polygon): number {
  if (!poly.length) return 0;
  let a = ringAreaM2(poly[0]);
  for (let i = 1; i < poly.length; i++) a -= ringAreaM2(poly[i]);
  return Math.max(0, a);
}

export function multiAreaM2(mp: MultiPolygon): number {
  return mp.reduce((s, p) => s + polygonAreaM2(p), 0);
}

export function pointInRing(p: LngLat, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(p: LngLat, poly: Polygon): boolean {
  if (!poly.length || !pointInRing(p, poly[0])) return false;
  for (let i = 1; i < poly.length; i++) if (pointInRing(p, poly[i])) return false;
  return true;
}

export function pointInMulti(p: LngLat, mp: MultiPolygon): boolean {
  return mp.some((poly) => pointInPolygon(p, poly));
}

/** Intersection point of segments ab and cd, or null. */
export function segmentIntersection(a: LngLat, b: LngLat, c: LngLat, d: LngLat): LngLat | null {
  const r0 = b[0] - a[0], r1 = b[1] - a[1];
  const s0 = d[0] - c[0], s1 = d[1] - c[1];
  const denom = r0 * s1 - r1 * s0;
  if (denom === 0) return null;
  const qp0 = c[0] - a[0], qp1 = c[1] - a[1];
  const t = (qp0 * s1 - qp1 * s0) / denom;
  const u = (qp0 * r1 - qp1 * r0) / denom;
  if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
  return [a[0] + t * r0, a[1] + t * r1];
}

/** Distance (m) from p to segment ab. */
export function distToSegment(p: LngLat, a: LngLat, b: LngLat): number {
  const { toXY } = projector(p);
  const [ax, ay] = toXY(a);
  const [bx, by] = toXY(b);
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? -(ax * dx + ay * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/** Distance (m) from p to the nearest edge of a multipolygon (0 if none). */
export function distToMultiEdge(p: LngLat, mp: MultiPolygon): number {
  let best = Infinity;
  for (const poly of mp)
    for (const ring of poly)
      for (let i = 0; i < ring.length - 1; i++) best = Math.min(best, distToSegment(p, ring[i], ring[i + 1]));
  return best;
}

export function circle(center: LngLat, radiusM: number, steps = 24): Polygon {
  const ring: Ring = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ring.push(offset(center, Math.cos(a) * radiusM, Math.sin(a) * radiusM));
  }
  ring.push(ring[0]);
  return [ring];
}

export function closeRing(pts: LngLat[]): Ring {
  const r = pts.slice();
  const f = r[0], l = r[r.length - 1];
  if (f[0] !== l[0] || f[1] !== l[1]) r.push([f[0], f[1]]);
  return r;
}

export function pathLength(pts: LngLat[], from = 0): number {
  let d = 0;
  for (let i = from + 1; i < pts.length; i++) d += distance(pts[i - 1], pts[i]);
  return d;
}

export function centroid(ring: Ring): LngLat {
  let x = 0, y = 0;
  const n = ring.length > 1 ? ring.length - 1 : ring.length;
  for (let i = 0; i < n; i++) { x += ring[i][0]; y += ring[i][1]; }
  return [x / n, y / n];
}

// ---- Boolean ops (wrapped so a degenerate GPS shape never crashes the game) ----
const clean = (mp: MultiPolygon) => mp.filter((p) => p.length && p[0].length >= 4) as MultiPolygon;

export function union(...g: MultiPolygon[]): MultiPolygon {
  const parts = g.filter((x) => x.length);
  if (!parts.length) return [];
  try { return clean(pc.union(parts[0] as any, ...(parts.slice(1) as any)) as MultiPolygon); }
  catch { return parts[0]; }
}

export function difference(a: MultiPolygon, ...b: MultiPolygon[]): MultiPolygon {
  const clips = b.filter((x) => x.length);
  if (!a.length) return [];
  if (!clips.length) return a;
  try { return clean(pc.difference(a as any, ...(clips as any)) as MultiPolygon); }
  catch { return a; }
}

export function intersection(a: MultiPolygon, b: MultiPolygon): MultiPolygon {
  if (!a.length || !b.length) return [];
  try { return clean(pc.intersection(a as any, b as any) as MultiPolygon); }
  catch { return []; }
}

/** Paper.io rule: anything fully enclosed by your land becomes yours. */
export function fillHoles(mp: MultiPolygon): MultiPolygon {
  return mp.map((p) => [p[0]]);
}

/** Drop slivers smaller than minM2 (GPS noise). */
export function dropSlivers(mp: MultiPolygon, minM2 = 4): MultiPolygon {
  return mp.filter((p) => polygonAreaM2(p) >= minM2);
}

export function bearing(from: LngLat, to: LngLat): number {
  const { toXY } = projector(from);
  const [x, y] = toXY(to);
  return Math.atan2(y, x);
}

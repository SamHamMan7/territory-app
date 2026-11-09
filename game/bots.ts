// Simulated free-for-all rivals so the world feels alive before there's a real server.
// They walk at human speed and play by exactly the same rules (same engine).
import { CONFIG, PLAYER_COLORS } from './config';
import { GameEvent, World, newPlayer, plantHome, processFix } from './engine';
import { LngLat, centroid, distance, offset, projector } from './geo';

export type BotBrain = {
  id: string;
  waypoints: LngLat[];
  idleUntil: number;
  aggression: number; // 0..1 chance an excursion targets the human
  respawnAt: number | null;
  at: LngLat; // true walking position (engine only records moves >= MIN_STEP_M)
};

const NAMES = ['Nova', 'Rook', 'Zephyr', 'Mango', 'Pixel', 'Juno'];
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function spawnBots(world: World, around: LngLat, now: number, humanColor: string): BotBrain[] {
  const colors = PLAYER_COLORS.filter((c) => c !== humanColor);
  const brains: BotBrain[] = [];
  for (let i = 0; i < CONFIG.BOT_COUNT; i++) {
    const id = `bot_${i}`;
    const p = newPlayer(id, NAMES[i % NAMES.length], colors[i % colors.length], true);
    world.players[id] = p;
    const b: BotBrain = { id, waypoints: [], idleUntil: now + rand(3000, 15000), aggression: rand(0.15, 0.45), respawnAt: null, at: around };
    placeBot(world, b, around, now);
    brains.push(b);
  }
  return brains;
}

function placeBot(world: World, b: BotBrain, around: LngLat, now: number) {
  const p = world.players[b.id];
  const a = rand(0, Math.PI * 2);
  const d = rand(140, 380);
  const home = offset(around, Math.cos(a) * d, Math.sin(a) * d);
  p.territory = [];
  p.shields = [];
  p.trail = [];
  plantHome(p, home);
  p.pos = home;
  b.at = home;
  p.lastT = now;
  p.speed = 0;
  b.waypoints = [];
  b.respawnAt = null;
}

function planExcursion(world: World, b: BotBrain, humanId: string) {
  const start = b.at;
  let theta = rand(0, Math.PI * 2);
  let out = rand(25, 70);
  const side = rand(20, 55) * (Math.random() < 0.5 ? 1 : -1);

  const human = world.players[humanId];
  if (human?.territory.length && Math.random() < b.aggression) {
    // Raid: aim the loop at the nearest chunk of the human's land.
    const targets = human.territory.map((poly) => centroid(poly[0]));
    targets.sort((x, y) => distance(start, x) - distance(start, y));
    const t = targets[0];
    const d = distance(start, t);
    if (d < 450) {
      const { toXY } = projector(start);
      const [x, y] = toXY(t);
      theta = Math.atan2(y, x);
      out = Math.min(d + 25, 220);
    }
  }
  const ux = Math.cos(theta), uy = Math.sin(theta);
  const px = -uy, py = ux;
  const p1 = offset(start, ux * out, uy * out);
  const p2 = offset(p1, px * side, py * side);
  const p3 = offset(start, px * side * 0.5, py * side * 0.5);
  b.waypoints = [p1, p2, p3, start];
}

/** Advance all bots by dtMs of game time. */
export function tickBots(world: World, brains: BotBrain[], humanId: string, now: number, dtMs: number): GameEvent[] {
  const events: GameEvent[] = [];
  const human = world.players[humanId];
  for (const b of brains) {
    const me = world.players[b.id];
    if (!me) continue;

    if (me.territory.length === 0) {
      if (b.respawnAt == null) b.respawnAt = now + 60_000;
      if (now >= b.respawnAt && human?.pos) placeBot(world, b, human.pos, now);
      continue;
    }
    if (!b.waypoints.length) {
      if (now < b.idleUntil) continue;
      planExcursion(world, b, humanId);
    }
    const target = b.waypoints[0];
    const pos = b.at;
    const d = distance(pos, target);
    const stepM = CONFIG.BOT_SPEED_MS * (dtMs / 1000);
    let next: LngLat;
    if (d <= stepM) {
      next = target;
      b.waypoints.shift();
      if (!b.waypoints.length) b.idleUntil = now + rand(5000, 25000);
    } else {
      const { toXY } = projector(pos);
      const [x, y] = toXY(target);
      const wob = rand(-0.12, 0.12);
      const ang = Math.atan2(y, x) + wob;
      next = offset(pos, Math.cos(ang) * stepM, Math.sin(ang) * stepM);
    }
    b.at = next;
    events.push(...processFix(world, b.id, { lng: next[0], lat: next[1], accuracy: 5, t: now }));
  }
  return events;
}

// Global game store + game loop. Screens read it with useGame(selector).
// Persistence is local (AsyncStorage) for now; a real multiplayer backend would replace
// `world` syncing here without touching the rules in engine.ts.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useSyncExternalStore } from 'react';

import { BadgeState, emptyBadges, trackLaps } from './badges';
import { CONFIG, MY_COLOR } from './config';
import { Fix, GameEvent, Player, World, areaOf, newPlayer, plantHome, processFix } from './engine';
import { LngLat, bearing, distance, offset, pathLength, pointInMulti, projector } from './geo';
import { Place, makePlace } from './places';

export type MapMode = 'street' | 'gods' | 'tilt';
export type Lens = 'normal' | 'nvg' | 'thermal' | 'crt';
export type FeedItem = { id: number; text: string; tone: 'good' | 'bad' | 'info' | 'gold' };

export type GameState = {
  loaded: boolean;
  meId: string;
  world: World;
  badges: BadgeState;
  places: Record<string, Place>;
  target: Place | null;
  selectedPlaceId: string | null;
  mode: MapMode;
  lens: Lens;
  follow: boolean;
  sim: { on: boolean; turbo: number; dest: LngLat | null };
  gps: { status: 'waiting' | 'ok' | 'denied' | 'error'; accuracy: number | null };
  heading: number;
  feed: FeedItem[];
  rev: number;
};

const ME = 'me';
const STORAGE_KEY = 'territory_v2';

let state: GameState = {
  loaded: false,
  meId: ME,
  world: { players: {} },
  badges: emptyBadges(),
  places: {},
  target: null,
  selectedPlaceId: null,
  mode: 'street',
  lens: 'normal',
  follow: true,
  sim: { on: false, turbo: 1, dest: null },
  gps: { status: 'waiting', accuracy: null },
  heading: 0,
  feed: [],
  rev: 0,
};

// ---------- tiny store ----------
const listeners = new Set<() => void>();
function emit() {
  state = { ...state, rev: state.rev + 1 };
  listeners.forEach((l) => l());
}
function set(patch: Partial<GameState>) {
  state = { ...state, ...patch };
  emit();
}
export const getState = () => state;
export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function useGame<T>(sel: (s: GameState) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state), () => sel(state));
}

// ---------- game clock (turbo in sim mode fast-forwards game time) ----------
let clockOffset = 0;
export const gameNow = () => Date.now() + clockOffset;

// ---------- feed ----------
let feedId = 1;
function toast(text: string, tone: FeedItem['tone'] = 'info') {
  const item = { id: feedId++, text, tone };
  state.feed = [...state.feed.slice(-3), item];
  setTimeout(() => {
    state.feed = state.feed.filter((f) => f.id !== item.id);
    emit();
  }, 4200);
}
const fmtArea = (m2: number) => (m2 >= 10000 ? `${(m2 / 10000).toFixed(2)} ha` : `${Math.round(m2).toLocaleString()} m²`);
export { fmtArea };

function nameOf(id: string) {
  return state.world.players[id]?.name ?? 'Someone';
}

function narrate(events: GameEvent[]) {
  for (const e of events) {
    switch (e.type) {
      case 'claim':
        if (e.playerId === ME) {
          toast(`+${fmtArea(e.area)} captured`, 'good');
          for (const s of e.stolen) toast(`Stole ${fmtArea(s.area)} from ${nameOf(s.from)}`, 'gold');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        } else {
          const fromMe = e.stolen.find((s) => s.from === ME);
          if (fromMe) {
            toast(`${nameOf(e.playerId)} stole ${fmtArea(fromMe.area)} from you!`, 'bad');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
          }
        }
        break;
      case 'trail-broken':
        if (e.playerId === ME)
          toast(e.reason === 'too-fast' ? '🚗 Too fast — trail dropped. Walk to capture!' : 'GPS lost — trail dropped', 'bad');
        break;
      case 'eliminated':
        if (e.by === ME) toast(`💥 You wiped out ${nameOf(e.playerId)}!`, 'gold');
        break;
    }
  }
}

// ---------- persistence ----------
let dirty = false;
async function save() {
  if (!dirty || !state.loaded) return;
  dirty = false;
  try {
    // keep stored places bounded: badge places + nearest 600
    const me = state.world.players[ME];
    let places = Object.values(state.places);
    if (me?.pos && places.length > 600) {
      places = places
        .map((p) => ({ p, d: distance(me.pos!, [p.lng, p.lat]) }))
        .sort((a, b) => a.d - b.d)
        .filter((x, i) => i < 600 || state.badges.places[x.p.id])
        .map((x) => x.p);
    }
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        v: 3, world: state.world, badges: { places: state.badges.places, winding: {} },
        places, mode: state.mode, clockOffset,
      }),
    );
  } catch (e) {
    console.warn('save failed', e);
  }
}

async function load() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      clockOffset = d.clockOffset ?? 0;
      const places: Record<string, Place> = {};
      for (const p of d.places ?? []) places[p.id] = p;
      // older saves had simulated rivals — drop them
      const players: Record<string, Player> = {};
      if (d.world?.players?.[ME]) players[ME] = { ...d.world.players[ME], color: MY_COLOR };
      state = { ...state, world: { players }, badges: d.badges ?? emptyBadges(), places, mode: d.mode ?? 'street' };
      // positions are stale after a restart
      for (const p of Object.values(state.world.players)) if (!p.isBot) { p.pos = null; p.trail = []; p.speed = 0; }
    }
  } catch (e) {
    console.warn('load failed', e);
  }
  if (!state.world.players[ME]) {
    state.world.players[ME] = newPlayer(ME, 'You', MY_COLOR, false);
  }
  set({ loaded: true });
}

// ---------- core: feed a position into the game ----------
export function handleFix(fix: Fix) {
  const world = state.world;
  const me = world.players[ME];
  if (!me) return;
  const prev = me.pos;
  const pos: LngLat = [fix.lng, fix.lat];

  if (!me.territory.length && !prev) {
    plantHome(me, pos);
    toast('🏠 Home base planted. Walk out and loop back to claim land!', 'info');
  }
  const events = processFix(world, ME, fix);

  if (me.pos && prev && me.pos !== prev) {
    const a = bearing(prev, me.pos);
    state.heading = (90 - (a * 180) / Math.PI + 360) % 360;
  }

  // Landmark laps
  if (me.pos) {
    const near = Object.values(state.places).filter((p) => distance(me.pos!, [p.lng, p.lat]) < CONFIG.LAP_MAX_RADIUS_M + 20);
    for (const lap of trackLaps(state.badges, me.pos, near, fix.t)) {
      if (lap.tierUp) {
        toast(`🏅 ${lap.place.name} reached ${lap.tierUp.name}!`, 'gold');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } else toast(`${lap.place.emoji} Lap ${lap.laps} around ${lap.place.name}`, 'good');
      if (state.target?.id === lap.place.id) state.target = null;
    }
  }

  narrate(events);
  dirty = true;
  emit();
}

// ---------- GPS ----------
let gpsSub: Location.LocationSubscription | null = null;
async function startGps() {
  if (gpsSub) return;
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      set({ gps: { status: 'denied', accuracy: null } });
      return;
    }
    gpsSub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 2, timeInterval: 1000 },
      (loc) => {
        state.gps = { status: 'ok', accuracy: loc.coords.accuracy ?? null };
        if (state.sim.on) return emit();
        handleFix({ lng: loc.coords.longitude, lat: loc.coords.latitude, accuracy: loc.coords.accuracy, t: gameNow() });
      },
    );
  } catch (e) {
    set({ gps: { status: 'error', accuracy: null } });
  }
}

// ---------- loops ----------
let started = false;
export async function startGame() {
  if (started) return;
  started = true;
  await load();
  startGps();

  // Walk simulator
  const SIM_MS = 400;
  setInterval(() => {
    const sim = state.sim;
    if (!sim.on || !sim.dest) return;
    const me = state.world.players[ME];
    const from = simPos ?? me?.pos;
    if (!from) return;
    clockOffset += SIM_MS * (sim.turbo - 1);
    const step = 1.35 * (SIM_MS / 1000) * sim.turbo;
    const d = distance(from, sim.dest);
    let next: LngLat;
    if (d <= step) {
      next = sim.dest;
      state.sim = { ...sim, dest: simQueue.shift() ?? null };
    } else {
      const { toXY } = projector(from);
      const [x, y] = toXY(sim.dest);
      next = offset(from, (x / d) * step, (y / d) * step);
    }
    simPos = next;
    handleFix({ lng: next[0], lat: next[1], accuracy: 5, t: gameNow() });
  }, SIM_MS);

  setInterval(save, 5000);
}

// ---------- actions ----------
let simPos: LngLat | null = null;
let simQueue: LngLat[] = [];

export const actions = {
  setMode: (mode: MapMode) => { dirty = true; set({ mode }); },
  setLens: (lens: Lens) => set({ lens }),
  setFollow: (follow: boolean) => state.follow !== follow && set({ follow }),
  toggleSim() {
    const on = !state.sim.on;
    simPos = state.world.players[ME]?.pos ?? null;
    simQueue = [];
    const me = state.world.players[ME];
    if (!on && me) { me.pos = null; me.trail = []; me.speed = 0; me.tooFast = false; } // real GPS starts fresh
    set({ sim: { on, turbo: on ? state.sim.turbo : 1, dest: null } });
    toast(on ? '🧪 Walk sim on — tap the map to walk there' : 'Walk sim off — using real GPS', 'info');
  },
  setTurbo: (turbo: number) => set({ sim: { ...state.sim, turbo } }),
  /** In sim mode: walk to a tapped point (or teleport there if we have no position yet). */
  simTap(lng: number, lat: number) {
    if (!state.sim.on) return;
    const me = state.world.players[ME];
    if (!me?.pos && !simPos) {
      simPos = [lng, lat];
      handleFix({ lng, lat, accuracy: 5, t: gameNow() });
      return;
    }
    set({ sim: { ...state.sim, dest: [lng, lat] } });
  },
  /** Sim helper: walk a full lap around a place. */
  simLap(place: Place) {
    if (!state.sim.on) actions.toggleSim();
    const c: LngLat = [place.lng, place.lat];
    const pts: LngLat[] = [];
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * Math.PI * 2 + Math.PI;
      pts.push(offset(c, Math.cos(a) * 30, Math.sin(a) * 30));
    }
    simQueue = pts.slice(1);
    set({ sim: { ...state.sim, on: true, dest: pts[0] } });
  },
  addTilePlaces(items: { name: string; cls?: string; sub?: string; lng: number; lat: number }[]) {
    let added = 0;
    const places = state.places;
    for (const raw of items) {
      const p = makePlace(raw);
      if (!places[p.id]) { places[p.id] = p; added++; }
    }
    if (added) { dirty = true; emit(); }
  },
  addPlace(p: Place) { state.places[p.id] = p; dirty = true; emit(); },
  setTarget(target: Place | null) {
    if (target) state.places[target.id] = state.places[target.id] ?? target;
    set({ target });
  },
  selectPlace: (selectedPlaceId: string | null) => set({ selectedPlaceId }),
  async resetWorld() {
    await AsyncStorage.removeItem(STORAGE_KEY);
    clockOffset = 0;
    simPos = null;
    const me = newPlayer(ME, 'You', MY_COLOR, false);
    set({ world: { players: { [ME]: me } }, badges: emptyBadges(), target: null, feed: [] });
    toast('World reset', 'info');
  },
};

// ---------- derived helpers for screens ----------
export function myStatus(s: GameState) {
  const me = s.world.players[s.meId];
  if (!me) return null;
  const inside = !!me.pos && pointInMulti(me.pos, me.territory);
  return {
    speed: me.speed,
    tooFast: me.tooFast,
    trailM: me.trail.length > 1 ? pathLength(me.pos ? [...me.trail, me.pos] : me.trail) : 0,
    inside,
    hasPos: !!me.pos,
    color: me.color,
  };
}

export function nearbyPlaces(s: GameState, limit = 150) {
  const me = s.world.players[s.meId];
  const all = Object.values(s.places);
  if (!me?.pos) return all.filter((p) => s.badges.places[p.id]).slice(0, limit);
  return all
    .map((p) => ({ p, d: distance(me.pos!, [p.lng, p.lat]) }))
    .filter((x) => x.d < 900 || s.badges.places[x.p.id] || s.target?.id === x.p.id)
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map((x) => ({ ...x.p, dist: x.d }));
}

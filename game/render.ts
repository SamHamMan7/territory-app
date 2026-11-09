// Turns game state into the GeoJSON message the map WebView draws.
import { tierFor, lapProgress, BadgeState } from './badges';
import { World, ownerAt } from './engine';
import { LngLat } from './geo';
import type { Place } from './places';

export type MapMessage = ReturnType<typeof buildMapMessage>;

export function buildMapMessage(opts: {
  world: World;
  meId: string;
  places: Place[];
  badges: BadgeState;
  target: Place | null;
  heading: number;
  now: number;
}) {
  const { world, meId, places, badges, target, heading, now } = opts;
  const players = Object.values(world.players);
  const me = world.players[meId];

  const terr = {
    type: 'FeatureCollection' as const,
    features: players.flatMap((p) =>
      p.territory.map((poly) => ({
        type: 'Feature' as const,
        properties: { owner: p.id, color: p.color, mine: p.id === meId },
        geometry: { type: 'Polygon' as const, coordinates: poly },
      })),
    ),
  };
  const shields = {
    type: 'FeatureCollection' as const,
    features: (me?.shields ?? [])
      .filter((s) => s.until > now && s.until < Number.MAX_SAFE_INTEGER)
      .flatMap((s) => s.poly.map((poly) => ({
        type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: poly },
      }))),
  };
  const trails = {
    type: 'FeatureCollection' as const,
    features: players
      .filter((p) => p.trail.length > 1)
      .map((p) => ({
        type: 'Feature' as const,
        properties: { color: p.color, mine: p.id === meId },
        geometry: { type: 'LineString' as const, coordinates: p.id === meId && p.pos ? [...p.trail, p.pos] : p.trail },
      })),
  };
  const target_ = {
    type: 'FeatureCollection' as const,
    features: target && me?.pos
      ? [{ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: [me.pos, [target.lng, target.lat] as LngLat] } }]
      : [],
  };

  const poiList = places.map((pl) => {
    const b = badges.places[pl.id];
    const tier = b ? tierFor(b.laps) : null;
    const holder = ownerAt(world, [pl.lng, pl.lat]);
    return {
      id: pl.id, name: pl.name, emoji: pl.emoji, lng: pl.lng, lat: pl.lat,
      badge: !!b, laps: b?.laps ?? 0, tierName: tier?.name ?? '', tierColor: tier?.color ?? null,
      progress: lapProgress(badges, pl.id),
      holder: holder?.name ?? null, holderMine: holder?.id === meId, holderColor: holder?.color ?? null,
      target: target?.id === pl.id,
    };
  });

  return {
    type: 'world' as const,
    terr, trails, shields, target: target_,
    pois: poiList,
    bots: players.filter((p) => p.isBot && p.pos && p.territory.length).map((p) => ({ id: p.id, name: p.name, color: p.color, lng: p.pos![0], lat: p.pos![1] })),
    me: me?.pos ? { lng: me.pos[0], lat: me.pos[1], color: me.color, heading } : null,
  };
}

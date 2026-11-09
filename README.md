# Territory

Paper.io meets Pokémon GO, played at walking speed. Walk out of your land, loop back, and everything you enclosed becomes yours. Walk all the way around real places (a McDonald's, a park, your school) to earn their badges, and keep circling to level them up.

## Run it on your phone (Expo Go)

```bash
npm install
npx expo start
```

Scan the QR code with **Expo Go** (Android) or the Camera app (iOS). The phone and computer need to be on the same Wi-Fi; if they aren't, use `npx expo start --tunnel`.

You don't need to go outside to test: tap **🧪** to turn on the walk simulator, then tap the map to walk there. The **4×** and **10×** buttons fast-forward time. Tap any place, then **Sim a lap** to walk a loop around it.

## Browser demo

Open `web-demo/index.html` in a browser (or run `npx serve web-demo`). It's the same map and game engine with a simulated walker. It plays a short tour by itself, then you can click the map to walk. Rebuild it after changing the game with `npm run demo:build`.

## How it plays

| Rule | Default | Where to tune it |
|---|---|---|
| A home base is planted where you first open the app. It's permanently protected. | 12 m radius | `HOME_RADIUS_M` |
| Leave your land to draw a trail. Get back to your land (or cross your own trail) to claim the loop and anything it surrounds. | | |
| **Walking only:** over about 10 km/h your trail is dropped. | 2.8 m/s | `MAX_SPEED_MS` |
| **Grace zone:** GPS is sloppy, so coming within 8 m of your land, or within 10 m of an older part of your trail, closes the loop. | 8 m / 10 m | `SNAP_TO_*` |
| **Stealing:** a loop that covers a rival's land takes it. | | |
| **Shield:** land you just captured can't be stolen for 30 min. | 30 min | `SHIELD_MS` |
| **Cutting:** walk across a rival's trail and it's erased. | | |
| **Laps:** go a full 360° around a place, staying within 150 m of it. | | `LAP_*` |
| Badge tiers | Bronze 1 · Silver 3 · Gold 7 · Platinum 15 · Diamond 30 · Legend 50 | `LAP_TIERS` |
| Chains like McDonald's or Starbucks roll up into one **collection** badge across all their locations. | | `game/places.ts` |

Holding a place (👑) and having a badge for it are separate. Holding means its spot is inside your land, and rivals can take that. Badges are yours to keep.

All tuning lives in `game/config.ts`.

## Map stack (OpenStreetMap)

- **MapLibre GL** renders the map. It runs in a WebView, which is why the app still works in Expo Go.
- **Street** mode shows the standard OpenStreetMap tiles. These are free for light use under the [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/); a public release should switch to a tile host such as OpenFreeMap, MapTiler or your own server.
- **3D** mode draws OpenStreetMap data as vector tiles from OpenFreeMap, with extruded buildings, and tilts the map to your heading.
- **God's Eye** mode is a satellite view from Esri World Imagery.
- Nearby places are OpenStreetMap points of interest read from the vector tiles, so there's no extra API. Search uses Photon, an OpenStreetMap geocoder.

## Code layout

```
game/
  config.ts   all tuning numbers
  geo.ts      geometry (areas, intersections, polygon union/difference)
  engine.ts   the rules: trails, claiming, stealing, shields, speed gate
  badges.ts   lap detection (winding angle) + tiers
  places.ts   OSM places, chain/brand grouping, search
  bots.ts     simulated free-for-all rivals
  render.ts   game state → GeoJSON for the map
  store.ts    game loop, GPS, sim, persistence
components/map/
  GameMap.tsx WebView bridge
  mapHtml.ts  the MapLibre page
app/(tabs)/index.tsx    Map screen
app/(tabs)/explore.tsx  Badges + leaderboard
scripts/engine.test.ts  rule tests: npm run test:engine
web-demo/               browser demo (npm run demo:build)
```

## Next steps

- **Real multiplayer:** sync `world` through a backend such as Supabase. The rules in `engine.ts` don't need to change, but claims should be checked on the server so nobody can fake GPS.
- **Teams:** add a `team` field to `Player` and treat teammates' land as your own when closing loops.
- **Background tracking:** needs a dev build (`expo-location` background mode + `expo-task-manager`). Expo Go only tracks while the app is open.

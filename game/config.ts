// All game tuning lives here so it's easy to playtest and tweak.
export const CONFIG = {
  // --- Walking-speed gate ---
  MAX_SPEED_MS: 2.8, // ~10 km/h. Above this (smoothed) your trail breaks.
  RESUME_SPEED_MS: 2.2, // must slow below this before a new trail can start
  SPEED_SMOOTHING: 0.35, // EMA factor for speed

  // --- GPS hygiene ---
  MAX_ACCURACY_M: 30, // ignore fixes worse than this
  MIN_STEP_M: 3, // ignore jitter smaller than this
  GAP_RESET_MS: 5 * 60_000, // a GPS gap this long ends your trail

  // --- Grace zone (closing loops with sloppy GPS) ---
  SNAP_TO_TERRITORY_M: 8, // within this of your land counts as "back home"
  SNAP_TO_TRAIL_M: 10, // within this of your own trail closes a loop...
  SNAP_MIN_LOOP_M: 60, // ...as long as the loop is at least this long
  MIN_CLAIM_M2: 25,
  MAX_TRAIL_POINTS: 1500,

  // --- Defense ---
  HOME_RADIUS_M: 12, // starter base, permanently protected
  SHIELD_MS: 30 * 60_000, // freshly captured land can't be stolen for 30 min

  // --- Landmark laps (badges) ---
  LAP_MAX_RADIUS_M: 150, // must stay within this of the place while circling
  LAP_MIN_RADIUS_M: 3,
  // Badge levels go 1, 2, 3… forever. Laps needed: 1, 3, 6, 10, 15… (see lapsForLevel in badges.ts)
  LEVEL_COLORS: ['#b8732e', '#8a94a6', '#d9a400', '#22a99a', '#4a7dff', '#8b5cf6', '#d23fb0', '#e11d48'],
};

export const PLAYER_COLORS = ['#2b7cff', '#ff4f8b', '#f5b400', '#20b26b', '#8b5cf6', '#ff7a1a'];
export const MY_COLOR = PLAYER_COLORS[0];

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
  LAP_TIERS: [
    { laps: 1, name: 'Bronze', color: '#b8732e' },
    { laps: 3, name: 'Silver', color: '#8a94a6' },
    { laps: 7, name: 'Gold', color: '#d9a400' },
    { laps: 15, name: 'Platinum', color: '#22a99a' },
    { laps: 30, name: 'Diamond', color: '#4a7dff' },
    { laps: 50, name: 'Legend', color: '#d23fb0' },
  ],
};

export const PLAYER_COLORS = ['#2b7cff', '#ff4f8b', '#f5b400', '#20b26b', '#8b5cf6', '#ff7a1a'];
export const MY_COLOR = PLAYER_COLORS[0];

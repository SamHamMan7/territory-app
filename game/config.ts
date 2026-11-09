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
  BOTS_CAN_CUT_PLAYER_TRAIL: false,

  // --- Landmark laps (badges) ---
  LAP_MAX_RADIUS_M: 150, // must stay within this of the place while circling
  LAP_MIN_RADIUS_M: 3,
  LAP_TIERS: [
    { laps: 1, name: 'Bronze', color: '#cd7f32' },
    { laps: 3, name: 'Silver', color: '#c0c7d1' },
    { laps: 7, name: 'Gold', color: '#ffc531' },
    { laps: 15, name: 'Platinum', color: '#7fe3d8' },
    { laps: 30, name: 'Diamond', color: '#8ab4ff' },
    { laps: 50, name: 'Legend', color: '#ff5fd2' },
  ],

  // --- Places (OpenStreetMap via Overpass) ---
  PLACES_RADIUS_M: 700,
  PLACES_REFETCH_M: 350,

  // --- Rivals (simulated free-for-all) ---
  BOT_COUNT: 3,
  BOT_SPEED_MS: 1.4,
  BOT_TICK_MS: 1000,
};

export const PLAYER_COLORS = ['#3dd6ff', '#ff4fa3', '#ffd23f', '#7cff6b', '#b98cff', '#ff8a3d'];

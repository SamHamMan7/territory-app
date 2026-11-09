// Real-world places come from OpenStreetMap.
// Nearby places are read straight out of the OpenFreeMap vector tiles the map already
// downloads (no extra API), and search uses Photon (OSM geocoder, free, no key).

export type Place = {
  id: string;
  name: string;
  brand: string | null; // groups chains, e.g. every "McDonald's"
  category: string; // OSM class/subclass, e.g. "fast_food"
  emoji: string;
  lng: number;
  lat: number;
};

const EMOJI: Record<string, string> = {
  fast_food: '🍔', restaurant: '🍽️', cafe: '☕', bar: '🍺', pub: '🍺', ice_cream: '🍦', bakery: '🥐',
  coffee: '☕', park: '🌳', playground: '🛝', garden: '🌷', pitch: '🏟️', stadium: '🏟️', sports_centre: '🏀',
  fitness_centre: '🏋️', school: '🏫', college: '🎓', university: '🎓', library: '📚', place_of_worship: '⛪',
  hospital: '🏥', pharmacy: '💊', bank: '🏦', fuel: '⛽', grocery: '🛒', supermarket: '🛒', convenience: '🏪',
  shop: '🛍️', clothes: '👕', museum: '🏛️', art_gallery: '🖼️', attraction: '⭐', theatre: '🎭', cinema: '🎬',
  town_hall: '🏛️', post: '📮', police: '🚓', fire_station: '🚒', hotel: '🏨', lodging: '🏨',
  bus: '🚌', railway: '🚆', car: '🚗', zoo: '🦁', monument: '🗿', castle: '🏰', music: '🎵', books: '📚',
  beer: '🍺', alcohol_shop: '🍷', pet: '🐾', veterinary: '🐾', dentist: '🦷', doctors: '🩺', toilets: '🚻',
  parking: '🅿️', bicycle: '🚲', laundry: '🧺', hairdresser: '💈', mobile_phone: '📱', electronics: '🔌',
};

// Common chains → canonical brand name. Anything else uses its own name as a one-off badge.
const CHAINS = [
  "McDonald's", 'Starbucks', 'Subway', 'Walmart', 'Target', 'Chick-fil-A', "Wendy's", 'Taco Bell',
  'Burger King', 'CVS', 'Walgreens', '7-Eleven', "Dunkin'", 'Chipotle', 'Panera Bread', 'KFC',
  "Popeyes", 'Sonic', 'Whataburger', 'H-E-B', 'Kroger', 'Costco', 'Shell', 'Chevron', 'Exxon',
  "Domino's", 'Pizza Hut', 'Dairy Queen', 'Jack in the Box', "Carl's Jr.", 'Five Guys', 'Shake Shack',
  'In-N-Out Burger', 'Panda Express', 'Raising Cane\'s', 'Wingstop', 'Jimmy John\'s', 'Tim Hortons',
  'Trader Joe\'s', 'Whole Foods Market', 'Aldi', 'Lidl', 'Tesco', 'Home Depot', "Lowe's", 'Best Buy',
  'Dollar General', 'Dollar Tree', 'Family Dollar', 'IKEA', 'Apple', 'Nike', 'Pret A Manger', 'Costa',
];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const CHAIN_INDEX = new Map(CHAINS.map((c) => [norm(c), c]));
CHAIN_INDEX.set('mcdonalds', "McDonald's");
CHAIN_INDEX.set('dunkindonuts', "Dunkin'");
CHAIN_INDEX.set('thehomedepot', 'Home Depot');

export function brandOf(name: string): string | null {
  const n = norm(name);
  if (CHAIN_INDEX.has(n)) return CHAIN_INDEX.get(n)!;
  for (const [k, v] of CHAIN_INDEX) if (k.length >= 4 && n.startsWith(k)) return v;
  return null;
}

export function emojiFor(category: string, cls?: string): string {
  return EMOJI[category] ?? (cls ? EMOJI[cls] : undefined) ?? '📍';
}

export function makePlace(raw: { name: string; cls?: string; sub?: string; lng: number; lat: number }): Place {
  const category = raw.sub || raw.cls || 'place';
  return {
    id: `${norm(raw.name)}@${raw.lng.toFixed(4)},${raw.lat.toFixed(4)}`,
    name: raw.name,
    brand: brandOf(raw.name),
    category,
    emoji: emojiFor(category, raw.cls),
    lng: raw.lng,
    lat: raw.lat,
  };
}

export type SearchResult = Place & { address: string };

/** Search places by name near a location (Photon / OSM). */
export async function searchPlaces(q: string, near: { lng: number; lat: number } | null): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q, limit: '8', lang: 'en' });
  if (near) {
    params.set('lat', String(near.lat));
    params.set('lon', String(near.lng));
    params.set('location_bias_scale', '0.6');
  }
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, {
    headers: { 'User-Agent': 'territory-app/1.0' },
  });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const data = await res.json();
  return (data.features ?? [])
    .filter((f: any) => f.properties?.name && f.geometry?.type === 'Point')
    .map((f: any) => {
      const p = f.properties;
      const [lng, lat] = f.geometry.coordinates;
      const place = makePlace({ name: p.name, cls: p.osm_key, sub: p.osm_value, lng, lat });
      const address = [p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street, p.city]
        .filter(Boolean)
        .join(', ');
      return { ...place, address };
    });
}

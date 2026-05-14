import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Polygon, Polyline, Region } from 'react-native-maps';
import { hexToRgba } from '@/utils/colors';

const POLYGONS_KEY = 'paperio_polygons_v1';
const USER_COLOR_KEY = 'paperio_user_color';
const USER_ID_KEY = 'paperio_user_id';

// --- TYPES ---
type Coord = { latitude: number; longitude: number };

type Territory = {
  id: string;
  ownerId: string;
  color: string;
  coords: Coord[];
  area: number;
  date: string;
};

// --- MATH HELPERS ---
const getDistance = (p1: Coord, p2: Coord) => {
  const R = 6371e3;
  const phi1 = p1.latitude * Math.PI / 180;
  const phi2 = p2.latitude * Math.PI / 180;
  const deltaPhi = (p2.latitude - p1.latitude) * Math.PI / 180;
  const deltaLambda = (p2.longitude - p1.longitude) * Math.PI / 180;
  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Returns true if line segment p1-p2 intersects with p3-p4
const getIntersection = (p1: Coord, p2: Coord, p3: Coord, p4: Coord): boolean => {
  const d1 = (p2.latitude - p1.latitude) * (p3.longitude - p1.longitude) - (p2.longitude - p1.longitude) * (p3.latitude - p1.latitude);
  const d2 = (p2.latitude - p1.latitude) * (p4.longitude - p1.longitude) - (p2.longitude - p1.longitude) * (p4.latitude - p1.latitude);
  const d3 = (p4.latitude - p3.latitude) * (p1.longitude - p3.longitude) - (p4.longitude - p3.longitude) * (p1.latitude - p3.latitude);
  const d4 = (p4.latitude - p3.latitude) * (p2.longitude - p3.longitude) - (p4.longitude - p3.longitude) * (p2.latitude - p3.latitude);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return false;
};

const getPolygonArea = (coords: Coord[]) => {
  let area = 0;
  const n = coords.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += coords[i].latitude * coords[j].longitude;
    area -= coords[j].latitude * coords[i].longitude;
  }
  return Math.abs(area / 2) * 1.23e10;
};

const PASTEL_COLORS = ['#ff4d4d', '#ffaf40', '#ffeaa7', '#55efc4', '#74b9ff', '#a29bfe', '#fd79a8'];

export default function App() {
  const mapRef = useRef<MapView | null>(null);
  const [userLocation, setUserLocation] = useState<Coord | null>(null);
  const [path, setPath] = useState<Coord[]>([]);
  const [polygons, setPolygons] = useState<Territory[]>([]);
  const [initialRegion, setInitialRegion] = useState<Region | null>(null);

  const [userId, setUserId] = useState<string>('');
  const [userColor, setUserColor] = useState<string>('#ffffff');

  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // --- INIT USER ---
  useEffect(() => {
    const initUser = async () => {
      let storedId = await AsyncStorage.getItem(USER_ID_KEY);
      let storedColor = await AsyncStorage.getItem(USER_COLOR_KEY);

      if (!storedId) {
        storedId = `player_${crypto.randomUUID()}`;
        storedColor = PASTEL_COLORS[Math.floor(Math.random() * PASTEL_COLORS.length)];
        await AsyncStorage.setItem(USER_ID_KEY, storedId);
        await AsyncStorage.setItem(USER_COLOR_KEY, storedColor);
      }

      setUserId(storedId);
      setUserColor(storedColor!);
    };
    initUser();
  }, []);

  // --- PERSISTENCE ---
  useEffect(() => {
    const load = async () => {
      try {
        const raw = await AsyncStorage.getItem(POLYGONS_KEY);
        if (raw) setPolygons(JSON.parse(raw));
      } catch (e) { console.warn('Failed to load:', e); }
    };
    load();
  }, []);

  useEffect(() => {
    const save = async () => {
      try {
        await AsyncStorage.setItem(POLYGONS_KEY, JSON.stringify(polygons));
      } catch (e) {
        console.error('Failed to save polygons:', e);
      }
    };
    const t = setTimeout(save, 500);
    return () => clearTimeout(t);
  }, [polygons]);

  // --- GAME ENGINE: MOVEMENT & LOOP DETECTION ---
  useEffect(() => {
    if (!userId) return;

    let subscription: { remove: () => void } | null = null;
    const startTracking = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const loc = await Location.getCurrentPositionAsync({});
      setUserLocation(loc.coords);
      setInitialRegion({ latitude: loc.coords.latitude, longitude: loc.coords.longitude, latitudeDelta: 0.005, longitudeDelta: 0.005 });

      subscription = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 3 }, async (newLoc) => {
        const newPoint = { latitude: newLoc.coords.latitude, longitude: newLoc.coords.longitude };
        setUserLocation(newPoint);
        mapRef.current?.animateCamera({ center: newPoint }, { duration: 1000 });

        setPath((curr) => {
          if (curr.length > 500) curr = curr.slice(-250);
          const updated = [...curr, newPoint];

          // Loop Detection algorithm
          if (updated.length >= 4) {
            // Check the newly formed segment against all older segments
            const p1 = updated[updated.length - 2];
            const p2 = updated[updated.length - 1];

            // Don't test against the segment immediately before the current one (they share p1)
            for (let i = 0; i < updated.length - 3; i++) {
              const p3 = updated[i];
              const p4 = updated[i + 1];

              if (getIntersection(p1, p2, p3, p4)) {
                const loop = updated.slice(i);
                const closed = [...loop, loop[0]];
                const area = getPolygonArea(closed);

                // Require a minimum 20 sqm area to avoid noise
                if (area < 20) return updated;

                const newT: Territory = {
                  id: crypto.randomUUID(),
                  ownerId: userId,
                  color: userColor,
                  coords: closed,
                  area: Math.floor(area),
                  date: new Date().toLocaleDateString()
                };

                setPolygons(p => [...p, newT]);
                showToast(`Captured Land! +${Math.floor(area)} sqm`);
                return [newPoint]; // Start new path
              }
            }
          }
          return updated;
        });
      });
    };
    startTracking();
    return () => { if (subscription) subscription.remove(); };
  }, [userId, userColor]);

  // --- BOT SIMULATION ---
  useEffect(() => {
    const interval = setInterval(() => {
      if (!userLocation) return;

      // 30% chance to spawn a bot territory nearby every 10 seconds
      if (Math.random() < 0.3) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 30 + Math.random() * 100; // 30-130 meters away

        // Map meters to degrees roughly
        const dLat = (dist * Math.cos(angle)) / 111320;
        const dLng = (dist * Math.sin(angle)) / (40075000 * Math.cos(userLocation.latitude * Math.PI / 180) / 360);

        const center = { latitude: userLocation.latitude + dLat, longitude: userLocation.longitude + dLng };
        const radius = 10 + Math.random() * 20;

        // Generate circle polygon coords
        const botCoords = [];
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const rLat = (radius * Math.cos(a)) / 111320;
          const rLng = (radius * Math.sin(a)) / (40075000 * Math.cos(center.latitude * Math.PI / 180) / 360);
          botCoords.push({ latitude: center.latitude + rLat, longitude: center.longitude + rLng });
        }
        botCoords.push(botCoords[0]);

        const botColor = PASTEL_COLORS[Math.floor(Math.random() * PASTEL_COLORS.length)];

        const botT: Territory = {
          id: `bot_${crypto.randomUUID()}`,
          ownerId: `bot_${crypto.randomUUID()}`,
          color: botColor,
          coords: botCoords,
          area: Math.floor(Math.PI * radius * radius),
          date: new Date().toLocaleDateString()
        };
        setPolygons(p => [...p, botT]);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [userLocation]);

  // Total Area Calculation
  const totalMyArea = useMemo(() => {
    return polygons.reduce((sum, p) => (p.ownerId === userId ? sum + p.area : sum), 0);
  }, [polygons, userId]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion!}
        showsUserLocation={true}
        customMapStyle={darkMapStyle}
        pitchEnabled={false}
        rotateEnabled={false}
      >
        {/* Draw previously captured territories. Since they are drawn in order, newer territories cover older ones automatically. */}
        {polygons.map((poly) => {
          return (
            <Polygon
              key={poly.id}
              coordinates={poly.coords}
              fillColor={hexToRgba(poly.color, 0.4)}
              strokeColor={poly.color}
              strokeWidth={2}
              lineCap="round"
              lineJoin="round"
            />
          );
        })}

        {/* Draw current tracking path */}
        <Polyline coordinates={path} strokeColor={userColor} strokeWidth={4} lineCap="round" lineJoin="round" />
      </MapView>

      {/* HUD */}
      <View style={styles.topHud}>
        <View style={[styles.hudCard, { borderColor: userColor, borderLeftWidth: 4 }]}>
          <Text style={styles.hudTitle}>DOMINION SCORE</Text>
          <Text style={styles.hudStat}>{totalMyArea.toLocaleString()} sqm</Text>
        </View>
      </View>

      {toast && <View style={styles.toast}><Text style={styles.toastText}>{toast}</Text></View>}
    </View>
  );
}

const darkMapStyle = [
  { "elementType": "geometry", "stylers": [{ "color": "#111111" }] },
  { "elementType": "labels.icon", "stylers": [{ "visibility": "off" }] },
  { "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] },
  { "elementType": "labels.text.stroke", "stylers": [{ "color": "#111111" }] },
  { "featureType": "administrative", "elementType": "geometry", "stylers": [{ "color": "#757575" }] },
  { "featureType": "administrative.country", "elementType": "labels.text.fill", "stylers": [{ "color": "#9e9e9e" }] },
  { "featureType": "administrative.land_parcel", "stylers": [{ "visibility": "off" }] },
  { "featureType": "administrative.locality", "elementType": "labels.text.fill", "stylers": [{ "color": "#bdbdbd" }] },
  { "featureType": "poi", "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] },
  { "featureType": "poi.park", "elementType": "geometry", "stylers": [{ "color": "#181818" }] },
  { "featureType": "road", "elementType": "geometry.fill", "stylers": [{ "color": "#222222" }] },
  { "featureType": "road", "elementType": "labels.text.fill", "stylers": [{ "color": "#8a8a8a" }] },
  { "featureType": "road.arterial", "elementType": "geometry", "stylers": [{ "color": "#333333" }] },
  { "featureType": "road.highway", "elementType": "geometry", "stylers": [{ "color": "#3c3c3c" }] },
  { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#000000" }] },
  { "featureType": "water", "elementType": "labels.text.fill", "stylers": [{ "color": "#3d3d3d" }] }
];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  map: { width: '100%', height: '100%' },

  topHud: { position: 'absolute', top: 50, left: 20, zIndex: 10 },
  hudCard: { backgroundColor: 'rgba(10,10,10,0.85)', padding: 15, borderRadius: 12, minWidth: 150, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 5 },
  hudTitle: { color: '#aaa', fontSize: 11, fontWeight: 'bold', letterSpacing: 1.5, marginBottom: 5 },
  hudStat: { color: 'white', fontSize: 20, fontWeight: '800' },

  toast: { position: 'absolute', bottom: 50, alignSelf: 'center', backgroundColor: 'rgba(20,20,20,0.9)', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, borderColor: '#444', borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 6 },
  toastText: { color: 'white', fontWeight: '600', fontSize: 16 },
});
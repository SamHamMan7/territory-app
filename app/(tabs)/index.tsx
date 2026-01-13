import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Polygon, Polyline, Region } from 'react-native-maps';

const POLYGONS_KEY = 'territory_polygons_v1';

// --- Small coord/type helpers ---
type Coord = { latitude: number; longitude: number };

// --- MATH ENGINE ---
const getIntersection = (p1: Coord, p2: Coord, p3: Coord, p4: Coord): boolean => {
  const d1 = (p2.latitude - p1.latitude) * (p3.longitude - p1.longitude) - (p2.longitude - p1.longitude) * (p3.latitude - p1.latitude);
  const d2 = (p2.latitude - p1.latitude) * (p4.longitude - p1.longitude) - (p2.longitude - p1.longitude) * (p4.latitude - p1.latitude);
  const d3 = (p4.latitude - p3.latitude) * (p1.longitude - p3.longitude) - (p4.longitude - p3.longitude) * (p1.latitude - p3.latitude);
  const d4 = (p4.latitude - p3.latitude) * (p2.longitude - p3.longitude) - (p4.longitude - p3.longitude) * (p2.latitude - p3.latitude);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true; 
  return false;
};

// --- MISSIONS ---
const MISSIONS = [
  { name: "My Street", zoom: 0.002, label: "Street" },
  { name: "My School", zoom: 0.01, label: "Campus" },
  { name: "My City", zoom: 0.05, label: "City" },
];

export default function App() {
  const mapRef = useRef<MapView | null>(null);
  const [path, setPath] = useState<Coord[]>([]);
  const [polygons, setPolygons] = useState<{ coords: Coord[]; type: string }[]>([]);
  const [initialRegion, setInitialRegion] = useState<Region | null>(null);

  // Mission state
  const [targetName, setTargetName] = useState<string>('Free Roam');
  const [modalVisible, setModalVisible] = useState<boolean>(false);

  // Toast for lightweight feedback (avoids blocking alerts)
  const [toast, setToast] = useState<string | null>(null);

  // Helpers: close loop (ensure polygon closed) and area filter
  const closeLoop = (pts: Coord[]) => {
    if (pts.length === 0) return pts;
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (first.latitude !== last.latitude || first.longitude !== last.longitude) {
      return [...pts, first];
    }
    return pts;
  };

  const polygonAreaDegrees = (pts: Coord[]) => {
    let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
    for (const p of pts) {
      minLat = Math.min(minLat, p.latitude);
      minLng = Math.min(minLng, p.longitude);
      maxLat = Math.max(maxLat, p.latitude);
      maxLng = Math.max(maxLng, p.longitude);
    }
    return Math.abs((maxLat - minLat) * (maxLng - minLng));
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // Load persisted polygons on mount
  useEffect(() => {
    const load = async () => {
      try {
        const raw = await AsyncStorage.getItem(POLYGONS_KEY);
        if (raw) {
          setPolygons(JSON.parse(raw));
        }
      } catch (e) {
        console.warn('Failed to load polygons:', e);
      }
    };
    load();
  }, []);

  // Persist polygons when they change (debounced simple write)
  useEffect(() => {
    const save = async () => {
      try {
        await AsyncStorage.setItem(POLYGONS_KEY, JSON.stringify(polygons));
      } catch (e) {
        console.warn('Failed to save polygons:', e);
      }
    };

    const t = setTimeout(save, 500);
    return () => clearTimeout(t);
  }, [polygons]);

  useEffect(() => {
    let subscription: { remove: () => void } | null = null;

    const startTracking = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location required', 'Allow location access to capture territories.');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      setInitialRegion({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.002,
        longitudeDelta: 0.002,
      });

      subscription = await Location.watchPositionAsync({
        accuracy: Location.Accuracy.High,
        distanceInterval: 3,
      }, (newLocation) => {
        const newPoint: Coord = { latitude: newLocation.coords.latitude, longitude: newLocation.coords.longitude };

        setPath((currentPath) => {
          // Keep path from growing unbounded
          if (currentPath.length > 1000) currentPath = currentPath.slice(-500);

          if (currentPath.length < 3) return [...currentPath, newPoint];
          const lastPoint = currentPath[currentPath.length - 1];

          // CHECK INTERSECTIONS (avoid checking last adjacent segments)
          for (let i = 0; i < currentPath.length - 2; i++) {
            const start = currentPath[i];
            const end = currentPath[i + 1];

            if (getIntersection(lastPoint, newPoint, start, end)) {
              const loop = currentPath.slice(i);
              const closed = closeLoop(loop);

              // Basic quality filter: require several points and a minimal area
              if (closed.length >= 4 && polygonAreaDegrees(closed) > 1e-6) {
                setPolygons(prev => [...prev, { coords: closed, type: targetName }]);
                // lightweight feedback
                showToast(`Captured: ${targetName}`);
              } else {
                // small loop — ignore
                showToast('Capture too small');
              }

              // Reset path, keep only latest point to start new loop
              return [newPoint];
            }
          }

          return [...currentPath, newPoint];
        });
      });
    };

    startTracking();

    return () => {
      if (subscription) subscription.remove();
    };
  }, [targetName]);

  const selectMission = (mission: { name: string; zoom: number }) => {
    setTargetName(mission.name);
    setModalVisible(false);

    if (mapRef.current && initialRegion) {
      try {
        mapRef.current.animateToRegion({
          latitude: initialRegion.latitude,
          longitude: initialRegion.longitude,
          latitudeDelta: mission.zoom,
          longitudeDelta: mission.zoom,
        }, 1000);
      } catch (e) {
        console.warn('Unable to animate map:', e);
      }
    }
  };

  if (!initialRegion) {
    return (
      <View style={[styles.container, styles.loading]}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={(r) => { mapRef.current = r; }}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation={true}
        followsUserLocation={true}
      >
        {polygons.map((poly, index) => (
          <Polygon
            key={index}
            coordinates={poly.coords}
            fillColor={poly.type === "My City" ? "rgba(255, 0, 0, 0.2)" : "rgba(0, 255, 0, 0.3)"}
            strokeColor="rgba(0, 255, 0, 0.8)"
          />
        ))}

        <Polyline coordinates={path} strokeColor="red" strokeWidth={5} />
      </MapView>

      {toast ? (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      <TouchableOpacity style={styles.missionBtn} onPress={() => setModalVisible(true)}>
        <Text style={styles.missionText}>🎯 Target: {targetName}</Text>
      </TouchableOpacity>

      <View style={styles.hud}>
        <Text style={styles.text}>Territories: {polygons.length}</Text>
      </View>

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Choose Your Target</Text>
            {MISSIONS.map((m, i) => (
              <TouchableOpacity key={i} style={styles.optionBtn} onPress={() => selectMission(m)}>
                <Text style={styles.optionText}>{m.name}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.closeBtn} onPress={() => setModalVisible(false)}>
              <Text style={{color: 'red'}}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width: '100%', height: '100%' },
  hud: { position: 'absolute', bottom: 50, left: 20, backgroundColor: 'rgba(0,0,0,0.6)', padding: 10, borderRadius: 8 },
  text: { color: 'white', fontWeight: 'bold' },
  loading: { justifyContent: 'center', alignItems: 'center' },

  // toast
  toast: { position: 'absolute', top: Platform.OS === 'ios' ? 50 : 30, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.8)', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, zIndex: 999, elevation: 6 },
  toastText: { color: 'white', fontWeight: '600' },

  missionBtn: { position: 'absolute', top: 60, alignSelf: 'center', backgroundColor: 'white', padding: 15, borderRadius: 30, elevation: 5, shadowColor: '#000', shadowOffset: {width:0, height:2}, shadowOpacity:0.3 },
  missionText: { fontWeight: 'bold', fontSize: 16 },

  modalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { width: 300, backgroundColor: 'white', padding: 20, borderRadius: 20, alignItems: 'center' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20 },
  optionBtn: { width: '100%', padding: 15, borderBottomWidth: 1, borderColor: '#eee', alignItems: 'center' },
  optionText: { fontSize: 18 },
  closeBtn: { marginTop: 20, padding: 10 },
});
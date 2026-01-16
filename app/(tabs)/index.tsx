import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import MapView, { Circle, Marker, Polygon, Polyline, Region } from 'react-native-maps';

const POLYGONS_KEY = 'territory_polygons_v6'; // Version up for new features

// --- TYPES ---
type Coord = { latitude: number; longitude: number };
type TerritoryType = 'street' | 'landmark' | 'city' | 'unknown';
type Territory = { 
  coords: Coord[]; 
  id: string;
  name: string;
  type: TerritoryType;
  area: number;
  level: number; 
  date: string;
};

// --- MATH HELPER ---
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

// Intersection for Loop Detection
const getIntersection = (p1: Coord, p2: Coord, p3: Coord, p4: Coord): boolean => {
  const d1 = (p2.latitude - p1.latitude) * (p3.longitude - p1.longitude) - (p2.longitude - p1.longitude) * (p3.latitude - p1.latitude);
  const d2 = (p2.latitude - p1.latitude) * (p4.longitude - p1.longitude) - (p2.longitude - p1.longitude) * (p4.latitude - p1.latitude);
  const d3 = (p4.latitude - p3.latitude) * (p1.longitude - p3.longitude) - (p4.longitude - p3.longitude) * (p1.latitude - p3.latitude);
  const d4 = (p4.latitude - p3.latitude) * (p2.longitude - p3.longitude) - (p4.longitude - p3.longitude) * (p2.latitude - p3.latitude);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true; 
  return false;
};

const getCentroid = (coords: Coord[]) => {
  let lat = 0, lng = 0;
  coords.forEach(p => { lat += p.latitude; lng += p.longitude; });
  return { latitude: lat / coords.length, longitude: lng / coords.length };
};

// Calculate Polygon Area (approx m^2)
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

export default function App() {
  const mapRef = useRef<MapView | null>(null);
  const [userLocation, setUserLocation] = useState<Coord | null>(null);
  const [path, setPath] = useState<Coord[]>([]);
  const [polygons, setPolygons] = useState<Territory[]>([]);
  const [initialRegion, setInitialRegion] = useState<Region | null>(null);

  // Economy & State
  const [cash, setCash] = useState(100); 
  const [activeTab, setActiveTab] = useState<'explore' | 'profile'>('explore');
  const distanceTraveledRef = useRef(0); 

  // Search & Target
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]); // For the dropdown
  const [isSearching, setIsSearching] = useState(false);
  const [targetZone, setTargetZone] = useState<{ latitude: number; longitude: number; radius: number, name: string } | null>(null);
  
  // Lootbox State
  const [lootbox, setLootbox] = useState<{coord: Coord, amount: number} | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // --- HELPERS ---
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

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
      try { await AsyncStorage.setItem(POLYGONS_KEY, JSON.stringify(polygons)); } 
      catch (e) { console.warn('Failed to save:', e); }
    };
    const t = setTimeout(save, 500);
    return () => clearTimeout(t);
  }, [polygons]);

  // --- THE GAME ENGINE ---
  useEffect(() => {
    let subscription: { remove: () => void } | null = null;

    const startTracking = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const loc = await Location.getCurrentPositionAsync({});
      setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      setInitialRegion({
        latitude: loc.coords.latitude, longitude: loc.coords.longitude,
        latitudeDelta: 0.005, longitudeDelta: 0.005,
      });

      subscription = await Location.watchPositionAsync({
        accuracy: Location.Accuracy.High, distanceInterval: 5,
      }, async (newLoc) => {
        const newPoint: Coord = { latitude: newLoc.coords.latitude, longitude: newLoc.coords.longitude };
        
        // 1. LOOTBOX LOGIC (Every 50m)
        if (userLocation) {
            const step = getDistance(userLocation, newPoint);
            distanceTraveledRef.current += step;
            if (distanceTraveledRef.current > 50) {
                distanceTraveledRef.current = 0;
                // 5% Chance
                if (Math.random() < 0.05) {
                    setLootbox({ coord: newPoint, amount: Math.floor(Math.random() * 50) + 10 });
                    Alert.alert("🎁 MYSTERY CRATE FOUND!", "You stumbled upon a hidden stash nearby!");
                }
            }
        }

        setUserLocation(newPoint);

        // 2. CHECK LOOTBOX PICKUP
        if (lootbox && getDistance(newPoint, lootbox.coord) < 20) {
            setCash(c => c + lootbox.amount);
            Alert.alert("💰 LOOT SECURED", `You found $${lootbox.amount}!`);
            setLootbox(null);
        }

        // 3. PATH & LOOPS
        setPath((currentPath) => {
          if (currentPath.length > 400) currentPath = currentPath.slice(-200);
          const updatedPath = [...currentPath, newPoint];

          if (updatedPath.length >= 4) {
            const lastPoint = updatedPath[updatedPath.length - 1];
            for (let i = Math.max(0, updatedPath.length - 50); i < updatedPath.length - 2; i++) {
               const start = updatedPath[i];
               const end = updatedPath[i + 1];
               
               if (getIntersection(lastPoint, newPoint, start, end)) {
                 const loop = updatedPath.slice(i);
                 const closed = [...loop, loop[0]]; 
                 const area = getPolygonArea(closed);

                 if (area < 50) return updatedPath; 

                 // Identify Territory
                 const center = getCentroid(closed);
                 
                 (async () => {
                    let name = "Unknown Territory";
                    let type: TerritoryType = 'street'; 
                    let bonus = 0;

                    // A. Target Hit?
                    if (targetZone && getDistance(center, targetZone) < targetZone.radius) {
                        name = targetZone.name;
                        type = 'landmark';
                        bonus = 500;
                        setTargetZone(null); 
                        setSearchText("");
                        Alert.alert("🎯 TARGET CONQUERED", `You captured ${name}!\nBonus: $500`);
                    } else {
                        // B. Reverse Geocode
                        try {
                            const [address] = await Location.reverseGeocodeAsync(center);
                            if (address) {
                                if (area > 20000) {
                                    name = address.city || address.district || "City Sector";
                                    type = 'city';
                                    bonus = 100;
                                } else {
                                    name = address.street || address.name || "Unnamed Road";
                                    type = 'street';
                                    bonus = 20;
                                }
                            }
                        } catch (e) { console.log("Geocode failed"); }
                    }

                    const newTerritory: Territory = {
                        coords: closed,
                        id: Date.now().toString(),
                        name: name,
                        type: type,
                        area: Math.floor(area),
                        level: 1,
                        date: new Date().toLocaleDateString()
                    };

                    setPolygons(prev => [...prev, newTerritory]);
                    setCash(c => c + 10 + bonus);
                    showToast(`Captured: ${name} (+$${10 + bonus})`);
                 })();

                 return [newPoint]; 
               }
            }
          }
          return updatedPath;
        });
      });
    };
    startTracking();
    return () => { if (subscription) subscription.remove(); };
  }, [targetZone, lootbox, userLocation]); 

  // --- SMART SEARCH ENGINE ---
  const performSearch = async () => {
    Keyboard.dismiss();
    if (!searchText.trim()) return;
    
    setIsSearching(true);
    try {
      // 1. Get raw results
      const results = await Location.geocodeAsync(searchText);
      
      if (results.length === 0) {
        Alert.alert("No Results", "Try a more specific name.");
        setIsSearching(false);
        return;
      }

      // 2. ENRICH: Calculate distance to USER for each result
      const enrichedResults = await Promise.all(results.map(async (res: any) => {
          let dist = 999999;
          let streetName = "Unknown Location";

          // Calculate distance if we know where user is
          if (userLocation) {
              dist = getDistance(userLocation, {latitude: res.latitude, longitude: res.longitude});
          }

          // Reverse Geocode to get a pretty name (e.g. "Main St")
          try {
              const [address] = await Location.reverseGeocodeAsync({latitude: res.latitude, longitude: res.longitude});
              if (address) {
                  streetName = address.name || address.street || address.city || "Location";
              }
          } catch(e) {}

          return { ...res, dist, streetName };
      }));

      // 3. SORT: Closest first
      enrichedResults.sort((a, b) => a.dist - b.dist);

      // 4. Show top 5
      setSearchResults(enrichedResults.slice(0, 5));
      setIsSearching(false);

    } catch (e) { 
        Alert.alert('Error', 'Check internet.'); 
        setIsSearching(false);
    }
  };

  const selectSearchResult = (result: any) => {
      const region = { latitude: result.latitude, longitude: result.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 };
      
      // Use the user's search text as the "Mission Name", but add the street
      const missionName = `${searchText} (${result.streetName})`;
      
      setTargetZone({ latitude: result.latitude, longitude: result.longitude, radius: 150, name: missionName });
      setInitialRegion(region);
      mapRef.current?.animateToRegion(region, 1000);
      setSearchResults([]); // Hide dropdown
      showToast(`Target Set: ${Math.floor(result.dist)}m away`);
  };

  // --- UPGRADE ENGINE ---
  const handleTerritoryPress = (index: number) => {
    const t = polygons[index];
    const cost = 100;
    
    Alert.alert(
      t.name, 
      `Level: ${t.level}\nArea: ${t.area}m²\n\nUpgrade for $${cost}?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "UPGRADE ($100)", onPress: () => {
            if (cash < cost) { Alert.alert("Not enough cash!"); return; }
            if (t.level >= 2) { Alert.alert("Max Level!"); return; }
            
            setCash(c => c - cost);
            const updated = [...polygons];
            updated[index].level = 2;
            setPolygons(updated);
            showToast(`Upgraded ${t.name}!`);
        }}
      ]
    );
  };

  // --- RENDERERS ---
  const renderMap = () => (
    <View style={styles.fullScreen}>
        <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={initialRegion!}
            showsUserLocation={true}
            followsUserLocation={true}
        >
            {polygons.map((poly, index) => {
                const isNeon = poly.level > 1;
                let fill = isNeon ? "rgba(0,255,255,0.3)" : "rgba(255,215,0,0.2)"; 
                let stroke = isNeon ? "cyan" : "orange";
                if (poly.type === 'landmark') { fill = "rgba(255,0,255,0.3)"; stroke = "magenta"; }
                
                return (
                <Polygon
                    key={poly.id}
                    coordinates={poly.coords}
                    fillColor={fill}
                    strokeColor={stroke}
                    strokeWidth={2}
                    tappable={true}
                    onPress={() => handleTerritoryPress(index)}
                />
                );
            })}
            
            <Polyline coordinates={path} strokeColor="red" strokeWidth={4} />

            {/* DOTTED LINE TO TARGET */}
            {targetZone && userLocation && (
                <Polyline 
                    coordinates={[userLocation, targetZone]} 
                    strokeColor="lime" 
                    strokeWidth={3} 
                    lineDashPattern={[10, 10]} 
                />
            )}

            {targetZone && (
                <Circle center={targetZone} radius={targetZone.radius} fillColor="rgba(0,255,0,0.2)" strokeColor="lime" />
            )}
            
            {lootbox && (
                <Marker coordinate={lootbox.coord} title="MYSTERY CRATE">
                    <View style={styles.lootboxMarker}><Text>🎁</Text></View>
                </Marker>
            )}

        </MapView>

        {/* SEARCH BAR */}
        <View style={styles.topHud}>
            <View style={styles.searchBar}>
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search Target (e.g. McDonalds)"
                    placeholderTextColor="#666"
                    value={searchText}
                    onChangeText={setSearchText}
                    onSubmitEditing={performSearch}
                />
                <TouchableOpacity onPress={performSearch} style={styles.searchBtn}>
                    {isSearching ? <ActivityIndicator color="black" size="small"/> : <Text>🔍</Text>}
                </TouchableOpacity>
            </View>

            {/* SMART RESULTS DROPDOWN */}
            {searchResults.length > 0 && (
                <View style={styles.dropdown}>
                    <Text style={styles.dropdownHeader}>Select Closest Match:</Text>
                    {searchResults.map((res, i) => (
                        <TouchableOpacity key={i} style={styles.resultItem} onPress={() => selectSearchResult(res)}>
                            <Text style={styles.resultTextBold}>
                                {searchText} ({i+1})
                            </Text>
                            <Text style={styles.resultSub}>
                                {res.streetName} • {Math.floor(res.dist)}m away
                            </Text>
                        </TouchableOpacity>
                    ))}
                    <TouchableOpacity style={styles.cancelSearch} onPress={() => setSearchResults([])}>
                        <Text style={{color:'red'}}>Cancel</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>

        {/* TARGET HUD */}
        {targetZone && (
             <View style={styles.targetHud}>
                 <Text style={{color:'white', fontWeight:'bold'}}>TARGET: {targetZone.name}</Text>
             </View>
        )}

        {toast && <View style={styles.toast}><Text style={styles.toastText}>{toast}</Text></View>}
    </View>
  );

  const renderProfile = () => {
    const streets = polygons.filter(p => p.type === 'street');
    const landmarks = polygons.filter(p => p.type === 'landmark');
    
    let distText = "No active target";
    if (targetZone && userLocation) {
        const d = Math.floor(getDistance(userLocation, targetZone));
        distText = `${d} meters away`;
    }

    return (
        <ScrollView style={styles.profileContainer}>
            <Text style={styles.headerTitle}>Commander Profile</Text>
            
            <View style={styles.statCard}>
                <Text style={styles.cashLarge}>${cash}</Text>
                <Text style={styles.subLabel}>WAR CHEST</Text>
            </View>

            <View style={[styles.section, {borderColor: 'lime', borderWidth: 1}]}>
                <Text style={[styles.sectionTitle, {color: 'green'}]}>CURRENT MISSION</Text>
                <Text style={styles.targetName}>{targetZone ? targetZone.name : "None Set"}</Text>
                <Text style={styles.targetStatus}>{targetZone ? `Distance: ${distText}` : "Search a place to set target"}</Text>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>🏰 LANDMARKS ({landmarks.length})</Text>
                {landmarks.map(p => (
                    <Text key={p.id} style={styles.rowTextBold}>{p.name}</Text>
                ))}
                {landmarks.length === 0 && <Text style={styles.emptyText}>Capture highlighted targets.</Text>}
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>🛣️ STREETS ({streets.length})</Text>
                {streets.map(p => (
                    <Text key={p.id} style={styles.simpleRow}>{p.name} {p.level > 1 ? "⭐" : ""}</Text>
                ))}
            </View>

            <View style={{height: 100}} /> 
        </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
        <View style={styles.content}>
            {activeTab === 'explore' && renderMap()}
            {activeTab === 'profile' && renderProfile()}
        </View>

        <View style={styles.navBar}>
            <TouchableOpacity 
                style={[styles.navBtn, activeTab === 'explore' && styles.activeNav]} 
                onPress={() => setActiveTab('explore')}>
                <Text style={[styles.navText, activeTab === 'explore' && styles.activeText]}>EXPLORE</Text>
            </TouchableOpacity>

            <View style={{width: 1, height: '50%', backgroundColor:'#ddd'}} />

            <TouchableOpacity 
                style={[styles.navBtn, activeTab === 'profile' && styles.activeNav]} 
                onPress={() => setActiveTab('profile')}>
                <Text style={[styles.navText, activeTab === 'profile' && styles.activeText]}>PROFILE</Text>
            </TouchableOpacity>
        </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f2' },
  fullScreen: { flex: 1 },
  content: { flex: 1 },
  map: { width: '100%', height: '100%' },
  
  // NAV BAR
  navBar: { 
    flexDirection: 'row', height: 80, backgroundColor: 'white', 
    borderTopWidth: 1, borderColor: '#ddd', paddingBottom: 20, paddingTop: 10,
    elevation: 20, justifyContent: 'space-evenly', alignItems: 'center'
  },
  navBtn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navText: { fontWeight: 'bold', color: '#999', fontSize: 14 },
  activeNav: {  },
  activeText: { color: 'black', fontSize: 16, borderBottomWidth: 2, borderColor: 'black' },

  // SEARCH HUD
  topHud: { position: 'absolute', top: 50, width: '100%', alignItems: 'center', zIndex: 10 },
  searchBar: { 
    flexDirection: 'row', width: '90%', backgroundColor: 'white', 
    borderRadius: 10, padding: 5, elevation: 5, alignItems: 'center'
  },
  searchInput: { flex: 1, paddingHorizontal: 15, height: 40 },
  searchBtn: { padding: 10, backgroundColor: '#eee', borderRadius: 8 },

  // DROPDOWN
  dropdown: {
      position: 'absolute', top: 55, width: '90%', backgroundColor: 'white', 
      borderRadius: 10, padding: 10, elevation: 10, zIndex: 20
  },
  dropdownHeader: { fontWeight: 'bold', marginBottom: 5, color: '#666' },
  resultItem: { padding: 10, borderBottomWidth: 1, borderColor: '#eee' },
  resultTextBold: { fontSize: 16, fontWeight: 'bold' },
  resultSub: { fontSize: 12, color: '#666' },
  cancelSearch: { alignItems: 'center', padding: 10, marginTop: 5 },

  // TARGET HUD
  targetHud: {
      position: 'absolute', bottom: 20, alignSelf: 'center', 
      backgroundColor: 'rgba(0,0,0,0.8)', padding: 10, borderRadius: 20
  },
  lootboxMarker: { backgroundColor: 'white', padding: 5, borderRadius: 10, borderWidth: 2, borderColor: 'gold' },

  // PROFILE
  profileContainer: { flex: 1, padding: 20, paddingTop: 60 },
  headerTitle: { fontSize: 28, fontWeight: '900', marginBottom: 20, color: '#333' },
  statCard: { backgroundColor: 'black', padding: 20, borderRadius: 15, marginBottom: 20, alignItems: 'center' },
  cashLarge: { color: '#00ff00', fontSize: 36, fontWeight: 'bold' },
  subLabel: { color: '#666', fontSize: 12, letterSpacing: 2 },
  section: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 15, elevation: 2 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: '#555', marginBottom: 10 },
  targetName: { fontSize: 22, fontWeight: 'bold', color: '#000' },
  targetStatus: { fontSize: 14, color: '#666', marginTop: 5 },
  rowTextBold: { fontWeight: 'bold', fontSize: 16, marginBottom: 5 },
  simpleRow: { fontSize: 16, marginBottom: 5, color: '#333' },
  emptyText: { fontStyle: 'italic', color: '#999' },

  toast: { position: 'absolute', top: 120, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.8)', padding: 10, borderRadius: 20 },
  toastText: { color: 'white', fontWeight: 'bold' },
});
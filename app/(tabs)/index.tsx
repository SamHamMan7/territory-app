import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import MapView, { Circle, Polygon, Polyline, Region } from 'react-native-maps';

const POLYGONS_KEY = 'territory_polygons_v8'; // Tycoon Update

// --- TYPES ---
type Coord = { latitude: number; longitude: number };
type TerritoryType = 'street' | 'landmark' | 'city' | 'unknown';
type BuildingType = 'none' | 'factory' | 'bunker';

type Territory = { 
  coords: Coord[]; 
  id: string;
  name: string;
  type: TerritoryType;
  area: number;
  level: number; 
  building: BuildingType; // NEW: What is built here?
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

  // Economy
  const [cash, setCash] = useState(500); // Start rich for testing
  const [lastCollected, setLastCollected] = useState(Date.now());
  const [activeTab, setActiveTab] = useState<'shop' | 'explore' | 'profile'>('explore');

  // Search
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]); 
  const [isSearching, setIsSearching] = useState(false);
  const [targetZone, setTargetZone] = useState<{ latitude: number; longitude: number; radius: number, name: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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
        
        const time = await AsyncStorage.getItem('last_collected');
        if (time) setLastCollected(parseInt(time));
      } catch (e) { console.warn('Failed to load:', e); }
    };
    load();
  }, []);

  useEffect(() => {
    const save = async () => {
      try { 
          await AsyncStorage.setItem(POLYGONS_KEY, JSON.stringify(polygons));
          await AsyncStorage.setItem('last_collected', lastCollected.toString());
      } catch (e) {}
    };
    const t = setTimeout(save, 500);
    return () => clearTimeout(t);
  }, [polygons, lastCollected]);

  // --- GAME ENGINE ---
  useEffect(() => {
    let subscription: { remove: () => void } | null = null;
    const startTracking = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      
      const loc = await Location.getCurrentPositionAsync({});
      setUserLocation(loc.coords);
      setInitialRegion({ latitude: loc.coords.latitude, longitude: loc.coords.longitude, latitudeDelta: 0.005, longitudeDelta: 0.005 });

      subscription = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 4 }, async (newLoc) => {
        const newPoint = { latitude: newLoc.coords.latitude, longitude: newLoc.coords.longitude };
        setUserLocation(newPoint);

        setPath((curr) => {
          if (curr.length > 400) curr = curr.slice(-200);
          const updated = [...curr, newPoint];

          // Loop Detection
          if (updated.length >= 4) {
            const last = updated[updated.length - 1];
            for (let i = Math.max(0, updated.length - 50); i < updated.length - 2; i++) {
               if (getIntersection(last, newPoint, updated[i], updated[i + 1])) {
                 const loop = updated.slice(i);
                 const closed = [...loop, loop[0]]; 
                 const area = getPolygonArea(closed);

                 // Lowered threshold to 20sqm so you can test it easily!
                 if (area < 20) return updated; 

                 const center = getCentroid(closed);
                 (async () => {
                    let name = "Unknown Land";
                    let type: TerritoryType = 'street'; 
                    let bonus = 0;

                    if (targetZone && getDistance(center, targetZone) < targetZone.radius) {
                        name = targetZone.name;
                        type = 'landmark';
                        bonus = 500;
                        setTargetZone(null); setSearchText("");
                        Alert.alert("🎯 TARGET CONQUERED", `You captured ${name}!\nBonus: $500`);
                    } else {
                        try {
                            const [addr] = await Location.reverseGeocodeAsync(center);
                            if (addr) {
                                if (area > 20000) { name = addr.district || "Sector"; type = 'city'; bonus = 100; } 
                                else { name = addr.name || addr.street || "Road"; type = 'street'; bonus = 20; }
                            }
                        } catch (e) {}
                    }

                    const newT: Territory = {
                        coords: closed, id: Date.now().toString(), name, type, 
                        area: Math.floor(area), level: 1, building: 'none', 
                        date: new Date().toLocaleDateString()
                    };
                    setPolygons(p => [...p, newT]);
                    setCash(c => c + 10 + bonus);
                    showToast(`Captured: ${name}`);
                 })();
                 return [newPoint]; 
               }
            }
          }
          return updated;
        });
      });
    };
    startTracking();
    return () => { if (subscription) subscription.remove(); };
  }, [targetZone]); 

  // --- SMART SEARCH (With Auto-Correction) ---
  const performSearch = async () => {
    Keyboard.dismiss();
    if (!searchText.trim()) return;
    setIsSearching(true);

    const doSearch = async (query: string) => {
        const results = await Location.geocodeAsync(query);
        if (results.length > 0) return results;
        return [];
    };

    try {
      // 1. Try exact search
      let results = await doSearch(searchText);

      // 2. If failed, try appending current city (Smart Retry)
      if (results.length === 0 && userLocation) {
          const [addr] = await Location.reverseGeocodeAsync(userLocation);
          if (addr && addr.city) {
              const smartQuery = `${searchText} ${addr.city}`;
              console.log("Smart Retry:", smartQuery);
              results = await doSearch(smartQuery);
          }
      }

      if (results.length === 0) {
        Alert.alert("Not Found", "Try adding a city name (e.g., 'McDonalds Houston')");
        setIsSearching(false);
        return;
      }

      // 3. Process & Sort Results
      const enriched = await Promise.all(results.map(async (res: any) => {
          let dist = userLocation ? getDistance(userLocation, {latitude: res.latitude, longitude: res.longitude}) : 0;
          let label = "Location";
          try {
              const [a] = await Location.reverseGeocodeAsync({latitude: res.latitude, longitude: res.longitude});
              if (a) label = a.name || a.street || a.city || "Point";
          } catch(e) {}
          return { ...res, dist, label };
      }));

      enriched.sort((a, b) => a.dist - b.dist);
      setSearchResults(enriched.slice(0, 5)); // Show top 5
      setIsSearching(false);

    } catch (e) { 
        Alert.alert('Error', 'Search failed. Check internet.'); 
        setIsSearching(false);
    }
  };

  const selectSearchResult = (result: any) => {
      const region = { latitude: result.latitude, longitude: result.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 };
      const missionName = `${searchText} (${result.label})`;
      setTargetZone({ latitude: result.latitude, longitude: result.longitude, radius: 150, name: missionName });
      setInitialRegion(region);
      mapRef.current?.animateToRegion(region, 1000);
      setSearchResults([]); 
      showToast(`Target Set! ${Math.floor(result.dist)}m away`);
  };

  // --- BUILD & UPGRADE SYSTEM ---
  const handleTerritoryPress = (index: number) => {
    const t = polygons[index];
    
    Alert.alert(
      t.name, 
      `Type: ${t.type.toUpperCase()}\nBuilding: ${t.building.toUpperCase() || "None"}`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Build Factory ($300)", onPress: () => buildStructure(index, 'factory', 300) },
        { text: "Upgrade Land ($100)", onPress: () => buildStructure(index, 'upgrade', 100) }
      ]
    );
  };

  const buildStructure = (index: number, type: 'factory' | 'upgrade', cost: number) => {
      if (cash < cost) { Alert.alert("Insufficient Funds"); return; }
      
      const updated = [...polygons];
      const t = updated[index];

      if (type === 'factory') {
          if (t.building !== 'none') { Alert.alert("Occupied", "Already has a building!"); return; }
          t.building = 'factory';
          showToast("Factory Built! 🏭");
      } else {
          if (t.level >= 2) { Alert.alert("Max Level"); return; }
          t.level = 2;
          showToast("Land Upgraded! ⭐");
      }

      setCash(c => c - cost);
      setPolygons(updated);
  };

  // --- INCOME COLLECTION ---
  const collectIncome = () => {
      const now = Date.now();
      const minsPassed = (now - lastCollected) / 60000;
      
      if (minsPassed < 1) {
          Alert.alert("Chill!", "Production in progress. Check back later.");
          return;
      }

      // LOGIC: Factories make money based on nearby CITIES
      // Base: $10 per factory.
      // Bonus: +$5 for every City territory you own.
      const factories = polygons.filter(p => p.building === 'factory').length;
      const cities = polygons.filter(p => p.type === 'city').length;
      
      if (factories === 0) {
          Alert.alert("No Industry", "Build factories on your land to earn passive income.");
          return;
      }

      const incomePerFactory = 10 + (cities * 5);
      const totalIncome = Math.floor(factories * incomePerFactory * minsPassed); // Scale by time

      // Cap at 24 hours to prevent overflow logic
      const payout = Math.min(totalIncome, factories * 5000);

      setCash(c => c + payout);
      setLastCollected(now);
      Alert.alert("💰 PAYDAY", `Factories produced $${payout}!\n(Based on ${cities} Cities owned)`);
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
                let fill = "rgba(255,215,0,0.2)"; 
                let stroke = "orange";
                if (poly.level > 1) { fill = "rgba(0,255,255,0.3)"; stroke = "cyan"; }
                if (poly.building === 'factory') { fill = "rgba(100,100,100,0.6)"; stroke = "black"; }

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

            {targetZone && userLocation && (
                <Polyline coordinates={[userLocation, targetZone]} strokeColor="lime" strokeWidth={3} lineDashPattern={[10, 10]} />
            )}
            {targetZone && <Circle center={targetZone} radius={targetZone.radius} fillColor="rgba(0,255,0,0.2)" strokeColor="lime" />}
        </MapView>

        {/* SEARCH HUD */}
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
                    {isSearching ? <ActivityIndicator size="small" color="black"/> : <Text>🔍</Text>}
                </TouchableOpacity>
            </View>

            {searchResults.length > 0 && (
                <View style={styles.dropdown}>
                    <Text style={styles.dropdownHeader}>Select Target:</Text>
                    {searchResults.map((res, i) => (
                        <TouchableOpacity key={i} style={styles.resultItem} onPress={() => selectSearchResult(res)}>
                            <Text style={{fontWeight:'bold'}}>{res.label}</Text>
                            <Text style={{fontSize:12, color:'#666'}}>{Math.floor(res.dist)}m away</Text>
                        </TouchableOpacity>
                    ))}
                    <TouchableOpacity style={styles.cancelSearch} onPress={() => setSearchResults([])}><Text style={{color:'red'}}>Close</Text></TouchableOpacity>
                </View>
            )}
        </View>

        {targetZone && <View style={styles.targetHud}><Text style={{color:'white', fontWeight:'bold'}}>TARGET: {targetZone.name}</Text></View>}
        {toast && <View style={styles.toast}><Text style={styles.toastText}>{toast}</Text></View>}
    </View>
  );

  const renderProfile = () => {
    const factories = polygons.filter(p => p.building === 'factory').length;
    const cities = polygons.filter(p => p.type === 'city').length;
    
    return (
        <ScrollView style={styles.profileContainer}>
            <Text style={styles.headerTitle}>Tycoon Profile</Text>
            
            <View style={styles.statCard}>
                <Text style={styles.cashLarge}>${cash}</Text>
                <Text style={styles.subLabel}>NET WORTH</Text>
                <TouchableOpacity style={styles.collectBtn} onPress={collectIncome}>
                    <Text style={{fontWeight:'bold'}}>COLLECT FACTORY INCOME</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>🏭 INDUSTRY</Text>
                <Text style={styles.simpleRow}>Factories Owned: {factories}</Text>
                <Text style={styles.simpleRow}>Cities Connected: {cities}</Text>
                <Text style={{color:'green', marginTop:5}}>Current Rate: ${factories * (10 + cities*5)} / min</Text>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>🗺️ TERRITORIES ({polygons.length})</Text>
                {polygons.map(p => (
                    <Text key={p.id} style={styles.rowText}>
                        {p.name} {p.building === 'factory' ? "🏭" : ""} {p.level > 1 ? "⭐" : ""}
                    </Text>
                ))}
            </View>
            <View style={{height: 100}} /> 
        </ScrollView>
    );
  };

  const renderShop = () => (
    <View style={styles.profileContainer}>
        <Text style={styles.headerTitle}>Asset Management</Text>
        <Text style={{textAlign:'center', marginBottom:20}}>Cash Available: ${cash}</Text>
        
        <View style={styles.shopItem}>
            <Text style={styles.shopTitle}>🏭 Industrial Factory</Text>
            <Text style={styles.shopCost}>Cost: $300</Text>
            <Text style={styles.shopDesc}>Generates passive income. Bonus cash if you own nearby Cities.</Text>
            <Text style={{fontStyle:'italic', marginTop:5}}>How to build: Tap a territory on the Explore map.</Text>
        </View>

        <View style={styles.shopItem}>
            <Text style={styles.shopTitle}>⭐ Urban Upgrade</Text>
            <Text style={styles.shopCost}>Cost: $100</Text>
            <Text style={styles.shopDesc}>Increases the value of a territory.</Text>
        </View>
    </View>
  );

  return (
    <View style={styles.container}>
        <View style={styles.content}>
            {activeTab === 'explore' && renderMap()}
            {activeTab === 'profile' && renderProfile()}
            {activeTab === 'shop' && renderShop()}
        </View>

        <View style={styles.navBar}>
            <TouchableOpacity style={styles.navBtn} onPress={() => setActiveTab('shop')}>
                <Text style={[styles.navText, activeTab === 'shop' && styles.activeText]}>ASSETS</Text>
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.navBtn} onPress={() => setActiveTab('explore')}>
                <Text style={[styles.navText, activeTab === 'explore' && styles.activeText]}>EXPLORE</Text>
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.navBtn} onPress={() => setActiveTab('profile')}>
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
  
  navBar: { flexDirection: 'row', height: 80, backgroundColor: 'white', borderTopWidth: 1, borderColor: '#ddd', paddingBottom: 20, paddingTop: 10, elevation: 20, justifyContent: 'space-evenly', alignItems: 'center' },
  navBtn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navText: { fontWeight: 'bold', color: '#999', fontSize: 14 },
  activeText: { color: 'black', fontSize: 16, borderBottomWidth: 2, borderColor: 'black' },
  divider: { width: 1, height: '40%', backgroundColor: '#eee' },

  topHud: { position: 'absolute', top: 50, width: '100%', alignItems: 'center', zIndex: 10 },
  searchBar: { flexDirection: 'row', width: '90%', backgroundColor: 'white', borderRadius: 10, padding: 5, elevation: 5, alignItems: 'center' },
  searchInput: { flex: 1, paddingHorizontal: 15, height: 40 },
  searchBtn: { padding: 10, backgroundColor: '#eee', borderRadius: 8 },

  dropdown: { position: 'absolute', top: 55, width: '90%', backgroundColor: 'white', borderRadius: 10, padding: 10, elevation: 10, zIndex: 20 },
  dropdownHeader: { fontWeight: 'bold', marginBottom: 5, color: '#666' },
  resultItem: { padding: 10, borderBottomWidth: 1, borderColor: '#eee' },
  cancelSearch: { alignItems: 'center', padding: 10, marginTop: 5 },

  targetHud: { position: 'absolute', bottom: 20, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.8)', padding: 10, borderRadius: 20 },

  profileContainer: { flex: 1, padding: 20, paddingTop: 60 },
  headerTitle: { fontSize: 28, fontWeight: '900', marginBottom: 20, color: '#333' },
  statCard: { backgroundColor: 'black', padding: 20, borderRadius: 15, marginBottom: 20, alignItems: 'center' },
  cashLarge: { color: '#00ff00', fontSize: 36, fontWeight: 'bold' },
  subLabel: { color: '#666', fontSize: 12, letterSpacing: 2 },
  collectBtn: { marginTop: 15, backgroundColor: 'gold', padding: 10, borderRadius: 5 },
  
  section: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 15, elevation: 2 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: '#555', marginBottom: 10 },
  rowText: { fontSize: 16, marginBottom: 5, color: '#333' },
  simpleRow: { fontSize: 16, marginBottom: 5, color: '#333' },
  
  shopItem: { backgroundColor: 'white', padding: 20, borderRadius: 10, marginBottom: 15, elevation: 2 },
  shopTitle: { fontSize: 18, fontWeight: 'bold' },
  shopCost: { color: 'green', fontWeight: 'bold', fontSize: 16, marginVertical: 5 },
  shopDesc: { color: '#666', lineHeight: 20 },

  toast: { position: 'absolute', top: 120, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.8)', padding: 10, borderRadius: 20 },
  toastText: { color: 'white', fontWeight: 'bold' },
});
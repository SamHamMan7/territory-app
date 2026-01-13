import * as Location from 'expo-location';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'; // Added ActivityIndicator
import MapView, { Polyline } from 'react-native-maps';

export default function App() {
  const [path, setPath] = useState([]);
  const [initialRegion, setInitialRegion] = useState(null);

  useEffect(() => {
    let subscription; // 1. Define variable here so cleanup can access it

    const startTracking = async () => {
      // Ask Permission
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log("Permission denied");
        return;
      }

      // Get initial location (so map centers on you immediately)
      let location = await Location.getCurrentPositionAsync({});
      setInitialRegion({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.005, // Zoom level (smaller = closer)
        longitudeDelta: 0.005,
      });

      // Start Watching
      subscription = await Location.watchPositionAsync({
        accuracy: Location.Accuracy.High,
        distanceInterval: 5, 
      }, (newLocation) => {
        setPath((oldPath) => [...oldPath, newLocation.coords]);
      });
    };

    startTracking();

    // 2. The Cleanup Function (Runs when component unmounts)
    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, []);

  // 3. UX Fix: Don't render the map until we know where you are
  if (!initialRegion) {
    return (
      <View style={[styles.container, styles.loading]}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text>Locating you...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView 
        style={styles.map} 
        showsUserLocation={true} 
        followsUserLocation={true}
        initialRegion={initialRegion}
      >
        <Polyline coordinates={path} strokeColor="red" strokeWidth={5} />
      </MapView>
      
      <View style={styles.hud}>
        <Text style={{color: 'white'}}>Points: {path.length}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width: '100%', height: '100%' },
  hud: { position: 'absolute', bottom: 50, left: 20, backgroundColor: 'rgba(0,0,0,0.6)', padding: 10, borderRadius: 8 },
  loading: { justifyContent: 'center', alignItems: 'center' }
});
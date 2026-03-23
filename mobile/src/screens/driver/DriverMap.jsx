import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert
} from 'react-native';
import MapView, { Marker, Polyline, Circle, UrlTile, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useAuthStore, api } from '../../store/useStore';
import { connectSocket, emitDriverLocation, listenToEvents } from '../../services/socket';

const KOZHIKODE = { latitude: 11.2588, longitude: 75.7804 };

export default function DriverMap({ navigation }) {
  const { user } = useAuthStore();
  const [currentLocation, setCurrentLocation] = useState(KOZHIKODE);
  const [vehicle, setVehicle] = useState(null);
  const [route, setRoute] = useState([]); // polyline points [{lat,lng}]
  const [trafficBlocks, setTrafficBlocks] = useState([]);
  const [showReroute, setShowReroute] = useState(false);
  const [rerouteRoute, setRerouteRoute] = useState([]);
  const locationWatcher = useRef(null);
  const locationInterval = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    activateKeepAwakeAsync(); // Prevent screen sleep during dispatch

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return Alert.alert('Permission needed', 'Location required for driving');

      // Go active
      try {
        const loc = await Location.getCurrentPositionAsync({});
        const newLoc = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setCurrentLocation(newLoc);
        const res = await api.post('/api/vehicles/active', {
          location: { lat: loc.coords.latitude, lng: loc.coords.longitude }
        });
        setVehicle(res.data.vehicle);
        loadActiveBlocks();
      } catch (err) { console.error('Go active error:', err); }

      // GPS watcher — every 3 seconds
      locationWatcher.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 3000, distanceInterval: 10 },
        (loc) => {
          const newLoc = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          setCurrentLocation(newLoc);
          emitDriverLocation(loc.coords.latitude, loc.coords.longitude); // driver:location every 3s
          checkBlockProximity(loc.coords.latitude, loc.coords.longitude);
        }
      );
    })();

    // Socket events
    const socket = connectSocket(user._id);
    listenToEvents({
      onTrafficBlock: (data) => setTrafficBlocks(prev => [...prev, data.block]),
      onTrafficClear: (data) => setTrafficBlocks(prev => prev.filter(b => b._id !== data.blockId)),
    });

    return () => {
      deactivateKeepAwake();
      locationWatcher.current?.remove();
    };
  }, []);

  const loadActiveBlocks = async () => {
    try {
      const res = await api.get('/api/traffic/active');
      setTrafficBlocks(res.data.blocks);
    } catch { /* non-blocking */ }
  };

  const checkBlockProximity = (lat, lng) => {
    const nearby = trafficBlocks.some(block => {
      const d = getDistanceMetres(lat, lng, block.lat, block.lng);
      return d <= 300;
    });
    if (nearby) setShowReroute(true);
  };

  const handleArrived = async () => {
    if (!vehicle) return;
    try {
      await api.patch(`/api/vehicles/${vehicle._id}/arrived`);
      Alert.alert('✅ Arrived', 'Dispatcher has been notified.');
      navigation.goBack();
    } catch (err) { Alert.alert('Error', 'Could not mark as arrived'); }
  };

  const handleReroute = async () => {
    if (!vehicle?.destination?.lat || !currentLocation) return;
    setShowReroute(false);
    try {
      const avoidPolygons = {
        type: 'MultiPolygon',
        coordinates: trafficBlocks.map(b => [[
          [b.lng - 0.002, b.lat - 0.002],
          [b.lng + 0.002, b.lat - 0.002],
          [b.lng + 0.002, b.lat + 0.002],
          [b.lng - 0.002, b.lat + 0.002],
          [b.lng - 0.002, b.lat - 0.002],
        ]])
      };
      const res = await api.post('/api/route/reroute', {
        start: [currentLocation.longitude, currentLocation.latitude],
        end: [vehicle.destination.lng, vehicle.destination.lat],
        avoidPolygons
      });
      if (res.data.route) {
        const coords = res.data.route.geometry?.coordinates?.map(([lng, lat]) => ({ lat, lng })) || [];
        setRerouteRoute(coords);
      }
    } catch { /* use original route */ }
  };

  const vehicleEmoji = { ambulance: '🚑', fire: '🚒', rescue: '⛵', police: '🚓' }[user?.vehicleType] || '🚗';

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={{ ...currentLocation, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
        showsUserLocation={false}
        mapType="none"
        customMapStyle={darkMapStyle}
      >
        {/* CartoDB dark tiles — no {s} subdomain, react-native-maps uses direct URL */}
        <UrlTile
          urlTemplate="https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
          shouldReplaceMapContent={true}
          maximumZ={19}
          flipY={false}
        />

        {/* Driver position */}
        <Marker coordinate={currentLocation}>
          <View style={styles.driverPin}>
            <Text style={{ fontSize: 20 }}>{vehicleEmoji}</Text>
          </View>
        </Marker>

        {/* Route polyline */}
        {route.length > 0 && (
          <Polyline
            coordinates={route.map(p => ({ latitude: p.lat, longitude: p.lng }))}
            strokeColor="#1E90FF"
            strokeWidth={4}
          />
        )}

        {/* Reroute polyline */}
        {rerouteRoute.length > 0 && (
          <Polyline
            coordinates={rerouteRoute.map(p => ({ latitude: p.lat, longitude: p.lng }))}
            strokeColor="#00C896"
            strokeWidth={4}
            lineDashPattern={[10, 5]}
          />
        )}

        {/* Traffic block circles */}
        {trafficBlocks.map(block => (
          <Circle
            key={block._id}
            center={{ latitude: block.lat, longitude: block.lng }}
            radius={block.radius}
            fillColor="rgba(255,71,87,0.2)"
            strokeColor="#FF4757"
            strokeWidth={2}
          />
        ))}

        {/* Destination pin */}
        {vehicle?.destination?.lat && (
          <Marker
            coordinate={{ latitude: vehicle.destination.lat, longitude: vehicle.destination.lng }}
            title={vehicle.destination.name || 'Destination'}
          />
        )}
      </MapView>

      {/* Top status pill */}
      <View style={styles.statusPill}>
        <View style={[styles.dot, { backgroundColor: '#2ED573' }]} />
        <Text style={styles.statusText}>{vehicleEmoji} {user?.vehicleType?.toUpperCase() || 'VEHICLE'}</Text>
      </View>

      {/* Bottom card — destination + arrived */}
      <View style={styles.bottomCard}>
        {vehicle?.destination?.name ? (
          <>
            <Text style={styles.destLabel}>Destination</Text>
            <Text style={styles.destName}>{vehicle.destination.name}</Text>
          </>
        ) : (
          <Text style={styles.destLabel}>No active dispatch</Text>
        )}
        <TouchableOpacity style={styles.arrivedBtn} onPress={handleArrived}>
          <Text style={styles.arrivedBtnText}>✅ Arrived</Text>
        </TouchableOpacity>
      </View>

      {/* Reroute bottom sheet */}
      {showReroute && (
        <View style={styles.rerouteSheet}>
          <Text style={styles.rerouteTitle}>⚠️ Traffic block nearby</Text>
          <Text style={styles.rerouteText}>A road block is within 300m of your route.</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <TouchableOpacity style={[styles.rerouteBtn, { backgroundColor: '#00C896' }]} onPress={handleReroute}>
              <Text style={{ color: '#0F1923', fontWeight: '700' }}>Reroute with AI</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.rerouteBtn, { borderWidth: 1, borderColor: '#2D3F55' }]} onPress={() => setShowReroute(false)}>
              <Text style={{ color: '#8A9BB0' }}>Ignore</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

function getDistanceMetres(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const darkMapStyle = [];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1923' },
  map: { flex: 1 },
  driverPin: {
    backgroundColor: '#1E90FF',
    borderRadius: 24,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  statusPill: {
    position: 'absolute',
    top: 52,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(26,37,53,0.9)',
    borderRadius: 50,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: '#2D3F55',
    minWidth: 48,
    minHeight: 44,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },
  bottomCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1A2535',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: '#2D3F55',
  },
  destLabel: { color: '#8A9BB0', fontSize: 12, marginBottom: 4 },
  destName: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginBottom: 16 },
  arrivedBtn: {
    backgroundColor: '#00C896',
    borderRadius: 50,
    padding: 16,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  arrivedBtnText: { color: '#0F1923', fontWeight: '700', fontSize: 16 },
  rerouteSheet: {
    position: 'absolute',
    bottom: 180,
    left: 16,
    right: 16,
    backgroundColor: '#1A2535',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#FF4757',
  },
  rerouteTitle: { color: '#FF4757', fontWeight: '700', fontSize: 16, marginBottom: 4 },
  rerouteText: { color: '#8A9BB0', fontSize: 13 },
  rerouteBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 50,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
});

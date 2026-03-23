import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useAuthStore, api } from '../../store/useStore';
import { connectSocket, emitDriverLocation, listenToEvents } from '../../services/socket';

const KOZHIKODE = { lat: 11.2588, lng: 75.7804 };

/**
 * Generates a self-contained Leaflet map HTML page
 * Free CartoDB dark tiles — no API key needed
 */
function getMapHTML(lat, lng) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; }
    html, body, #map { width: 100%; height: 100%; background: #0F1923; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: false }).setView([${lat}, ${lng}], 15);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: ''
    }).addTo(map);

    // Driver marker
    var driverIcon = L.divIcon({
      className: '',
      html: '<div style="background:#1E90FF;border:2px solid #fff;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:18px;">🚑</div>',
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });
    var driverMarker = L.marker([${lat}, ${lng}], { icon: driverIcon }).addTo(map);

    // Destination marker (hidden initially)
    var destMarker = null;

    // Route polyline
    var routeLine = null;
    var rerouteLine = null;

    // Traffic block circles
    var blockLayers = {};

    // Update driver position
    function updateDriver(lat, lng, emoji) {
      driverMarker.setLatLng([lat, lng]);
      if (emoji) {
        driverIcon = L.divIcon({
          className: '',
          html: '<div style="background:#1E90FF;border:2px solid #fff;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:18px;">' + emoji + '</div>',
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        });
        driverMarker.setIcon(driverIcon);
      }
      map.panTo([lat, lng]);
    }

    // Set destination
    function setDestination(lat, lng, name) {
      if (destMarker) map.removeLayer(destMarker);
      destMarker = L.marker([lat, lng]).addTo(map).bindPopup(name || 'Destination');
    }

    // Add traffic block
    function addBlock(id, lat, lng, radius) {
      blockLayers[id] = L.circle([lat, lng], {
        radius: radius,
        color: '#FF4757',
        fillColor: '#FF4757',
        fillOpacity: 0.2,
        weight: 2
      }).addTo(map);
    }

    // Remove traffic block
    function removeBlock(id) {
      if (blockLayers[id]) {
        map.removeLayer(blockLayers[id]);
        delete blockLayers[id];
      }
    }

    // Draw route
    function drawRoute(coords, color, dashed) {
      if (routeLine && !dashed) map.removeLayer(routeLine);
      if (rerouteLine && dashed) map.removeLayer(rerouteLine);
      var line = L.polyline(coords, { color: color || '#1E90FF', weight: 4, dashArray: dashed ? '10 5' : null }).addTo(map);
      if (dashed) rerouteLine = line;
      else routeLine = line;
    }

    // Listen for messages from React Native
    window.addEventListener('message', function(e) {
      try {
        var data = JSON.parse(e.data);
        if (data.type === 'updateDriver') updateDriver(data.lat, data.lng, data.emoji);
        if (data.type === 'setDestination') setDestination(data.lat, data.lng, data.name);  
        if (data.type === 'addBlock') addBlock(data.id, data.lat, data.lng, data.radius);
        if (data.type === 'removeBlock') removeBlock(data.id);
        if (data.type === 'drawRoute') drawRoute(data.coords, data.color, data.dashed);
      } catch(err) {}
    });

    // Also handle Android postMessage
    document.addEventListener('message', function(e) {
      try {
        var data = JSON.parse(e.data);
        if (data.type === 'updateDriver') updateDriver(data.lat, data.lng, data.emoji);
        if (data.type === 'setDestination') setDestination(data.lat, data.lng, data.name);
        if (data.type === 'addBlock') addBlock(data.id, data.lat, data.lng, data.radius);
        if (data.type === 'removeBlock') removeBlock(data.id);
        if (data.type === 'drawRoute') drawRoute(data.coords, data.color, data.dashed);
      } catch(err) {}
    });
  </script>
</body>
</html>`;
}

export default function DriverMap() {
  const { user } = useAuthStore();
  const [currentLocation, setCurrentLocation] = useState(KOZHIKODE);
  const [vehicle, setVehicle] = useState(null);
  const [trafficBlocks, setTrafficBlocks] = useState([]);
  const [showReroute, setShowReroute] = useState(false);
  const webRef = useRef(null);
  const locationWatcher = useRef(null);

  const vehicleEmoji = { ambulance: '🚑', fire: '🚒', rescue: '⛵', police: '🚓' }[user?.vehicleType] || '🚗';

  // Send message to WebView map
  const sendToMap = useCallback((data) => {
    webRef.current?.postMessage(JSON.stringify(data));
  }, []);

  useEffect(() => {
    activateKeepAwakeAsync();

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return Alert.alert('Permission needed', 'Location required for driving');

      try {
        const loc = await Location.getCurrentPositionAsync({});
        const newLoc = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        setCurrentLocation(newLoc);
        try {
          const res = await api.post('/api/vehicles/active', { location: newLoc });
          setVehicle(res.data.vehicle);
          if (res.data.vehicle?.destination?.lat) {
            sendToMap({ type: 'setDestination', lat: res.data.vehicle.destination.lat, lng: res.data.vehicle.destination.lng, name: res.data.vehicle.destination.name });
          }
          loadActiveBlocks();
        } catch (vErr) {
          console.warn('Vehicle activation skipped:', vErr.response?.status || vErr.message);
        }
      } catch (err) { console.error('Location error:', err); }

      // GPS watcher — every 3 seconds
      locationWatcher.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 3000, distanceInterval: 10 },
        (loc) => {
          const newLoc = { lat: loc.coords.latitude, lng: loc.coords.longitude };
          setCurrentLocation(newLoc);
          sendToMap({ type: 'updateDriver', lat: newLoc.lat, lng: newLoc.lng, emoji: vehicleEmoji });
          emitDriverLocation(newLoc.lat, newLoc.lng);
          checkBlockProximity(newLoc.lat, newLoc.lng);
        }
      );
    })();

    // Socket events
    const socket = connectSocket(user._id);
    listenToEvents({
      onTrafficBlock: (data) => {
        setTrafficBlocks(prev => [...prev, data.block]);
        sendToMap({ type: 'addBlock', id: data.block._id, lat: data.block.lat, lng: data.block.lng, radius: data.block.radius });
      },
      onTrafficClear: (data) => {
        setTrafficBlocks(prev => prev.filter(b => b._id !== data.blockId));
        sendToMap({ type: 'removeBlock', id: data.blockId });
      },
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
      res.data.blocks.forEach(b => {
        sendToMap({ type: 'addBlock', id: b._id, lat: b.lat, lng: b.lng, radius: b.radius });
      });
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
        start: [currentLocation.lng, currentLocation.lat],
        end: [vehicle.destination.lng, vehicle.destination.lat],
        avoidPolygons
      });
      if (res.data.route?.geometry?.coordinates) {
        const coords = res.data.route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
        sendToMap({ type: 'drawRoute', coords, color: '#00C896', dashed: true });
      }
    } catch { /* use original route */ }
  };

  return (
    <View style={styles.container}>
      <WebView
        ref={webRef}
        source={{ html: getMapHTML(currentLocation.lat, currentLocation.lng) }}
        style={styles.map}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={['*']}
        scrollEnabled={false}
      />

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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1923' },
  map: { flex: 1, backgroundColor: '#0F1923' },
  statusPill: {
    position: 'absolute',
    top: 16,
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

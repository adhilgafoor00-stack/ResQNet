import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView,
  FlatList, ActivityIndicator, Animated, Dimensions
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useAuthStore, api } from '../../store/useStore';
import { connectSocket, emitDriverLocation, listenToEvents } from '../../services/socket';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Nearest hospitals in Kozhikode
const HOSPITALS = [
  { id: '1', name: 'Baby Memorial Hospital', lat: 11.2615, lng: 75.7830, distance: '1.2 km' },
  { id: '2', name: 'MIMS Hospital', lat: 11.2735, lng: 75.7784, distance: '2.4 km' },
  { id: '3', name: 'IMA Hospital', lat: 11.2505, lng: 75.7766, distance: '1.8 km' },
  { id: '4', name: 'Govt. Medical College', lat: 11.2580, lng: 75.7700, distance: '3.1 km' },
  { id: '5', name: 'Aster MIMS', lat: 11.2800, lng: 75.7900, distance: '4.0 km' },
];

function getMapHTML(lat, lng) {
  return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>*{margin:0;padding:0}html,body,#map{width:100%;height:100%;background:#121316}</style>
</head><body><div id="map"></div>
<script>
var map=L.map('map',{zoomControl:false}).setView([${lat},${lng}],14);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(map);

var driverIcon=L.divIcon({className:'',html:'<div style="background:#ff5252;border:3px solid #fff;border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 0 20px rgba(255,82,82,0.5)">🚑</div>',iconSize:[40,40],iconAnchor:[20,20]});
var driverMarker=L.marker([${lat},${lng}],{icon:driverIcon}).addTo(map);
var destMarker=null;
var routeLine=null;
var rerouteLine=null;
var blockLayers={};
var communityMarkers={};

function updateDriver(lat,lng){driverMarker.setLatLng([lat,lng]);map.panTo([lat,lng])}

function setDestination(lat,lng,name){
  if(destMarker)map.removeLayer(destMarker);
  var icon=L.divIcon({className:'',html:'<div style="background:#8ab4f8;border:2px solid #fff;border-radius:8px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 0 16px rgba(138,180,248,0.4)">🏥</div>',iconSize:[36,36],iconAnchor:[18,36]});
  destMarker=L.marker([lat,lng],{icon:icon}).addTo(map).bindPopup(name);
  map.fitBounds([[driverMarker.getLatLng().lat,driverMarker.getLatLng().lng],[lat,lng]],{padding:[60,60]});
}

function drawRoute(coords,color,dashed){
  if(routeLine&&!dashed)map.removeLayer(routeLine);
  if(rerouteLine&&dashed)map.removeLayer(rerouteLine);
  var line=L.polyline(coords,{color:color||'#8ab4f8',weight:5,opacity:0.9,dashArray:dashed?'12 6':null}).addTo(map);
  if(dashed){rerouteLine=line}else{routeLine=line}
}

function addBlock(id,lat,lng,radius){
  blockLayers[id]=L.circle([lat,lng],{radius:radius,color:'#ff5252',fillColor:'#ff5252',fillOpacity:0.15,weight:2}).addTo(map);
}
function removeBlock(id){if(blockLayers[id]){map.removeLayer(blockLayers[id]);delete blockLayers[id]}}

function addCommunity(id,lat,lng,name,status){
  if(communityMarkers[id])map.removeLayer(communityMarkers[id]);
  var color=status==='cleared'?'#4ade80':'#8ab4f8';
  var icon=L.divIcon({className:'',html:'<div style="background:'+color+';border:2px solid #fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px">👤</div>',iconSize:[24,24],iconAnchor:[12,12]});
  communityMarkers[id]=L.marker([lat,lng],{icon:icon}).addTo(map).bindPopup(name+' ('+status+')');
}

window.addEventListener('message',function(e){try{var d=JSON.parse(e.data);
  if(d.type==='updateDriver')updateDriver(d.lat,d.lng);
  if(d.type==='setDestination')setDestination(d.lat,d.lng,d.name);
  if(d.type==='drawRoute')drawRoute(d.coords,d.color,d.dashed);
  if(d.type==='addBlock')addBlock(d.id,d.lat,d.lng,d.radius);
  if(d.type==='removeBlock')removeBlock(d.id);
  if(d.type==='addCommunity')addCommunity(d.id,d.lat,d.lng,d.name,d.status);
}catch(err){}});
document.addEventListener('message',function(e){try{var d=JSON.parse(e.data);
  if(d.type==='updateDriver')updateDriver(d.lat,d.lng);
  if(d.type==='setDestination')setDestination(d.lat,d.lng,d.name);
  if(d.type==='drawRoute')drawRoute(d.coords,d.color,d.dashed);
  if(d.type==='addBlock')addBlock(d.id,d.lat,d.lng,d.radius);
  if(d.type==='removeBlock')removeBlock(d.id);
  if(d.type==='addCommunity')addCommunity(d.id,d.lat,d.lng,d.name,d.status);
}catch(err){}});
</script></body></html>`;
}

export default function DriverMap() {
  const { user } = useAuthStore();
  const [currentLocation, setCurrentLocation] = useState({ lat: 11.2588, lng: 75.7804 });
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [routeActive, setRouteActive] = useState(false);
  const [showOptimize, setShowOptimize] = useState(false);
  const [trafficBlocks, setTrafficBlocks] = useState([]);
  const [enrouteCommunity, setEnrouteCommunity] = useState([]);
  const [eta, setEta] = useState(null);
  const [view, setView] = useState('hospitals'); // 'hospitals' | 'map' | 'enroute'
  const webRef = useRef(null);
  const locationWatcher = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const sendToMap = useCallback((data) => {
    webRef.current?.postMessage(JSON.stringify(data));
  }, []);

  // Pulse animation for active status
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    activateKeepAwakeAsync();

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return Alert.alert('Permission needed', 'Location required');

      const loc = await Location.getCurrentPositionAsync({});
      setCurrentLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });

      locationWatcher.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 3000, distanceInterval: 10 },
        (loc) => {
          const newLoc = { lat: loc.coords.latitude, lng: loc.coords.longitude };
          setCurrentLocation(newLoc);
          sendToMap({ type: 'updateDriver', lat: newLoc.lat, lng: newLoc.lng });
          emitDriverLocation(newLoc.lat, newLoc.lng);
        }
      );
    })();

    const socket = connectSocket(user._id);
    listenToEvents({
      onTrafficBlock: (data) => {
        setTrafficBlocks(prev => [...prev, data.block]);
        sendToMap({ type: 'addBlock', id: data.block._id, lat: data.block.lat, lng: data.block.lng, radius: data.block.radius });
        if (routeActive) setShowOptimize(true);
      },
      onTrafficClear: (data) => {
        setTrafficBlocks(prev => prev.filter(b => b._id !== data.blockId));
        sendToMap({ type: 'removeBlock', id: data.blockId });
      },
      onCommunityAlert: () => {},
    });

    loadTrafficBlocks();

    return () => { deactivateKeepAwake(); locationWatcher.current?.remove(); };
  }, []);

  const loadTrafficBlocks = async () => {
    try {
      const res = await api.get('/api/traffic/active');
      setTrafficBlocks(res.data.blocks || []);
      (res.data.blocks || []).forEach(b => sendToMap({ type: 'addBlock', id: b._id, lat: b.lat, lng: b.lng, radius: b.radius }));
    } catch {}
  };

  const selectHospital = async (hospital) => {
    setSelectedHospital(hospital);
    setView('map');
    sendToMap({ type: 'setDestination', lat: hospital.lat, lng: hospital.lng, name: hospital.name });

    // Fetch route via OSRM
    try {
      const res = await api.post('/api/route', {
        start: [currentLocation.lng, currentLocation.lat],
        end: [hospital.lng, hospital.lat]
      });
      if (res.data.route?.geometry?.coordinates) {
        const coords = res.data.route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
        sendToMap({ type: 'drawRoute', coords, color: '#8ab4f8', dashed: false });
        setRouteActive(true);
        const dur = res.data.route.duration;
        setEta(dur ? `${Math.ceil(dur / 60)} min` : null);

        // Check if any traffic blocks are near the route
        if (trafficBlocks.length > 0) setShowOptimize(true);
      }
    } catch (err) {
      // Fallback: draw straight line
      sendToMap({ type: 'drawRoute', coords: [[currentLocation.lat, currentLocation.lng], [hospital.lat, hospital.lng]], color: '#8ab4f8', dashed: false });
      setRouteActive(true);
    }

    // Activate vehicle on backend
    try {
      await api.post('/api/vehicles/active', { location: currentLocation });
    } catch {}

    // Dispatch to destination (this alerts community within 500m)
    try {
      await api.post('/api/dispatch', {
        vehicleId: user._id,
        destination: { lat: hospital.lat, lng: hospital.lng, name: hospital.name }
      });
    } catch {}
  };

  const optimizeRoute = async () => {
    if (!selectedHospital) return;
    setShowOptimize(false);
    try {
      const avoidPolygons = {
        type: 'MultiPolygon',
        coordinates: trafficBlocks.map(b => [[
          [b.lng - 0.002, b.lat - 0.002], [b.lng + 0.002, b.lat - 0.002],
          [b.lng + 0.002, b.lat + 0.002], [b.lng - 0.002, b.lat + 0.002],
          [b.lng - 0.002, b.lat - 0.002],
        ]])
      };
      const res = await api.post('/api/route/reroute', {
        start: [currentLocation.lng, currentLocation.lat],
        end: [selectedHospital.lng, selectedHospital.lat],
        avoidPolygons
      });
      if (res.data.route?.geometry?.coordinates) {
        const coords = res.data.route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
        sendToMap({ type: 'drawRoute', coords, color: '#4ade80', dashed: true });
        const dur = res.data.route.duration;
        if (dur) setEta(`${Math.ceil(dur / 60)} min`);
        Alert.alert('✅ Route Optimized', 'New route avoids all traffic blocks.');
      }
    } catch {
      Alert.alert('Route unchanged', 'No alternative route available. Proceed with caution.');
    }
  };

  const handleArrived = async () => {
    try {
      const vehicles = await api.get('/api/vehicles/active');
      const myVehicle = vehicles.data.vehicles?.find(v => v.driver?.toString() === user._id);
      if (myVehicle) await api.patch(`/api/vehicles/${myVehicle._id}/arrived`);
      Alert.alert('✅ Arrived', 'Dispatcher notified. Great work!');
      setRouteActive(false);
      setSelectedHospital(null);
      setView('hospitals');
    } catch { Alert.alert('Arrived', 'Logged locally.'); }
  };

  // RENDER: Hospital Selection View
  const renderHospitalList = () => (
    <ScrollView style={styles.hospitalList} contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={styles.headerSection}>
        <View style={styles.profileRow}>
          <View style={styles.profileBadge}>
            <Text style={styles.profileBadgeText}>🚑</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.driverName}>{user?.name || 'Ambulance Driver'}</Text>
            <View style={styles.statusRow}>
              <Animated.View style={[styles.statusDot, { opacity: pulseAnim }]} />
              <Text style={styles.statusLabel}>Active • {user?.vehicleNumber || 'Unit'}</Text>
            </View>
          </View>
          <View style={styles.tierBadge}>
            <Text style={styles.tierText}>TIER 1</Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Select Destination</Text>
      <Text style={styles.sectionSub}>Nearest hospitals from your location</Text>

      {HOSPITALS.map(h => (
        <TouchableOpacity key={h.id} style={styles.hospitalCard} onPress={() => selectHospital(h)} activeOpacity={0.85}>
          <View style={styles.hospitalIcon}>
            <Text style={{ fontSize: 22 }}>🏥</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.hospitalName}>{h.name}</Text>
            <Text style={styles.hospitalDist}>{h.distance} away</Text>
          </View>
          <View style={styles.goBtn}>
            <Text style={styles.goBtnText}>GO →</Text>
          </View>
        </TouchableOpacity>
      ))}

      {/* Safety Protocols */}
      <View style={styles.protocolCard}>
        <Text style={styles.protocolTitle}>🛡️ SAFETY PROTOCOLS</Text>
        <View style={styles.protocolItem}>
          <View style={styles.protocolNum}><Text style={styles.protocolNumText}>01</Text></View>
          <Text style={styles.protocolText}>Activate siren and emergency lights before departing.</Text>
        </View>
        <View style={styles.protocolItem}>
          <View style={styles.protocolNum}><Text style={styles.protocolNumText}>02</Text></View>
          <Text style={styles.protocolText}>Follow optimized route to avoid traffic blocks.</Text>
        </View>
        <View style={styles.protocolItem}>
          <View style={styles.protocolNum}><Text style={styles.protocolNumText}>03</Text></View>
          <Text style={styles.protocolText}>Community members will be alerted automatically.</Text>
        </View>
      </View>
    </ScrollView>
  );

  // RENDER: Active Route Map View
  const renderMapView = () => (
    <View style={{ flex: 1 }}>
      <WebView
        ref={webRef}
        source={{ html: getMapHTML(currentLocation.lat, currentLocation.lng) }}
        style={styles.map}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={['*']}
        scrollEnabled={false}
      />

      {/* Top HUD */}
      <View style={styles.topHud}>
        <TouchableOpacity style={styles.backBtn} onPress={() => { setView('hospitals'); setRouteActive(false); }}>
          <Text style={{ color: '#e2e2e6', fontSize: 18 }}>←</Text>
        </TouchableOpacity>
        <View style={styles.etaCard}>
          <Text style={styles.etaLabel}>EST. ARRIVAL</Text>
          <Text style={styles.etaValue}>{eta || '--:--'}</Text>
        </View>
      </View>

      {/* Destination card */}
      <View style={styles.destCard}>
        <View style={styles.destTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.destLabel}>DESTINATION</Text>
            <Text style={styles.destName}>{selectedHospital?.name}</Text>
          </View>
          <TouchableOpacity style={styles.enrouteBtn} onPress={() => setView('enroute')}>
            <Text style={{ color: '#8ab4f8', fontSize: 12, fontWeight: '700' }}>👥 EN-ROUTE</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.destActions}>
          <TouchableOpacity style={styles.arrivedBtn} onPress={handleArrived}>
            <Text style={styles.arrivedBtnText}>✅ ARRIVED</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Optimize Route Prompt */}
      {showOptimize && (
        <View style={styles.optimizeSheet}>
          <View style={styles.optimizeHeader}>
            <Text style={styles.optimizeIcon}>⚠️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.optimizeTitle}>Traffic Blocks Detected</Text>
              <Text style={styles.optimizeDesc}>{trafficBlocks.length} block(s) may affect your route</Text>
            </View>
          </View>
          <View style={styles.optimizeActions}>
            <TouchableOpacity style={styles.optimizeBtn} onPress={optimizeRoute}>
              <Text style={styles.optimizeBtnText}>🔄 OPTIMIZE ROUTE</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.optimizeDismiss} onPress={() => setShowOptimize(false)}>
              <Text style={{ color: '#8e9199', fontWeight: '600' }}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );

  // RENDER: En-route community view
  const renderEnrouteView = () => (
    <View style={styles.enrouteContainer}>
      <View style={styles.enrouteHeader}>
        <TouchableOpacity onPress={() => setView('map')}>
          <Text style={{ color: '#8ab4f8', fontSize: 16 }}>← Back to Map</Text>
        </TouchableOpacity>
        <Text style={styles.enrouteTitle}>En-Route Network</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>3</Text>
          <Text style={styles.statLabel}>ALERTED</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#4ade80' }]}>2</Text>
          <Text style={styles.statLabel}>CLEARED</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#fbbf24' }]}>1</Text>
          <Text style={styles.statLabel}>PENDING</Text>
        </View>
      </View>

      <Text style={styles.networkTitle}>PROXIMITY NETWORK</Text>

      {/* Mock community members en-route */}
      {[
        { id: '1', name: 'OMEGA-2', status: 'cleared', dist: '0.3 km' },
        { id: '2', name: 'SIGMA-9', status: 'cleared', dist: '0.8 km' },
        { id: '3', name: 'DELTA-4', status: 'pending', dist: '1.5 km' },
      ].map(m => (
        <View key={m.id} style={[styles.memberCard, m.status === 'pending' && { opacity: 0.5 }]}>
          <View style={[styles.memberDot, { backgroundColor: m.status === 'cleared' ? '#4ade80' : '#8e9199' }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.memberName}>{m.name}</Text>
            <Text style={styles.memberDist}>{m.dist} ahead</Text>
          </View>
          <View style={[styles.memberBadge, m.status === 'cleared' ? styles.clearedBadge : styles.pendingBadge]}>
            <Text style={[styles.memberBadgeText, m.status === 'cleared' ? { color: '#4ade80' } : { color: '#8e9199' }]}>
              {m.status === 'cleared' ? 'CLEARED' : 'PENDING'}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.container}>
      {view === 'hospitals' && renderHospitalList()}
      {view === 'map' && renderMapView()}
      {view === 'enroute' && renderEnrouteView()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121316' },
  // Hospital List
  hospitalList: { flex: 1, padding: 16 },
  headerSection: { marginBottom: 24 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1a1c1e', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(68,71,78,0.3)' },
  profileBadge: { width: 56, height: 56, borderRadius: 16, backgroundColor: 'rgba(255,82,82,0.1)', borderWidth: 1, borderColor: 'rgba(255,82,82,0.2)', alignItems: 'center', justifyContent: 'center' },
  profileBadgeText: { fontSize: 28 },
  driverName: { color: '#e2e2e6', fontSize: 18, fontWeight: '800' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ade80' },
  statusLabel: { color: '#8e9199', fontSize: 12, fontWeight: '500' },
  tierBadge: { backgroundColor: 'rgba(138,180,248,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 50, borderWidth: 1, borderColor: 'rgba(138,180,248,0.2)' },
  tierText: { color: '#8ab4f8', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  sectionTitle: { color: '#e2e2e6', fontSize: 22, fontWeight: '800', marginTop: 8 },
  sectionSub: { color: '#8e9199', fontSize: 13, marginBottom: 16 },
  hospitalCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#1a1c1e', borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(68,71,78,0.2)' },
  hospitalIcon: { width: 48, height: 48, borderRadius: 12, backgroundColor: 'rgba(138,180,248,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(138,180,248,0.15)' },
  hospitalName: { color: '#e2e2e6', fontSize: 15, fontWeight: '700' },
  hospitalDist: { color: '#8e9199', fontSize: 12, marginTop: 2 },
  goBtn: { backgroundColor: '#ff5252', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 50, minWidth: 70, alignItems: 'center' },
  goBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  // Protocols
  protocolCard: { backgroundColor: 'rgba(26,28,30,0.5)', borderRadius: 16, padding: 20, marginTop: 20, borderLeftWidth: 4, borderLeftColor: '#ff5252' },
  protocolTitle: { color: '#ff5252', fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 16 },
  protocolItem: { flexDirection: 'row', gap: 12, marginBottom: 12, alignItems: 'flex-start' },
  protocolNum: { backgroundColor: 'rgba(255,82,82,0.1)', width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  protocolNumText: { color: '#ff5252', fontSize: 10, fontWeight: '900' },
  protocolText: { color: '#c4c6d0', fontSize: 13, flex: 1, lineHeight: 20 },
  // Map View
  map: { flex: 1, backgroundColor: '#121316' },
  topHud: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  backBtn: { backgroundColor: 'rgba(33,36,41,0.85)', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  etaCard: { backgroundColor: 'rgba(33,36,41,0.85)', padding: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center' },
  etaLabel: { color: 'rgba(226,226,230,0.5)', fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  etaValue: { color: '#e2e2e6', fontSize: 22, fontWeight: '800' },
  destCard: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#1a1c1e', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36, borderTopWidth: 1, borderColor: 'rgba(68,71,78,0.3)' },
  destTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  destLabel: { color: '#8e9199', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 4 },
  destName: { color: '#e2e2e6', fontSize: 18, fontWeight: '800' },
  enrouteBtn: { backgroundColor: 'rgba(138,180,248,0.1)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 50, borderWidth: 1, borderColor: 'rgba(138,180,248,0.2)', minHeight: 36, justifyContent: 'center' },
  destActions: { flexDirection: 'row', gap: 10 },
  arrivedBtn: { flex: 1, backgroundColor: '#ff5252', borderRadius: 12, padding: 16, alignItems: 'center', minHeight: 52, justifyContent: 'center' },
  arrivedBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  // Optimize
  optimizeSheet: { position: 'absolute', bottom: 180, left: 12, right: 12, backgroundColor: '#212429', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,82,82,0.3)' },
  optimizeHeader: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 12 },
  optimizeIcon: { fontSize: 28 },
  optimizeTitle: { color: '#ff5252', fontSize: 15, fontWeight: '800' },
  optimizeDesc: { color: '#8e9199', fontSize: 12, marginTop: 2 },
  optimizeActions: { flexDirection: 'row', gap: 10 },
  optimizeBtn: { flex: 1, backgroundColor: '#4ade80', borderRadius: 50, padding: 14, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  optimizeBtnText: { color: '#121316', fontWeight: '800', fontSize: 14 },
  optimizeDismiss: { flex: 1, borderWidth: 1, borderColor: 'rgba(68,71,78,0.5)', borderRadius: 50, padding: 14, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  // En-route View
  enrouteContainer: { flex: 1, padding: 16 },
  enrouteHeader: { marginBottom: 20 },
  enrouteTitle: { color: '#e2e2e6', fontSize: 22, fontWeight: '800', marginTop: 12 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statCard: { flex: 1, backgroundColor: '#1a1c1e', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(68,71,78,0.2)' },
  statValue: { color: '#8ab4f8', fontSize: 28, fontWeight: '900' },
  statLabel: { color: '#8e9199', fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginTop: 4 },
  networkTitle: { color: '#8e9199', fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 12 },
  memberCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1a1c1e', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(68,71,78,0.2)' },
  memberDot: { width: 10, height: 10, borderRadius: 5 },
  memberName: { color: '#e2e2e6', fontSize: 14, fontWeight: '700' },
  memberDist: { color: '#8e9199', fontSize: 11, marginTop: 2 },
  memberBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 50 },
  clearedBadge: { backgroundColor: 'rgba(74,222,128,0.1)' },
  pendingBadge: { backgroundColor: 'rgba(142,145,153,0.1)' },
  memberBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
});

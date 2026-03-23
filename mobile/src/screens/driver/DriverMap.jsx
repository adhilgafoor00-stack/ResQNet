import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView,
  Animated, Dimensions, TextInput
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useAuthStore, api } from '../../store/useStore';
import { connectSocket, emitDriverLocation, listenToEvents } from '../../services/socket';

const { width: SCREEN_W } = Dimensions.get('window');

const FALLBACK_HOSPITALS = [
  { id: 'h1', name: 'Baby Memorial Hospital', lat: 11.2615, lng: 75.7830, type: 'Multi-specialty', beds: 350 },
  { id: 'h2', name: 'ASTER MIMS Kozhikode', lat: 11.2735, lng: 75.7784, type: 'Super-specialty', beds: 750 },
  { id: 'h3', name: 'Govt. Medical College Kozhikode', lat: 11.2580, lng: 75.7700, type: 'Government', beds: 1200 },
  { id: 'h4', name: 'Meitra Hospital (Premium)', lat: 11.2858, lng: 75.7742, type: 'Super-specialty', beds: 220 },
  { id: 'h5', name: 'Malabar Institute of Med Sci', lat: 11.2300, lng: 75.8000, type: 'Trauma Care', beds: 400 },
];

function getMapHTML(lat, lng, hospitalsData) {
  // Generate hospital markers JSON dynamically
  const hospitalsJSON = JSON.stringify(hospitalsData || FALLBACK_HOSPITALS);
  return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
*{margin:0;padding:0}
html,body,#map{width:100%;height:100%;background:#121316}
.hospital-popup{font-family:system-ui;font-size:13px;line-height:1.4}
.hospital-popup b{color:#1a73e8;font-size:14px}
.hospital-popup .type{color:#666;font-size:11px}
.hospital-popup .dir-btn{display:block;margin-top:8px;background:#1a73e8;color:#fff;border:none;padding:8px 16px;border-radius:20px;font-weight:700;font-size:12px;cursor:pointer;text-align:center}
</style>
</head><body><div id="map"></div>
<script>
var map=L.map('map',{zoomControl:true}).setView([${lat},${lng}],14);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(map);

// Driver marker
var driverIcon=L.divIcon({className:'',html:'<div style="background:#4285f4;border:3px solid #fff;border-radius:50%;width:44px;height:44px;display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 2px 12px rgba(66,133,244,0.5)">🚑</div>',iconSize:[44,44],iconAnchor:[22,22]});
var driverMarker=L.marker([${lat},${lng}],{icon:driverIcon,zIndexOffset:1000}).addTo(map);

// Hospital markers from prop
var hospitals=${hospitalsJSON};
var hospitalMarkers={};

function renderHospitals(newHospitals) {
  // Clear old
  for(var k in hospitalMarkers) map.removeLayer(hospitalMarkers[k]);
  hospitalMarkers={};
  hospitals = newHospitals;
  
  hospitals.forEach(function(h){
    var icon=L.divIcon({
      className:'',
      html:'<div style="background:#fff;border:2px solid #ea4335;border-radius:8px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,0.3)">🏥</div>',
      iconSize:[32,32],iconAnchor:[16,32]
    });
    var m=L.marker([h.lat,h.lng],{icon:icon}).addTo(map);
    m.bindPopup('<div class="hospital-popup"><b>'+h.name+'</b><br><span class="type">'+h.type+' • '+(h.beds||'N/A')+' beds</span><br><button class="dir-btn" onclick="selectHospital(\\''+h.id+'\\')">🚗 Directions</button></div>',{closeButton:true,maxWidth:220});
    hospitalMarkers[h.id]=m;
  });
}
renderHospitals(hospitals); // initial render

var routeLine=null;
var rerouteLine=null;
var blockLayers={};
var communityMarkers={};

function selectHospital(id){
  window.ReactNativeWebView.postMessage(JSON.stringify({type:'hospitalSelected',id:id}));
}

function updateDriver(lat,lng){
  driverMarker.setLatLng([lat,lng]);
}

function drawRoute(coords,color,dashed){
  if(routeLine&&!dashed)map.removeLayer(routeLine);
  if(rerouteLine&&dashed)map.removeLayer(rerouteLine);
  var line=L.polyline(coords,{color:color||'#4285f4',weight:6,opacity:0.85,dashArray:dashed?'12 6':null}).addTo(map);
  if(dashed)rerouteLine=line;else routeLine=line;
  map.fitBounds(line.getBounds(),{padding:[60,60]});
}

function clearRoute(){
  if(routeLine)map.removeLayer(routeLine);
  if(rerouteLine)map.removeLayer(rerouteLine);
  routeLine=null;rerouteLine=null;
}

function addBlock(id,lat,lng,radius){
  blockLayers[id]=L.circle([lat,lng],{radius:radius,color:'#ea4335',fillColor:'#ea4335',fillOpacity:0.15,weight:2}).addTo(map);
}
function removeBlock(id){if(blockLayers[id]){map.removeLayer(blockLayers[id]);delete blockLayers[id]}}

function addCommunity(id,lat,lng,name,status){
  if(communityMarkers[id])map.removeLayer(communityMarkers[id]);
  var color=status==='cleared'?'#34a853':'#fbbc04';
  var icon=L.divIcon({className:'',html:'<div style="background:'+color+';border:2px solid #fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:11px;box-shadow:0 1px 4px rgba(0,0,0,0.3)">👤</div>',iconSize:[24,24],iconAnchor:[12,12]});
  communityMarkers[id]=L.marker([lat,lng],{icon:icon}).addTo(map).bindPopup(name+' ('+status+')');
}

function focusDriver(){map.setView(driverMarker.getLatLng(),15)}

window.addEventListener('message',function(e){try{var d=JSON.parse(e.data);
  if(d.type==='updateDriver')updateDriver(d.lat,d.lng);
  if(d.type==='drawRoute')drawRoute(d.coords,d.color,d.dashed);
  if(d.type==='clearRoute')clearRoute();
  if(d.type==='addBlock')addBlock(d.id,d.lat,d.lng,d.radius);
  if(d.type==='removeBlock')removeBlock(d.id);
  if(d.type==='addCommunity')addCommunity(d.id,d.lat,d.lng,d.name,d.status);
  if(d.type==='focusDriver')focusDriver();
  if(d.type==='updateHospitals')renderHospitals(d.hospitals);
}catch(err){}});
document.addEventListener('message',function(e){try{var d=JSON.parse(e.data);
  if(d.type==='updateDriver')updateDriver(d.lat,d.lng);
  if(d.type==='drawRoute')drawRoute(d.coords,d.color,d.dashed);
  if(d.type==='clearRoute')clearRoute();
  if(d.type==='addBlock')addBlock(d.id,d.lat,d.lng,d.radius);
  if(d.type==='removeBlock')removeBlock(d.id);
  if(d.type==='addCommunity')addCommunity(d.id,d.lat,d.lng,d.name,d.status);
  if(d.type==='focusDriver')focusDriver();
  if(d.type==='updateHospitals')renderHospitals(d.hospitals);
}catch(err){}});
</script></body></html>`;
}

export default function DriverMap() {
  const { user } = useAuthStore();
  const [currentLocation, setCurrentLocation] = useState({ lat: 11.2588, lng: 75.7804 });
  const [hospitals, setHospitals] = useState(FALLBACK_HOSPITALS);
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [routeActive, setRouteActive] = useState(false);
  const [showOptimize, setShowOptimize] = useState(false);
  const [trafficBlocks, setTrafficBlocks] = useState([]);
  const [eta, setEta] = useState(null);
  const [routeDistance, setRouteDistance] = useState(null);
  const [showHospList, setShowHospList] = useState(false);
  const [showDemoSetter, setShowDemoSetter] = useState(false);
  const [demoLat, setDemoLat] = useState('');
  const [demoLng, setDemoLng] = useState('');
  const [isFetchingHospitals, setIsFetchingHospitals] = useState(false);
  const webRef = useRef(null);
  const locationWatcher = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const sendToMap = useCallback((data) => {
    webRef.current?.postMessage(JSON.stringify(data));
  }, []);

  const fetchNearbyHospitals = async (lat, lng) => {
    setIsFetchingHospitals(true);
    try {
      const radius = 20000; // 20km search radius
      const query = `[out:json];node["amenity"="hospital"](around:${radius},${lat},${lng});out 15;`;
      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`
      });
      const data = await res.json();
      
      const parsedHospitals = data.elements
        .filter(e => e.tags && e.tags.name)
        .map(e => ({
          id: `osm-${e.id}`,
          name: e.tags.name,
          lat: e.lat,
          lng: e.lon, // Overpass uses lon
          type: e.tags.healthcare || e.tags.emergency === 'yes' ? 'Emergency' : 'Hospital',
          beds: e.tags.capacity || 'Unknown'
        }));
      
      if (parsedHospitals.length > 0) {
        setHospitals(parsedHospitals);
        sendToMap({ type: 'updateHospitals', hospitals: parsedHospitals });
      }
    } catch (err) {
      console.error('Overpass API error:', err);
    } finally {
      setIsFetchingHospitals(false);
    }
  };

  const setDemoPosition = (lat, lng) => {
    setCurrentLocation({ lat, lng });
    sendToMap({ type: 'updateDriver', lat, lng });
    sendToMap({ type: 'focusDriver' });
    fetchNearbyHospitals(lat, lng);
    setShowDemoSetter(false);
  };


  // Pulse animation
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 0.3, duration: 1000, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
    ])).start();
  }, []);

  useEffect(() => {
    activateKeepAwakeAsync();

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return Alert.alert('Permission needed', 'Location required');
      const loc = await Location.getCurrentPositionAsync({});
      setCurrentLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      
      // Fetch dynamic hospitals based on real location once
      fetchNearbyHospitals(loc.coords.latitude, loc.coords.longitude);

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

  // Called when hospital selected from map popup OR bottom list
  const selectHospital = async (hospital) => {
    setSelectedHospital(hospital);
    setShowHospList(false);
    setRouteActive(false);

    // Fetch route
    try {
      const res = await api.post('/api/route', {
        start: [currentLocation.lng, currentLocation.lat],
        end: [hospital.lng, hospital.lat]
      });
      if (res.data.route?.geometry?.coordinates) {
        const coords = res.data.route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
        sendToMap({ type: 'drawRoute', coords, color: '#4285f4', dashed: false });
        setRouteActive(true);
        if (res.data.duration) setEta(`${Math.ceil(res.data.duration / 60)} min`);
        if (res.data.distance) setRouteDistance(`${(res.data.distance / 1000).toFixed(1)} km`);
        if (trafficBlocks.length > 0) setShowOptimize(true);
      }
    } catch (err) {
      console.error('Route API Error:', err?.response?.data || err.message);
      // Fallback straight line
      sendToMap({ type: 'drawRoute', coords: [[currentLocation.lat, currentLocation.lng], [hospital.lat, hospital.lng]], color: '#4285f4', dashed: false });
      setRouteActive(true);
    }

    // Notify backend
    try { await api.post('/api/vehicles/active', { location: currentLocation }); } catch {}
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
        sendToMap({ type: 'drawRoute', coords, color: '#34a853', dashed: true });
        Alert.alert('✅ Route Optimized', 'New route avoids all traffic blocks.');
      }
    } catch { Alert.alert('Route unchanged', 'Proceed with caution.'); }
  };

  const handleArrived = async () => {
    try {
      const vehicles = await api.get('/api/vehicles/active');
      const myVehicle = vehicles.data.vehicles?.find(v => v.driver?.toString() === user._id);
      if (myVehicle) await api.patch(`/api/vehicles/${myVehicle._id}/arrived`);
      Alert.alert('✅ Arrived', 'Dispatcher notified.');
      setRouteActive(false);
      setSelectedHospital(null);
      setEta(null);
      setRouteDistance(null);
      sendToMap({ type: 'clearRoute' });
    } catch { Alert.alert('Arrived', 'Logged.'); }
  };

  const cancelRoute = () => {
    setSelectedHospital(null);
    setRouteActive(false);
    setEta(null);
    setRouteDistance(null);
    setShowOptimize(false);
    sendToMap({ type: 'clearRoute' });
  };

  // Handle messages from WebView (hospital popup click)
  const onWebViewMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'hospitalSelected') {
        const h = hospitals.find(h => h.id === data.id);
        if (h) selectHospital(h);
      }
    } catch {}
  };

  const distToHospital = (h) => {
    const d = getDistanceKm(currentLocation.lat, currentLocation.lng, h.lat, h.lng);
    return `${d.toFixed(1)} km`;
  };

  return (
    <View style={styles.container}>
      {/* Full-screen map with hospitals as markers */}
      <WebView
        ref={webRef}
        source={{ html: getMapHTML(currentLocation.lat, currentLocation.lng) }}
        style={styles.map}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={['*']}
        scrollEnabled={false}
        onMessage={onWebViewMessage}
      />

      {/* Top bar — status + list toggle */}
      <View style={styles.topBar}>
        <View style={styles.driverChip}>
          <Animated.View style={[styles.liveDot, { opacity: pulseAnim }]} />
          <Text style={styles.chipText}>🚑 {user?.vehicleType?.toUpperCase() || 'AMBULANCE'}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={styles.listToggle} onPress={() => setShowDemoSetter(!showDemoSetter)}>
            <Text style={{ fontSize: 13 }}>📍 Test</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.listToggle} onPress={() => setShowHospList(!showHospList)}>
            <Text style={styles.listToggleText}>{showHospList ? '✕' : '☰'} Hosps</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Demo Position Setter (Floating) */}
      {showDemoSetter && (
        <View style={styles.demoCard}>
          <Text style={styles.demoTitle}>TEST POSITIONS (Teleport)</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
            <TextInput style={styles.demoInput} placeholder="Lat" placeholderTextColor="#666" value={demoLat} onChangeText={setDemoLat} keyboardType="numeric" />
            <TextInput style={styles.demoInput} placeholder="Lng" placeholderTextColor="#666" value={demoLng} onChangeText={setDemoLng} keyboardType="numeric" />
            <TouchableOpacity style={styles.demoGoBtn} onPress={() => {
              if(demoLat && demoLng) setDemoPosition(parseFloat(demoLat), parseFloat(demoLng));
            }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>GO</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.demoPresets}>
            <TouchableOpacity style={styles.demoBtn} onPress={() => setDemoPosition(11.2588, 75.7804)}>
              <Text style={styles.demoBtnText}>📍 Kozhikode</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.demoBtn} onPress={() => setDemoPosition(10.0159, 76.3118)}>
              <Text style={styles.demoBtnText}>📍 Kochi</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.demoBtn} onPress={() => setDemoPosition(8.5241, 76.9366)}>
              <Text style={styles.demoBtnText}>📍 Trivandrum</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.demoBtn} onPress={() => setDemoPosition(11.8745, 75.3704)}>
              <Text style={styles.demoBtnText}>📍 Kannur</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* My Location button */}
      <TouchableOpacity style={styles.myLocBtn} onPress={() => sendToMap({ type: 'focusDriver' })}>
        <Text style={{ fontSize: 18 }}>📍</Text>
      </TouchableOpacity>

      {/* Hospital List (Google Maps-style bottom sheet) */}
      {showHospList && !selectedHospital && (
        <View style={styles.hospSheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Nearby Hospitals</Text>
          <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
            {hospitals.map(h => (
              <TouchableOpacity key={h.id} style={styles.hospRow} onPress={() => selectHospital(h)} activeOpacity={0.7}>
                <View style={styles.hospIcon}>
                  <Text style={{ fontSize: 18 }}>🏥</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.hospName}>{h.name}</Text>
                  <Text style={styles.hospMeta}>{h.type} • {h.beds} beds</Text>
                </View>
                <View style={styles.hospDist}>
                  <Text style={styles.hospDistText}>{distToHospital(h)}</Text>
                  <Text style={styles.hospDirText}>Directions</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Active Route Bottom Card (Google Maps style) */}
      {selectedHospital && (
        <View style={styles.routeCard}>
          <View style={styles.routeHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.routeHospName}>{selectedHospital.name}</Text>
              <View style={styles.routeStats}>
                {eta && <Text style={styles.routeEta}>{eta}</Text>}
                {routeDistance && <Text style={styles.routeDist}>• {routeDistance}</Text>}
                <Text style={styles.routeType}>• {selectedHospital.type}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.cancelBtn} onPress={cancelRoute}>
              <Text style={{ color: '#ea4335', fontWeight: '700', fontSize: 13 }}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.routeActions}>
            <TouchableOpacity style={styles.arrivedBtn} onPress={handleArrived}>
              <Text style={styles.arrivedText}>✅ Arrived</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.shareBtn} onPress={() => Alert.alert('Shared', 'Route shared with dispatcher.')}>
              <Text style={styles.shareText}>📤 Share</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Optimize route prompt */}
      {showOptimize && (
        <View style={[styles.optimizeCard, { bottom: selectedHospital ? 160 : 20 }]}>
          <Text style={styles.optimizeTitle}>⚠️ Traffic blocks on route</Text>
          <Text style={styles.optimizeSub}>{trafficBlocks.length} block(s) detected. Want to find an alternative?</Text>
          <View style={styles.optimizeActions}>
            <TouchableOpacity style={styles.optimizeYes} onPress={optimizeRoute}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Optimize Route</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.optimizeNo} onPress={() => setShowOptimize(false)}>
              <Text style={{ color: '#9aa0a6', fontWeight: '600', fontSize: 13 }}>Keep Current</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

function getDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121316' },
  map: { flex: 1, backgroundColor: '#121316' },
  // Top bar
  topBar: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  driverChip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(33,36,41,0.92)', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 50, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#34a853' },
  chipText: { color: '#e2e2e6', fontWeight: '700', fontSize: 13 },
  listToggle: { backgroundColor: 'rgba(33,36,41,0.92)', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 50, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  listToggleText: { color: '#8ab4f8', fontWeight: '700', fontSize: 13 },
  // My Location
  myLocBtn: { position: 'absolute', right: 12, bottom: 160, backgroundColor: 'rgba(33,36,41,0.92)', width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  // Hospital sheet
  hospSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#1a1c1e', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 32, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#44474e', alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { color: '#e2e2e6', fontSize: 16, fontWeight: '800', marginBottom: 12 },
  hospRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(68,71,78,0.15)' },
  hospIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(234,67,53,0.08)', alignItems: 'center', justifyContent: 'center' },
  hospName: { color: '#e2e2e6', fontSize: 14, fontWeight: '700' },
  hospMeta: { color: '#9aa0a6', fontSize: 11, marginTop: 2 },
  hospDist: { alignItems: 'flex-end' },
  hospDistText: { color: '#8ab4f8', fontSize: 13, fontWeight: '700' },
  hospDirText: { color: '#4285f4', fontSize: 10, fontWeight: '700', marginTop: 2 },
  // Route card  
  routeCard: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#1a1c1e', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  routeHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  routeHospName: { color: '#e2e2e6', fontSize: 17, fontWeight: '800' },
  routeStats: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  routeEta: { color: '#34a853', fontSize: 14, fontWeight: '800' },
  routeDist: { color: '#9aa0a6', fontSize: 13 },
  routeType: { color: '#9aa0a6', fontSize: 13 },
  cancelBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(234,67,53,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(234,67,53,0.2)' },
  routeActions: { flexDirection: 'row', gap: 10 },
  arrivedBtn: { flex: 1, backgroundColor: '#4285f4', borderRadius: 50, padding: 16, alignItems: 'center', minHeight: 52, justifyContent: 'center' },
  arrivedText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  shareBtn: { backgroundColor: 'rgba(66,133,244,0.1)', borderRadius: 50, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(66,133,244,0.2)', minHeight: 52 },
  shareText: { color: '#8ab4f8', fontWeight: '700', fontSize: 13 },
  // Optimize
  optimizeCard: { position: 'absolute', left: 12, right: 12, backgroundColor: '#212429', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(234,67,53,0.3)' },
  optimizeTitle: { color: '#ea4335', fontSize: 14, fontWeight: '800', marginBottom: 4 },
  optimizeSub: { color: '#9aa0a6', fontSize: 12, marginBottom: 12 },
  optimizeActions: { flexDirection: 'row', gap: 10 },
  optimizeYes: { flex: 1, backgroundColor: '#34a853', borderRadius: 50, padding: 12, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  optimizeNo: { flex: 1, backgroundColor: 'rgba(68,71,78,0.3)', borderRadius: 50, padding: 12, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  // Demo Card
  demoCard: { position: 'absolute', top: 70, left: 12, right: 12, backgroundColor: '#212429', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#4285f4', zIndex: 100 },
  demoTitle: { color: '#8ab4f8', fontSize: 13, fontWeight: '800', marginBottom: 12, textAlign: 'center' },
  demoInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  demoGoBtn: { backgroundColor: '#4285f4', paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center', borderRadius: 8 },
  demoPresets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  demoBtn: { backgroundColor: 'rgba(66,133,244,0.15)', borderWidth: 1, borderColor: 'rgba(66,133,244,0.3)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  demoBtnText: { color: '#e2e2e6', fontSize: 13, fontWeight: '600' },
});

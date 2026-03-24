import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView,
  Animated, Dimensions, TextInput, Vibration, Linking, StatusBar, Platform
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useAuthStore, api } from '../../store/useStore';
import { connectSocket, emitDriverLocation, listenToEvents, emitArrived } from '../../services/socket';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const FALLBACK_HOSPITALS = [
  { id: 'h1', name: 'Baby Memorial Hospital', lat: 11.2615, lng: 75.7830, type: 'Multi-specialty', beds: 350 },
  { id: 'h2', name: 'ASTER MIMS Kozhikode', lat: 11.2735, lng: 75.7784, type: 'Super-specialty', beds: 750 },
  { id: 'h3', name: 'Govt. Medical College Kozhikode', lat: 11.2580, lng: 75.7700, type: 'Government', beds: 1200 },
  { id: 'h4', name: 'Meitra Hospital', lat: 11.2858, lng: 75.7742, type: 'Super-specialty', beds: 220 },
  { id: 'h5', name: 'Malabar Institute of Med Sci', lat: 11.2300, lng: 75.8000, type: 'Trauma Care', beds: 400 },
];

// ─── MAP HTML ─────────────────────────────────────────────────────────────────
// FIX: Use a bright, high-contrast tile layer (OSM default) so map is visible
// FIX: Correct hospital marker z-indexing so they show above tile layer
// FIX: Use postMessage for both Android (document) and iOS (window)
function getMapHTML(lat, lng, hospitalsData) {
  const hospitalsJSON = JSON.stringify(hospitalsData || FALLBACK_HOSPITALS);
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body, #map { width:100%; height:100%; overflow:hidden; }
  /* Force leaflet tiles to display */
  .leaflet-tile { opacity:1 !important; }
  .leaflet-tile-container { opacity:1 !important; }
  /* Custom popup styling */
  .leaflet-popup-content-wrapper {
    border-radius:16px;
    border:none;
    box-shadow:0 8px 32px rgba(0,0,0,0.18);
    padding:0;
    overflow:hidden;
  }
  .leaflet-popup-content { margin:0; }
  .leaflet-popup-tip { background:#fff; }
  .hosp-popup {
    font-family:-apple-system,system-ui,sans-serif;
    min-width:200px;
  }
  .hosp-popup-header {
    background:linear-gradient(135deg,#E63946,#c1121f);
    padding:14px 16px 10px;
  }
  .hosp-popup-name {
    color:#fff;
    font-size:14px;
    font-weight:700;
    line-height:1.3;
    margin-bottom:2px;
  }
  .hosp-popup-type {
    color:rgba(255,255,255,0.8);
    font-size:11px;
    font-weight:500;
  }
  .hosp-popup-body { padding:12px 16px 14px; background:#fff; }
  .hosp-popup-meta {
    color:#555;
    font-size:12px;
    margin-bottom:12px;
  }
  .hosp-dir-btn {
    display:block;
    width:100%;
    background:#E63946;
    color:#fff;
    border:none;
    padding:10px;
    border-radius:10px;
    font-weight:700;
    font-size:13px;
    cursor:pointer;
    text-align:center;
    letter-spacing:0.3px;
  }
  .hosp-dir-btn:active { opacity:0.85; }
  /* Ambulance pulse ring */
  .amb-ring {
    position:absolute;
    top:50%; left:50%;
    transform:translate(-50%,-50%);
    width:60px; height:60px;
    border-radius:50%;
    background:rgba(230,57,70,0.25);
    animation:pulse 2s ease-out infinite;
  }
  @keyframes pulse {
    0% { transform:translate(-50%,-50%) scale(0.8); opacity:1; }
    100% { transform:translate(-50%,-50%) scale(2); opacity:0; }
  }
</style>
</head>
<body>
<div id="map"></div>
<script>
// ── Init map with explicit size ──────────────────────────────────────────────
var map = L.map('map', {
  zoomControl: false,
  attributionControl: false
}).setView([${lat}, ${lng}], 14);

// ── Zoom control bottom-right ────────────────────────────────────────────────
L.control.zoom({ position: 'bottomright' }).addTo(map);

// ── Tile layers ──────────────────────────────────────────────────────────────
var lightTile = L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  { maxZoom: 19, attribution: '' }
);
var darkTile = L.tileLayer(
  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  { maxZoom: 19, attribution: '' }
);
var currentTile = lightTile;
currentTile.addTo(map);

// Invalidate size after load (fixes blank map in WebView)
setTimeout(function(){ map.invalidateSize(true); }, 300);

// ── Driver marker ────────────────────────────────────────────────────────────
var driverIcon = L.divIcon({
  className: '',
  html: '<div style="position:relative;width:52px;height:52px">' +
        '<div class="amb-ring"></div>' +
        '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
        'background:#E63946;border:3px solid #fff;border-radius:50%;width:40px;height:40px;' +
        'display:flex;align-items:center;justify-content:center;font-size:20px;' +
        'box-shadow:0 4px 16px rgba(230,57,70,0.55)">🚑</div></div>',
  iconSize: [52, 52],
  iconAnchor: [26, 26]
});
var driverMarker = L.marker([${lat}, ${lng}], { icon: driverIcon, zIndexOffset: 2000 }).addTo(map);

// ── Hospitals ────────────────────────────────────────────────────────────────
var hospitals = ${hospitalsJSON};
var hospitalMarkers = {};

function makeHospPopup(h) {
  return '<div class="hosp-popup">' +
         '<div class="hosp-popup-header">' +
           '<div class="hosp-popup-name">' + h.name + '</div>' +
           '<div class="hosp-popup-type">' + h.type + '</div>' +
         '</div>' +
         '<div class="hosp-popup-body">' +
           '<div class="hosp-popup-meta">🛏 ' + (h.beds||'N/A') + ' beds</div>' +
           '<button class="hosp-dir-btn" onclick="selectHosp(\\'' + h.id + '\\')">🚗 Get Directions</button>' +
         '</div></div>';
}

function renderHospitals(list) {
  Object.values(hospitalMarkers).forEach(function(m){ map.removeLayer(m); });
  hospitalMarkers = {};
  hospitals = list;
  list.forEach(function(h) {
    var icon = L.divIcon({
      className: '',
      html: '<div style="background:#fff;border:2.5px solid #E63946;border-radius:12px;' +
            'width:36px;height:36px;display:flex;align-items:center;justify-content:center;' +
            'font-size:18px;box-shadow:0 4px 12px rgba(230,57,70,0.3);">🏥</div>',
      iconSize: [36, 36],
      iconAnchor: [18, 36],
      popupAnchor: [0, -38]
    });
    var m = L.marker([h.lat, h.lng], { icon: icon, zIndexOffset: 1000 }).addTo(map);
    m.bindPopup(makeHospPopup(h), { closeButton: false, maxWidth: 240, minWidth: 200 });
    hospitalMarkers[h.id] = m;
  });
}
renderHospitals(hospitals);

// ── Route & overlays ─────────────────────────────────────────────────────────
var routeLine = null, rerouteLine = null;
var blockLayers = {}, communityMarkers = {};

function selectHosp(id) {
  postMsg({ type: 'hospitalSelected', id: id });
}
function postMsg(obj) {
  var s = JSON.stringify(obj);
  try { window.ReactNativeWebView.postMessage(s); } catch(e) {}
}

function updateDriver(lat, lng) {
  driverMarker.setLatLng([lat, lng]);
}
function drawRoute(coords, color, dashed) {
  if (!dashed && routeLine) { map.removeLayer(routeLine); routeLine = null; }
  if (dashed && rerouteLine) { map.removeLayer(rerouteLine); rerouteLine = null; }
  var line = L.polyline(coords, {
    color: color || '#4285f4',
    weight: 7,
    opacity: 0.92,
    dashArray: dashed ? '14 8' : null,
    lineCap: 'round',
    lineJoin: 'round'
  }).addTo(map);
  if (dashed) rerouteLine = line; else routeLine = line;
  map.fitBounds(line.getBounds(), { padding: [80, 80] });
}
function clearRoute() {
  if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
  if (rerouteLine) { map.removeLayer(rerouteLine); rerouteLine = null; }
}
function addBlock(id, lat, lng, radius) {
  blockLayers[id] = L.circle([lat, lng], {
    radius: radius, color: '#ea4335', fillColor: '#ea4335', fillOpacity: 0.18, weight: 2.5, dashArray: '6 4'
  }).addTo(map);
}
function removeBlock(id) { if (blockLayers[id]) { map.removeLayer(blockLayers[id]); delete blockLayers[id]; } }

function callCommunityMember(phone, name) {
  postMsg({ type: 'communityCall', phone: phone, name: name });
}
function addCommunity(id, lat, lng, name, status, phone) {
  if (communityMarkers[id]) map.removeLayer(communityMarkers[id]);
  var color = status === 'active' ? '#E63946' : '#888';
  var icon = L.divIcon({
    className: '',
    html: '<div style="background:' + color + ';border:2px solid #fff;border-radius:50%;' +
          'width:28px;height:28px;display:flex;align-items:center;justify-content:center;' +
          'color:#fff;font-size:12px;font-weight:800;box-shadow:0 2px 8px rgba(0,0,0,0.25)">' +
          (name||'?')[0].toUpperCase() + '</div>',
    iconSize: [28, 28], iconAnchor: [14, 14]
  });
  var callBtn = phone
    ? '<button onclick="callCommunityMember(\\'' + phone + '\\',\\'' + (name||'') + '\\')" ' +
      'style="margin-top:8px;width:100%;background:#4285f4;color:#fff;border:none;padding:7px;' +
      'border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">📞 Call</button>'
    : '';
  var popup = '<div style="text-align:center;min-width:130px;font-family:system-ui;padding:4px">' +
    '<b style="font-size:13px">' + (name||'Member') + '</b><br>' +
    '<span style="color:' + color + ';font-size:11px">● ' + (status==='active'?'Active':'Standby') + '</span>' +
    callBtn + '</div>';
  communityMarkers[id] = L.marker([lat, lng], { icon: icon }).addTo(map)
    .bindPopup(popup, { maxWidth: 170, closeButton: false });
}

function focusDriver() { map.setView(driverMarker.getLatLng(), 15, { animate: true }); }
function setTheme(dark) {
  map.removeLayer(currentTile);
  currentTile = dark ? darkTile : lightTile;
  currentTile.addTo(map);
}

// ── Message listener (supports both Android & iOS) ───────────────────────────
function handleMsg(e) {
  try {
    var d = JSON.parse(e.data || e);
    if (d.type === 'updateDriver') updateDriver(d.lat, d.lng);
    if (d.type === 'drawRoute') drawRoute(d.coords, d.color, d.dashed);
    if (d.type === 'clearRoute') clearRoute();
    if (d.type === 'addBlock') addBlock(d.id, d.lat, d.lng, d.radius);
    if (d.type === 'removeBlock') removeBlock(d.id);
    if (d.type === 'addCommunity') addCommunity(d.id, d.lat, d.lng, d.name, d.status, d.phone);
    if (d.type === 'focusDriver') focusDriver();
    if (d.type === 'updateHospitals') renderHospitals(d.hospitals);
    if (d.type === 'setTheme') setTheme(d.dark);
    if (d.type === 'invalidateSize') { setTimeout(function(){ map.invalidateSize(true); }, 100); }
  } catch(err) {}
}
window.addEventListener('message', handleMsg);
document.addEventListener('message', handleMsg);
<\/script>
</body>
</html>`;
}

// ─── DISTANCE UTIL ────────────────────────────────────────────────────────────
function getDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ─── STATUS PILL ──────────────────────────────────────────────────────────────
function StatusPill({ label, color = '#E63946', bg = 'rgba(230,57,70,0.1)' }) {
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
      <Text style={{ color, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 }}>{label}</Text>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function DriverMap() {
  const { user } = useAuthStore();
  const [currentLocation, setCurrentLocation] = useState({ lat: 11.2588, lng: 75.7804 });
  const [hospitals, setHospitals] = useState(FALLBACK_HOSPITALS);
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [routePreviewing, setRoutePreviewing] = useState(false);
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
  const [policeAlert, setPoliceAlert] = useState(null);
  const [communityCount, setCommunityCount] = useState(0);
  const [communityMembers, setCommunityMembers] = useState([]);
  const [showCommunityPanel, setShowCommunityPanel] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  const webRef = useRef(null);
  const locationWatcher = useRef(null);
  const simIntervalRef = useRef(null);
  const simPosRef = useRef(null);
  const simActiveRef = useRef(false);
  const currentLocationRef = useRef({ lat: 11.2588, lng: 75.7804 });

  // Freeze initial HTML — prevents WebView reload
  const initialHtmlRef = useRef(null);
  if (!initialHtmlRef.current) {
    initialHtmlRef.current = getMapHTML(
      currentLocation.lat, currentLocation.lng, FALLBACK_HOSPITALS
    );
  }

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const bottomSheetAnim = useRef(new Animated.Value(0)).current;
  const alertAnim = useRef(new Animated.Value(0)).current;

  // ── Message to WebView ──────────────────────────────────────────────────────
  const sendToMap = useCallback((data) => {
    webRef.current?.postMessage(JSON.stringify(data));
  }, []);

  // ── Pulse animation for live dot ────────────────────────────────────────────
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 0.2, duration: 900, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
    ])).start();
  }, []);

  // ── Bottom sheet slide-in ───────────────────────────────────────────────────
  useEffect(() => {
    if (selectedHospital || showHospList) {
      Animated.spring(bottomSheetAnim, { toValue: 1, tension: 65, friction: 11, useNativeDriver: true }).start();
    } else {
      Animated.timing(bottomSheetAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start();
    }
  }, [selectedHospital, showHospList]);

  // ── Police alert slide-in ───────────────────────────────────────────────────
  useEffect(() => {
    if (policeAlert) {
      Animated.spring(alertAnim, { toValue: 1, tension: 70, friction: 10, useNativeDriver: true }).start();
      const t = setTimeout(() => {
        Animated.timing(alertAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => setPoliceAlert(null));
      }, 5500);
      return () => clearTimeout(t);
    }
  }, [policeAlert]);

  // ── Main setup ──────────────────────────────────────────────────────────────
  useEffect(() => {
    activateKeepAwakeAsync();

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Location access is required to use navigation.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const newLoc = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      setCurrentLocation(newLoc);
      currentLocationRef.current = newLoc;
      fetchNearbyHospitals(newLoc.lat, newLoc.lng);

      locationWatcher.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 3000, distanceInterval: 10 },
        (loc) => {
          const nl = { lat: loc.coords.latitude, lng: loc.coords.longitude };
          setCurrentLocation(nl);
          currentLocationRef.current = nl;
          if (!simActiveRef.current) {
            sendToMap({ type: 'updateDriver', lat: nl.lat, lng: nl.lng });
            emitDriverLocation(nl.lat, nl.lng);
          }
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
      onPoliceAlerted: (data) => {
        setPoliceAlert(data);
        Vibration.vibrate([0, 200, 100, 200]);
      },
    });
    loadTrafficBlocks();

    return () => {
      deactivateKeepAwake();
      locationWatcher.current?.remove();
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    };
  }, []);

  // ── Map ready handler ───────────────────────────────────────────────────────
  const onMapLoad = useCallback(() => {
    setMapReady(true);
    // Force Leaflet to recalculate size (fixes blank tile bug in WebView)
    setTimeout(() => sendToMap({ type: 'invalidateSize' }), 400);
    setTimeout(() => sendToMap({ type: 'invalidateSize' }), 1000);
  }, [sendToMap]);

  // ── Fetch hospitals ─────────────────────────────────────────────────────────
  const fetchNearbyHospitals = async (lat, lng) => {
    setIsFetchingHospitals(true);
    try {
      const res = await api.get('/api/route/hospitals', { params: { lat, lng, radius: 20000 } });
      const fetched = res.data.hospitals || [];
      if (fetched.length > 0) {
        setHospitals(fetched);
        sendToMap({ type: 'updateHospitals', hospitals: fetched });
      }
    } catch {
      // keep fallback
    } finally {
      setIsFetchingHospitals(false);
    }
  };

  // ── Load traffic blocks ─────────────────────────────────────────────────────
  const loadTrafficBlocks = async () => {
    try {
      const res = await api.get('/api/traffic/active');
      const blocks = res.data.blocks || [];
      setTrafficBlocks(blocks);
      blocks.forEach(b => sendToMap({ type: 'addBlock', id: b._id, lat: b.lat, lng: b.lng, radius: b.radius }));
    } catch {}
  };

  // ── Demo position setter ────────────────────────────────────────────────────
  const setDemoPosition = (lat, lng) => {
    setCurrentLocation({ lat, lng });
    currentLocationRef.current = { lat, lng };
    sendToMap({ type: 'updateDriver', lat, lng });
    sendToMap({ type: 'focusDriver' });
    fetchNearbyHospitals(lat, lng);
    setShowDemoSetter(false);
  };

  // ── GPS button ──────────────────────────────────────────────────────────────
  const goToGPS = async () => {
    setGettingLocation(true);
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const nl = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      setCurrentLocation(nl);
      currentLocationRef.current = nl;
      sendToMap({ type: 'updateDriver', lat: nl.lat, lng: nl.lng });
      sendToMap({ type: 'focusDriver' });
      fetchNearbyHospitals(nl.lat, nl.lng);
    } catch {
      sendToMap({ type: 'focusDriver' });
    } finally {
      setGettingLocation(false);
    }
  };

  // ── Theme toggle ────────────────────────────────────────────────────────────
  const toggleTheme = () => {
    const nd = !isDark;
    setIsDark(nd);
    sendToMap({ type: 'setTheme', dark: nd });
  };

  // ── Select hospital ─────────────────────────────────────────────────────────
  const selectHospital = async (hospital) => {
    setSelectedHospital(hospital);
    setShowHospList(false);
    setRouteActive(false);
    setCommunityMembers([]);
    setCommunityCount(0);
    setShowCommunityPanel(false);

    let loc = currentLocationRef.current;
    try {
      const freshLoc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      loc = { lat: freshLoc.coords.latitude, lng: freshLoc.coords.longitude };
      setCurrentLocation(loc);
      currentLocationRef.current = loc;
      sendToMap({ type: 'updateDriver', lat: loc.lat, lng: loc.lng });
    } catch {}

    try {
      const res = await api.post('/api/route', {
        start: [loc.lng, loc.lat],
        end: [hospital.lng, hospital.lat]
      });
      if (res.data.route?.geometry?.coordinates) {
        const coords = res.data.route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
        sendToMap({ type: 'drawRoute', coords, color: '#4285f4', dashed: false });
        setRoutePreviewing(true);
        if (res.data.duration) setEta(`${Math.ceil(res.data.duration / 60)} min`);
        if (res.data.distance) setRouteDistance(`${(res.data.distance / 1000).toFixed(1)} km`);

        try {
          const cRes = await api.get('/api/admin/community/near-route', {
            params: { fromLat: loc.lat, fromLng: loc.lng, toLat: hospital.lat, toLng: hospital.lng }
          });
          const members = cRes.data.members || [];
          setCommunityCount(members.length);
          setCommunityMembers(members.slice(0, 5));
          if (members.length > 0) setShowCommunityPanel(true);
          setTimeout(() => {
            members.forEach(m => {
              if (m.location?.lat) {
                sendToMap({ type: 'addCommunity', id: m._id, lat: m.location.lat, lng: m.location.lng, name: m.name || 'Member', status: m.isActive ? 'active' : 'standby', phone: m.phone || '' });
              }
            });
          }, 700);
        } catch {}
      }
    } catch {
      // fallback straight line
      sendToMap({ type: 'drawRoute', coords: [[loc.lat, loc.lng], [hospital.lat, hospital.lng]], color: '#4285f4', dashed: false });
      setRoutePreviewing(true);
    }
  };

  // ── Start route (simulation) ────────────────────────────────────────────────
  const startRoute = async () => {
    setRoutePreviewing(false);
    setRouteActive(true);
    simActiveRef.current = true;
    if (trafficBlocks.length > 0) setShowOptimize(true);

    try { await api.post('/api/vehicles/active', { location: currentLocationRef.current }); } catch {}
    try {
      const vRes = await api.get('/api/vehicles/active');
      const myVehicle = vRes.data.vehicles?.find(v => v.driverId?.toString() === user._id || v.driver?.toString() === user._id);
      await api.post('/api/dispatch', {
        vehicleId: myVehicle?._id || user._id,
        destination: { lat: selectedHospital.lat, lng: selectedHospital.lng, name: selectedHospital.name }
      });
    } catch {}

    const STEP_KM = 0.08;
    const TICK_MS = 1500;
    simPosRef.current = { ...currentLocationRef.current };
    const destLat = selectedHospital.lat;
    const destLng = selectedHospital.lng;

    function moveToward(lat, lng, tLat, tLng, stepKm) {
      const R = 6371;
      const dLat = (tLat - lat) * Math.PI / 180;
      const dLng = (tLng - lng) * Math.PI / 180;
      const a = Math.sin(dLat/2)**2 + Math.cos(lat*Math.PI/180)*Math.cos(tLat*Math.PI/180)*Math.sin(dLng/2)**2;
      const totalKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      if (totalKm <= stepKm) return { lat: tLat, lng: tLng };
      const ratio = stepKm / totalKm;
      return { lat: lat + (tLat - lat) * ratio, lng: lng + (tLng - lng) * ratio };
    }

    if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    simIntervalRef.current = setInterval(() => {
      const cur = simPosRef.current;
      const next = moveToward(cur.lat, cur.lng, destLat, destLng, STEP_KM);
      simPosRef.current = next;
      currentLocationRef.current = next;
      setCurrentLocation(next);
      sendToMap({ type: 'updateDriver', lat: next.lat, lng: next.lng });
      emitDriverLocation(next.lat, next.lng);

      const dLat2 = (destLat - next.lat) * Math.PI / 180;
      const dLng2 = (destLng - next.lng) * Math.PI / 180;
      const a2 = Math.sin(dLat2/2)**2 + Math.cos(next.lat*Math.PI/180)*Math.cos(destLat*Math.PI/180)*Math.sin(dLng2/2)**2;
      const remKm = 6371 * 2 * Math.atan2(Math.sqrt(a2), Math.sqrt(1-a2));
      if (remKm < 0.05) {
        clearInterval(simIntervalRef.current);
        simIntervalRef.current = null;
        simActiveRef.current = false;
        setRouteActive(false);
        setRoutePreviewing(false);
        if (selectedHospital) emitArrived(selectedHospital.lat, selectedHospital.lng);
        Alert.alert('✅ Arrived', `You have reached ${selectedHospital.name}.`);
      }
    }, TICK_MS);
  };

  // ── Optimize route ──────────────────────────────────────────────────────────
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
        sendToMap({ type: 'drawRoute', coords, color: '#00C48C', dashed: true });
        Alert.alert('✅ Route Optimized', 'New route avoids all traffic blocks.');
      }
    } catch {
      Alert.alert('Route unchanged', 'No alternative found. Proceed with caution.');
    }
  };

  // ── Arrived / Cancel ────────────────────────────────────────────────────────
  const handleArrived = () => {
    if (selectedHospital) emitArrived(selectedHospital.lat, selectedHospital.lng);
    cancelRoute();
    Alert.alert('✅ Arrived', 'You have reached the destination.');
  };

  const cancelRoute = () => {
    if (simIntervalRef.current) { clearInterval(simIntervalRef.current); simIntervalRef.current = null; }
    simActiveRef.current = false;
    setSelectedHospital(null);
    setRoutePreviewing(false);
    setRouteActive(false);
    setEta(null);
    setRouteDistance(null);
    setCommunityCount(0);
    setCommunityMembers([]);
    setShowCommunityPanel(false);
    setShowOptimize(false);
    sendToMap({ type: 'clearRoute' });
  };

  // ── WebView message handler ─────────────────────────────────────────────────
  const onWebViewMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'hospitalSelected') {
        const h = hospitals.find(h => h.id === data.id);
        if (h) selectHospital(h);
      }
      if (data.type === 'communityCall') {
        Alert.alert(`📞 Call ${data.name || 'Member'}`, data.phone, [
          { text: 'Cancel', style: 'cancel' },
          { text: '📞 Call Now', onPress: () => Linking.openURL(`tel:${data.phone}`) }
        ]);
      }
    } catch {}
  };

  const distToHospital = (h) => `${getDistanceKm(currentLocation.lat, currentLocation.lng, h.lat, h.lng).toFixed(1)} km`;

  // ── Bottom sheet translate Y ────────────────────────────────────────────────
  const sheetTranslate = bottomSheetAnim.interpolate({
    inputRange: [0, 1], outputRange: [300, 0]
  });
  const alertTranslate = alertAnim.interpolate({
    inputRange: [0, 1], outputRange: [-120, 0]
  });

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <View style={S.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />

      {/* ── MAP ── */}
      <WebView
        ref={webRef}
        source={{ html: initialHtmlRef.current }}
        style={S.map}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        scrollEnabled={false}
        onLoad={onMapLoad}
        onLoadEnd={onMapLoad}
        onMessage={onWebViewMessage}
        // Critical: allow mixed content for tile loading
        mixedContentMode="always"
        allowsInlineMediaPlayback
      />

      {/* ── TOP BAR ── */}
      <View style={S.topBar}>
        {/* Driver chip */}
        <View style={S.driverChip}>
          <Animated.View style={[S.liveDot, { opacity: pulseAnim }]} />
          <Text style={S.chipText}>🚑 {user?.vehicleType?.toUpperCase() || 'AMBULANCE'}</Text>
          {routeActive && <StatusPill label="EN ROUTE" color="#fff" bg="rgba(255,255,255,0.25)" />}
        </View>

        {/* Top right actions */}
        <View style={S.topActions}>
          <TouchableOpacity style={S.iconBtn} onPress={toggleTheme}>
            <Text style={S.iconBtnText}>{isDark ? '☀️' : '🌙'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={S.iconBtn} onPress={() => setShowDemoSetter(v => !v)}>
            <Text style={S.iconBtnText}>📍</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[S.iconBtn, showHospList && S.iconBtnActive]}
            onPress={() => { setShowHospList(v => !v); setSelectedHospital(null); }}
          >
            <Text style={[S.iconBtnText, showHospList && { color: '#fff' }]}>🏥</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── TRAFFIC BLOCKS BADGE ── */}
      {trafficBlocks.length > 0 && (
        <View style={S.blocksBadge}>
          <Text style={S.blocksBadgeText}>⚠️ {trafficBlocks.length} block{trafficBlocks.length > 1 ? 's' : ''}</Text>
        </View>
      )}

      {/* ── DEMO SETTER ── */}
      {showDemoSetter && (
        <View style={S.demoCard}>
          <Text style={S.demoTitle}>TELEPORT</Text>
          <View style={S.demoRow}>
            <TextInput
              style={S.demoInput}
              placeholder="Latitude"
              placeholderTextColor="#999"
              value={demoLat}
              onChangeText={setDemoLat}
              keyboardType="decimal-pad"
            />
            <TextInput
              style={S.demoInput}
              placeholder="Longitude"
              placeholderTextColor="#999"
              value={demoLng}
              onChangeText={setDemoLng}
              keyboardType="decimal-pad"
            />
            <TouchableOpacity
              style={S.demoGoBtn}
              onPress={() => { if (demoLat && demoLng) setDemoPosition(parseFloat(demoLat), parseFloat(demoLng)); }}
            >
              <Text style={S.demoGoBtnText}>GO</Text>
            </TouchableOpacity>
          </View>
          <View style={S.demoPresets}>
            {[
              { label: 'Kozhikode', lat: 11.2588, lng: 75.7804 },
              { label: 'Kochi', lat: 10.0159, lng: 76.3118 },
              { label: 'Trivandrum', lat: 8.5241, lng: 76.9366 },
              { label: 'Kannur', lat: 11.8745, lng: 75.3704 },
            ].map(p => (
              <TouchableOpacity key={p.label} style={S.demoPresetBtn} onPress={() => setDemoPosition(p.lat, p.lng)}>
                <Text style={S.demoPresetText}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* ── MY LOCATION BUTTON ── */}
      <TouchableOpacity style={S.myLocBtn} onPress={goToGPS} activeOpacity={0.8}>
        <Text style={{ fontSize: 20 }}>{gettingLocation ? '⏳' : '📍'}</Text>
      </TouchableOpacity>

      {/* ── POLICE ALERT BANNER ── */}
      {policeAlert && (
        <Animated.View style={[S.policeBanner, { transform: [{ translateY: alertTranslate }] }]}>
          <View style={S.policeBannerIcon}>
            <Text style={{ fontSize: 24 }}>🚔</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={S.policeTitle}>Traffic Police Alerted</Text>
            <Text style={S.policeSub}>Road clearing in progress ahead of you</Text>
          </View>
        </Animated.View>
      )}

      {/* ── BOTTOM SHEET (Hospital list OR Route card) ── */}
      {(showHospList || selectedHospital) && (
        <Animated.View style={[S.bottomSheet, { transform: [{ translateY: sheetTranslate }] }]}>
          <View style={S.sheetHandle} />

          {/* HOSPITAL LIST */}
          {showHospList && !selectedHospital && (
            <>
              <View style={S.sheetHeaderRow}>
                <Text style={S.sheetTitle}>Nearby Hospitals</Text>
                {isFetchingHospitals && (
                  <Text style={{ color: '#E63946', fontSize: 12 }}>Fetching...</Text>
                )}
              </View>
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: SCREEN_H * 0.4 }}>
                {hospitals.map(h => (
                  <TouchableOpacity key={h.id} style={S.hospRow} onPress={() => selectHospital(h)} activeOpacity={0.7}>
                    <View style={S.hospIconBox}>
                      <Text style={{ fontSize: 20 }}>🏥</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={S.hospName} numberOfLines={1}>{h.name}</Text>
                      <Text style={S.hospMeta}>{h.type} · {h.beds} beds</Text>
                    </View>
                    <View style={S.hospRight}>
                      <Text style={S.hospDist}>{distToHospital(h)}</Text>
                      <Text style={S.hospDirLabel}>Directions →</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          {/* ROUTE CARD */}
          {selectedHospital && (
            <>
              {/* Hospital header */}
              <View style={S.routeHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={S.routeHospName} numberOfLines={1}>{selectedHospital.name}</Text>
                  <View style={S.routeMetaRow}>
                    {eta && (
                      <View style={S.etaBadge}>
                        <Text style={S.etaText}>{eta}</Text>
                      </View>
                    )}
                    {routeDistance && <Text style={S.routeDist}>{routeDistance}</Text>}
                    <Text style={S.routeTypeTxt}>{selectedHospital.type}</Text>
                  </View>
                </View>
                <TouchableOpacity style={S.cancelBtn} onPress={cancelRoute}>
                  <Text style={S.cancelBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Community pill */}
              <TouchableOpacity
                style={[S.communityPill, communityCount === 0 && S.communityPillEmpty]}
                onPress={() => communityCount > 0 && setShowCommunityPanel(v => !v)}
                activeOpacity={communityCount > 0 ? 0.7 : 1}
              >
                <Text style={[S.communityPillText, communityCount === 0 && { color: '#888' }]}>
                  {communityCount > 0 ? `👥 ${communityCount} community member${communityCount > 1 ? 's' : ''} on route ${showCommunityPanel ? '▲' : '▼'}` : '⚠️ No community members on this route'}
                </Text>
              </TouchableOpacity>

              {/* Community list */}
              {showCommunityPanel && communityMembers.length > 0 && (
                <View style={S.communityList}>
                  {communityMembers.slice(0, 3).map(m => (
                    <TouchableOpacity
                      key={m._id}
                      style={S.communityRow}
                      onPress={() => Alert.alert(`📞 ${m.name}`, m.phone, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: '📞 Call Now', onPress: () => Linking.openURL(`tel:${m.phone}`) }
                      ])}
                      activeOpacity={0.7}
                    >
                      <View style={S.communityAvatar}>
                        <Text style={S.communityAvatarText}>{(m.name || '?')[0].toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={S.communityName}>{m.name || 'Member'}</Text>
                        <Text style={S.communityPhone}>{m.phone || 'No number'}</Text>
                      </View>
                      <View style={S.communityCallBtn}>
                        <Text style={{ fontSize: 16 }}>📞</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Action buttons */}
              <View style={S.routeActions}>
                {routePreviewing ? (
                  <TouchableOpacity style={S.startBtn} onPress={startRoute} activeOpacity={0.85}>
                    <Text style={S.startBtnText}>🚀  START ROUTE</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={S.arrivedBtn} onPress={handleArrived} activeOpacity={0.85}>
                    <Text style={S.arrivedBtnText}>✅  Arrived</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={S.shareBtn}
                  onPress={() => Alert.alert('Shared', 'Route shared with dispatcher.')}
                  activeOpacity={0.8}
                >
                  <Text style={S.shareBtnText}>📤</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </Animated.View>
      )}

      {/* ── OPTIMIZE ROUTE CARD ── */}
      {showOptimize && (
        <View style={[S.optimizeCard, { bottom: selectedHospital ? (SCREEN_H * 0.4) : 100 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Text style={{ fontSize: 22 }}>⚠️</Text>
            <Text style={S.optimizeTitle}>Traffic blocks detected</Text>
          </View>
          <Text style={S.optimizeSub}>{trafficBlocks.length} block(s) on your current route.</Text>
          <View style={S.optimizeActions}>
            <TouchableOpacity style={S.optimizeYes} onPress={optimizeRoute} activeOpacity={0.85}>
              <Text style={S.optimizeYesText}>Find Alternate Route</Text>
            </TouchableOpacity>
            <TouchableOpacity style={S.optimizeNo} onPress={() => setShowOptimize(false)}>
              <Text style={S.optimizeNoText}>Keep Current</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f0f0' },
  map: { flex: 1, backgroundColor: '#e8e8e8' },

  // Top bar
  topBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 36,
    left: 14, right: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 100,
  },
  driverChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#E63946',
    paddingHorizontal: 16, paddingVertical: 11,
    borderRadius: 50,
    shadowColor: '#E63946', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 8,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  chipText: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 0.3 },
  topActions: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 4,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
  },
  iconBtnActive: { backgroundColor: '#E63946' },
  iconBtnText: { fontSize: 18 },

  // Traffic badge
  blocksBadge: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 110 : 95,
    alignSelf: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1.5, borderColor: '#E63946',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
    zIndex: 90,
  },
  blocksBadgeText: { color: '#E63946', fontSize: 12, fontWeight: '800' },

  // My Location button
  myLocBtn: {
    position: 'absolute', right: 14, bottom: 200,
    width: 50, height: 50, borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 6,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
    zIndex: 100,
  },

  // Bottom sheet
  bottomSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 38 : 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.12, shadowRadius: 20, elevation: 16,
    zIndex: 200,
  },
  sheetHandle: {
    width: 44, height: 5, borderRadius: 3,
    backgroundColor: '#E0E0E0', alignSelf: 'center', marginBottom: 16,
  },
  sheetHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
  },
  sheetTitle: { color: '#111', fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },

  // Hospital row
  hospRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  hospIconBox: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: '#FFF0F1',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#FFCED1',
  },
  hospName: { color: '#111', fontSize: 14, fontWeight: '700', marginBottom: 3 },
  hospMeta: { color: '#888', fontSize: 12 },
  hospRight: { alignItems: 'flex-end' },
  hospDist: { color: '#E63946', fontSize: 14, fontWeight: '800' },
  hospDirLabel: { color: '#aaa', fontSize: 11, marginTop: 3 },

  // Route card
  routeHeaderRow: {
    flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12,
  },
  routeHospName: { color: '#111', fontSize: 20, fontWeight: '900', letterSpacing: -0.3, marginBottom: 6 },
  routeMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  etaBadge: {
    backgroundColor: '#E63946', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10,
  },
  etaText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  routeDist: { color: '#444', fontSize: 14, fontWeight: '700' },
  routeTypeTxt: { color: '#999', fontSize: 12 },
  cancelBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: '#FFF0F1', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#FFCED1',
  },
  cancelBtnText: { color: '#E63946', fontWeight: '900', fontSize: 15 },

  // Community pill
  communityPill: {
    backgroundColor: 'rgba(230,57,70,0.07)',
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 12, marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(230,57,70,0.15)',
  },
  communityPillEmpty: { backgroundColor: '#f8f8f8', borderColor: '#eee' },
  communityPillText: { color: '#E63946', fontSize: 13, fontWeight: '700' },

  // Community list
  communityList: {
    marginBottom: 12, borderRadius: 12,
    overflow: 'hidden', borderWidth: 1, borderColor: '#F0F0F0',
  },
  communityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  communityAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#FFF0F1', borderWidth: 1.5, borderColor: '#E63946',
    alignItems: 'center', justifyContent: 'center',
  },
  communityAvatarText: { color: '#E63946', fontSize: 14, fontWeight: '900' },
  communityName: { color: '#111', fontSize: 13, fontWeight: '700' },
  communityPhone: { color: '#888', fontSize: 11, marginTop: 1 },
  communityCallBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: '#f0f8ff', alignItems: 'center', justifyContent: 'center',
  },

  // Route actions
  routeActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  startBtn: {
    flex: 1, backgroundColor: '#E63946', borderRadius: 16,
    paddingVertical: 16, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#E63946', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 8,
  },
  startBtnText: { color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 0.3 },
  arrivedBtn: {
    flex: 1, backgroundColor: '#00C48C', borderRadius: 16,
    paddingVertical: 16, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#00C48C', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  arrivedBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  shareBtn: {
    width: 56, height: 54, borderRadius: 16,
    backgroundColor: '#f5f5f7', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#eee',
  },
  shareBtnText: { fontSize: 20 },

  // Optimize card
  optimizeCard: {
    position: 'absolute', left: 14, right: 14,
    backgroundColor: '#fff', borderRadius: 20, padding: 18,
    borderWidth: 2, borderColor: '#E63946',
    shadowColor: '#E63946', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 10,
    zIndex: 150,
  },
  optimizeTitle: { color: '#111', fontSize: 15, fontWeight: '900' },
  optimizeSub: { color: '#666', fontSize: 13, marginBottom: 14 },
  optimizeActions: { flexDirection: 'row', gap: 10 },
  optimizeYes: {
    flex: 1, backgroundColor: '#E63946', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center', justifyContent: 'center',
  },
  optimizeYesText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  optimizeNo: {
    flex: 1, backgroundColor: '#f5f5f7', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#eee',
  },
  optimizeNoText: { color: '#666', fontWeight: '700', fontSize: 13 },

  // Demo setter
  demoCard: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 116 : 98,
    left: 14, right: 14,
    backgroundColor: '#fff', padding: 18, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#E63946',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 10,
    zIndex: 200,
  },
  demoTitle: {
    color: '#E63946', fontSize: 11, fontWeight: '900',
    textAlign: 'center', letterSpacing: 2, marginBottom: 14,
  },
  demoRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  demoInput: {
    flex: 1, backgroundColor: '#f8f8f8', color: '#111',
    padding: 11, borderRadius: 12, borderWidth: 1, borderColor: '#eee',
    fontSize: 13,
  },
  demoGoBtn: {
    backgroundColor: '#E63946', paddingHorizontal: 18,
    justifyContent: 'center', alignItems: 'center', borderRadius: 12,
  },
  demoGoBtnText: { color: '#fff', fontWeight: '900', fontSize: 13 },
  demoPresets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  demoPresetBtn: {
    backgroundColor: '#FFF0F1', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1.5, borderColor: '#FFCED1',
  },
  demoPresetText: { color: '#E63946', fontSize: 12, fontWeight: '700' },

  // Police banner
  policeBanner: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 116 : 98,
    left: 14, right: 14,
    backgroundColor: '#00C48C', borderRadius: 18, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    shadowColor: '#00C48C', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 12,
    zIndex: 300,
  },
  policeBannerIcon: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
  },
  policeTitle: { color: '#fff', fontSize: 15, fontWeight: '900' },
  policeSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
});
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView,
  Animated, Dimensions, TextInput, Vibration, Linking
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useAuthStore, api } from '../../store/useStore';
import { connectSocket, emitDriverLocation, listenToEvents, emitArrived } from '../../services/socket';

const { width: SCREEN_W } = Dimensions.get('window');

const FALLBACK_HOSPITALS = [
  { id: 'h1', name: 'Baby Memorial Hospital', lat: 11.2615, lng: 75.7830, type: 'Multi-specialty', beds: 350 },
  { id: 'h2', name: 'ASTER MIMS Kozhikode', lat: 11.2735, lng: 75.7784, type: 'Super-specialty', beds: 750 },
  { id: 'h3', name: 'Govt. Medical College Kozhikode', lat: 11.2580, lng: 75.7700, type: 'Government', beds: 1200 },
  { id: 'h4', name: 'Meitra Hospital (Premium)', lat: 11.2858, lng: 75.7742, type: 'Super-specialty', beds: 220 },
  { id: 'h5', name: 'Malabar Institute of Med Sci', lat: 11.2300, lng: 75.8000, type: 'Trauma Care', beds: 400 },
];

function getMapHTML(lat, lng, hospitalsData) {
  const hospitalsJSON = JSON.stringify(hospitalsData || FALLBACK_HOSPITALS);
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
*{margin:0;padding:0}
html,body,#map{width:100%;height:100%;background:#0d0d0d}
.leaflet-control-zoom{border:none!important;box-shadow:0 4px 20px rgba(0,0,0,0.25)!important;border-radius:12px!important;overflow:hidden}
.leaflet-control-zoom a{background:#fff!important;color:#DC143C!important;font-weight:800!important;border:none!important;width:36px!important;height:36px!important;line-height:36px!important;font-size:18px!important}
.leaflet-control-zoom a:hover{background:#DC143C!important;color:#fff!important}
.leaflet-popup-content-wrapper{border-radius:16px!important;border:none!important;box-shadow:0 8px 32px rgba(0,0,0,0.18)!important;padding:0!important;overflow:hidden}
.leaflet-popup-tip{background:#fff!important}
.hp{font-family:-apple-system,sans-serif;padding:14px 16px;min-width:180px}
.hp-name{font-size:14px;font-weight:800;color:#1a1a2e;margin-bottom:3px}
.hp-type{font-size:11px;color:#DC143C;font-weight:700;letter-spacing:.5px;text-transform:uppercase;margin-bottom:8px}
.hp-beds{font-size:11px;color:#666;margin-bottom:10px}
.hp-btn{width:100%;background:#DC143C;color:#fff;border:none;padding:9px 0;border-radius:10px;font-weight:800;font-size:12px;letter-spacing:.5px;cursor:pointer;transition:background .15s}
.hp-btn:hover{background:#b01030}
</style>
</head><body><div id="map"></div>
<script>
var map=L.map('map',{zoomControl:true}).setView([${lat},${lng}],14);
var darkTile='https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
var lightTile='https://{s}.basemaps.cartocdn.com/voyager/{z}/{x}/{y}{r}.png';
var tileLayer=L.tileLayer(lightTile,{maxZoom:19}).addTo(map);

// Premium crimson ambulance marker with pulse ring
var driverIcon=L.divIcon({className:'',html:'<div style="position:relative;width:52px;height:52px"><div style="position:absolute;top:0;left:0;width:52px;height:52px;border-radius:50%;background:rgba(220,20,60,0.2);animation:pulse 1.4s ease-out infinite"></div><div style="position:absolute;top:6px;left:6px;width:40px;height:40px;background:#DC143C;border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 4px 16px rgba(220,20,60,0.6)">🚑</div></div><style>@keyframes pulse{0%{transform:scale(1);opacity:.8}100%{transform:scale(1.7);opacity:0}}</style>',iconSize:[52,52],iconAnchor:[26,26]});
var driverMarker=L.marker([${lat},${lng}],{icon:driverIcon,zIndexOffset:1000}).addTo(map);

var hospitals=${hospitalsJSON};
var hospitalMarkers={};

function renderHospitals(newHospitals){
  for(var k in hospitalMarkers)map.removeLayer(hospitalMarkers[k]);
  hospitalMarkers={};
  hospitals=newHospitals;
  hospitals.forEach(function(h){
    var icon=L.divIcon({className:'',html:'<div style="background:#fff;border:2.5px solid #DC143C;border-radius:10px;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 3px 12px rgba(220,20,60,0.25)">🏥</div>',iconSize:[34,34],iconAnchor:[17,34]});
    var m=L.marker([h.lat,h.lng],{icon:icon}).addTo(map);
    var bedsText=h.beds?h.beds+' beds':'N/A';
    m.bindPopup('<div class="hp"><div class="hp-name">'+h.name+'</div><div class="hp-type">'+h.type+'</div><div class="hp-beds">🛏 '+bedsText+'</div><button class="hp-btn" onclick="selectHospital(\''+h.id+'\')">&rarr; Get Directions</button></div>',{closeButton:false,maxWidth:220});
    hospitalMarkers[h.id]=m;
  });
}
renderHospitals(hospitals);

var routeLine=null;var rerouteLine=null;var blockLayers={};var communityMarkers={};

function selectHospital(id){window.ReactNativeWebView.postMessage(JSON.stringify({type:'hospitalSelected',id:id}));}

function updateDriver(lat,lng){driverMarker.setLatLng([lat,lng]);}

function drawRoute(coords,color,dashed){
  if(routeLine&&!dashed)map.removeLayer(routeLine);
  if(rerouteLine&&dashed)map.removeLayer(rerouteLine);
  var c=color||'#DC143C';
  // Draw shadow line for depth
  if(!dashed)L.polyline(coords,{color:'rgba(220,20,60,0.15)',weight:12,opacity:1}).addTo(map);
  var line=L.polyline(coords,{color:c,weight:5,opacity:0.95,dashArray:dashed?'10 6':null,lineCap:'round',lineJoin:'round'}).addTo(map);
  if(dashed)rerouteLine=line;else routeLine=line;
  map.fitBounds(line.getBounds(),{padding:[70,70]});
}

function clearRoute(){
  if(routeLine)map.removeLayer(routeLine);
  if(rerouteLine)map.removeLayer(rerouteLine);
  routeLine=null;rerouteLine=null;
  // clear shadow layers too
  map.eachLayer(function(l){if(l.options&&l.options.color&&l.options.color.includes('0.15'))map.removeLayer(l);});
}

function addBlock(id,lat,lng,radius){blockLayers[id]=L.circle([lat,lng],{radius:radius,color:'#DC143C',fillColor:'#DC143C',fillOpacity:0.1,weight:2,dashArray:'6 4'}).addTo(map);}
function removeBlock(id){if(blockLayers[id]){map.removeLayer(blockLayers[id]);delete blockLayers[id];}}

function callCommunity(el){var p=el.getAttribute('data-phone');var n=el.getAttribute('data-name');if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({type:'communityCall',phone:p,name:n}));}

function addCommunity(id,lat,lng,name,status,phone){
  if(communityMarkers[id])map.removeLayer(communityMarkers[id]);
  var active=status==='active';
  var icon=L.divIcon({className:'',html:'<div style="background:'+(active?'#fff':'#f5f5f5')+';border:2px solid '+(active?'#DC143C':'#999')+';border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.2)">👤</div>',iconSize:[28,28],iconAnchor:[14,14]});
  var btn=phone?'<button onclick="callCommunity(this)" data-phone="'+phone+'" data-name="'+name+'" style="margin-top:8px;background:#DC143C;color:#fff;border:none;padding:7px 14px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;width:100%">📞 Call</button>':'';
  var popup='<div style="font-family:-apple-system,sans-serif;padding:10px 12px;min-width:130px"><b style="color:#1a1a2e;font-size:14px">'+name+'</b><br><span style="color:'+(active?'#DC143C':'#888')+';font-size:10px;font-weight:700;letter-spacing:.5px">'+(active?'● ACTIVE':'● STANDBY')+'</span>'+btn+'</div>';
  communityMarkers[id]=L.marker([lat,lng],{icon:icon}).addTo(map).bindPopup(popup,{closeButton:false,maxWidth:180,autoPan:false});
}

function focusDriver(){map.setView(driverMarker.getLatLng(),15);}

function handleMsg(d){
  if(d.type==='updateDriver')updateDriver(d.lat,d.lng);
  if(d.type==='drawRoute')drawRoute(d.coords,d.color,d.dashed);
  if(d.type==='clearRoute')clearRoute();
  if(d.type==='addBlock')addBlock(d.id,d.lat,d.lng,d.radius);
  if(d.type==='removeBlock')removeBlock(d.id);
  if(d.type==='addCommunity')addCommunity(d.id,d.lat,d.lng,d.name,d.status,d.phone);
  if(d.type==='focusDriver')focusDriver();
  if(d.type==='updateHospitals')renderHospitals(d.hospitals);
  if(d.type==='setTheme'){map.removeLayer(tileLayer);tileLayer=L.tileLayer(d.dark?darkTile:lightTile,{maxZoom:19}).addTo(map);}
}
window.addEventListener('message',function(e){try{handleMsg(JSON.parse(e.data));}catch(err){}});
document.addEventListener('message',function(e){try{handleMsg(JSON.parse(e.data));}catch(err){}});
</script></body></html>`;
}

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
  const [isDark, setIsDark] = useState(false); // light mode by default to match white/crimson UI
  const [gettingLocation, setGettingLocation] = useState(false);
  const webRef = useRef(null);
  const locationWatcher = useRef(null);
  const simIntervalRef = useRef(null);
  const simPosRef = useRef(null);
  const simActiveRef = useRef(false);       // true while simulation runs — blocks GPS watcher from updating map
  const currentLocationRef = useRef({ lat: 11.2588, lng: 75.7804 }); // always-fresh location for routing
  // Freeze initial HTML — never update source prop so WebView doesn't reload
  const initialHtmlRef = useRef(null);
  if (!initialHtmlRef.current) {
    initialHtmlRef.current = getMapHTML(currentLocation.lat, currentLocation.lng, FALLBACK_HOSPITALS);
  }
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const sendToMap = useCallback((data) => {
    webRef.current?.postMessage(JSON.stringify(data));
  }, []);

  const fetchNearbyHospitals = async (lat, lng) => {
    setIsFetchingHospitals(true);
    try {
      const res = await api.get('/api/route/hospitals', {
        params: { lat, lng, radius: 20000 }
      });
      const fetched = res.data.hospitals || [];
      if (fetched.length > 0) {
        setHospitals(fetched);
        sendToMap({ type: 'updateHospitals', hospitals: fetched });
      }
    } catch (err) {
      console.warn('[Hospitals] Backend fetch failed, using fallback:', err.message);
      // FALLBACK_HOSPITALS is already set in initial state
    } finally {
      setIsFetchingHospitals(false);
    }
  };

  const setDemoPosition = (lat, lng) => {
    setCurrentLocation({ lat, lng });
    currentLocationRef.current = { lat, lng };
    sendToMap({ type: 'updateDriver', lat, lng });
    sendToMap({ type: 'focusDriver' });
    fetchNearbyHospitals(lat, lng);
    setShowDemoSetter(false);
  };

  // Toggle dark/light tile layer
  const toggleTheme = () => {
    const newDark = !isDark;
    setIsDark(newDark);
    sendToMap({ type: 'setTheme', dark: newDark });
  };

  // Go to real GPS position — used by the 📍 button
  const goToGPS = async () => {
    setGettingLocation(true);
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const newLoc = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      setCurrentLocation(newLoc);
      currentLocationRef.current = newLoc;
      sendToMap({ type: 'updateDriver', lat: newLoc.lat, lng: newLoc.lng });
      sendToMap({ type: 'focusDriver' });
      fetchNearbyHospitals(newLoc.lat, newLoc.lng);
    } catch {
      sendToMap({ type: 'focusDriver' }); // fallback: just pan to current marker
    } finally {
      setGettingLocation(false);
    }
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
          currentLocationRef.current = newLoc;
          // Only update map marker and emit socket when NOT simulating
          // (simulation drives the map during active routing — prevents flying marker)
          if (!simActiveRef.current) {
            sendToMap({ type: 'updateDriver', lat: newLoc.lat, lng: newLoc.lng });
            emitDriverLocation(newLoc.lat, newLoc.lng);
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
        setTimeout(() => setPoliceAlert(null), 6000);
      },
    });
    loadTrafficBlocks();
    return () => {
      deactivateKeepAwake();
      locationWatcher.current?.remove();
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    };
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
    setCommunityMembers([]);
    setCommunityCount(0);
    setShowCommunityPanel(false);

    // Get fresh GPS position before routing so we never use stale/fallback coords
    let loc = currentLocationRef.current;
    try {
      const freshLoc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      loc = { lat: freshLoc.coords.latitude, lng: freshLoc.coords.longitude };
      setCurrentLocation(loc);
      currentLocationRef.current = loc;
      sendToMap({ type: 'updateDriver', lat: loc.lat, lng: loc.lng });
    } catch { /* use last known */ }

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

        // Fetch community members near route (after route is drawn + map fitted)
        try {
          const cRes = await api.get('/api/admin/community/near-route', {
            params: { fromLat: loc.lat, fromLng: loc.lng, toLat: hospital.lat, toLng: hospital.lng }
          });
          const members = cRes.data.members || [];
          setCommunityCount(members.length);
          setCommunityMembers(members.slice(0, 5));
          if (members.length > 0) setShowCommunityPanel(true);
          // Delay community pins by 600ms so route fitBounds settles first
          // This prevents the map from panning to community member location
          setTimeout(() => {
            members.forEach((m, idx) => {
              const hasLoc = m.location && typeof m.location.lat === 'number' && m.location.lat !== 0;
              if (hasLoc) {
                sendToMap({ type: 'addCommunity', id: m._id, lat: m.location.lat, lng: m.location.lng, name: m.name || 'Member', status: m.isActive ? 'active' : 'standby', phone: m.phone || '' });
              }
            });
          }, 650);
        } catch {}
      }
    } catch {
      sendToMap({ type: 'drawRoute', coords: [[loc.lat, loc.lng], [hospital.lat, hospital.lng]], color: '#4285f4', dashed: false });
      setRoutePreviewing(true);
    }
  };

  const startRoute = async () => {
    setRoutePreviewing(false);
    setRouteActive(true);
    simActiveRef.current = true;          // block GPS watcher from animating map
    if (trafficBlocks.length > 0) setShowOptimize(true);

    try { await api.post('/api/vehicles/active', { location: currentLocationRef.current }); } catch {}

    try {
      const vRes = await api.get('/api/vehicles/active');
      const myVehicle = vRes.data.vehicles?.find(
        v => v.driverId?.toString() === user._id || v.driver?.toString() === user._id
      );
      const vehicleId = myVehicle?._id || user._id;
      await api.post('/api/dispatch', {
        vehicleId,
        destination: { lat: selectedHospital.lat, lng: selectedHospital.lng, name: selectedHospital.name }
      });
    } catch {}

    // Smoother simulation: smaller steps, faster ticks
    const STEP_KM = 0.08;   // ~90m per tick → smoother
    const TICK_MS = 1500;   // 1.5s ticks
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
        Alert.alert('Arrived', 'You have reached the destination.');
      }
    }, TICK_MS);
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

  const handleArrived = () => {
    if (selectedHospital) {
      emitArrived(selectedHospital.lat, selectedHospital.lng);
    }
    cancelRoute();
    Alert.alert('Arrived', 'You have reached the destination.');
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


  // Handle messages from WebView (hospital popup click)
  const onWebViewMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'hospitalSelected') {
        const h = hospitals.find(h => h.id === data.id);
        if (h) selectHospital(h);
      }
      if (data.type === 'communityCall') {
        const phone = data.phone;
        const name = data.name || 'Community Member';
        Alert.alert(
          `📞 Call ${name}`,
          `${phone}`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: '📞 Call Now', onPress: () => Linking.openURL(`tel:${phone}`) }
          ]
        );
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
        source={{ html: initialHtmlRef.current }}
        style={styles.map}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={['*']}
        scrollEnabled={false}
        onMessage={onWebViewMessage}
      />

      {/* Top bar — status + list toggle */}
      <View style={[styles.topBar, !isDark && { backgroundColor: 'transparent' }]}>
        <View style={styles.driverChip}>
          <Animated.View style={[styles.liveDot, { opacity: pulseAnim }]} />
          <Text style={styles.chipText}>🚑 {user?.vehicleType?.toUpperCase() || 'AMBULANCE'}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {/* Dark / Light toggle */}
          <TouchableOpacity
            style={[styles.listToggle, { paddingHorizontal: 12 }]}
            onPress={toggleTheme}
          >
            <Text style={{ fontSize: 16 }}>{isDark ? '☀️' : '🌙'}</Text>
          </TouchableOpacity>
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

      {/* My Location button — fetches real GPS */}
      <TouchableOpacity
        style={[styles.myLocBtn, isDark ? {} : { backgroundColor: 'rgba(255,255,255,0.9)', borderColor: '#ddd' }]}
        onPress={goToGPS}
        disabled={gettingLocation}
      >
        <Text style={{ fontSize: 18 }}>{gettingLocation ? '⏳' : '📍'}</Text>
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

      {/* Active Route Bottom Card */}
      {selectedHospital && (
        <View style={styles.routeCard}>
          <View style={styles.routeHandle} />
          <View style={styles.routeHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.routeHospName}>{selectedHospital.name}</Text>
              <View style={styles.routeStats}>
                {eta && <View style={styles.routeEtaBadge}><Text style={styles.routeEtaText}>{eta}</Text></View>}
                {routeDistance && <Text style={styles.routeDistText}>{routeDistance}</Text>}
                <Text style={styles.routeTypeText}>{selectedHospital.type}</Text>
              </View>
              {communityCount > 0 ? (
                <TouchableOpacity onPress={() => setShowCommunityPanel(p => !p)}>
                  <Text style={styles.communityInfo}>👥 {communityCount} members on route {showCommunityPanel ? '▲' : '▼'}</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.communityInfo}>⚠️ No community members on this route</Text>
              )}
            </View>
            <TouchableOpacity style={styles.cancelBtn} onPress={cancelRoute}>
              <Text style={{ color: '#DC143C', fontWeight: '800', fontSize: 16 }}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Community member list */}
          {showCommunityPanel && communityMembers.length > 0 && (
            <View style={styles.communityList}>
              {communityMembers.slice(0, 3).map(m => (
                <TouchableOpacity
                  key={m._id}
                  style={styles.communityRow}
                  onPress={() => Alert.alert(`📞 Call ${m.name}`, m.phone, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: '📞 Call Now', onPress: () => Linking.openURL(`tel:${m.phone}`) }
                  ])}
                >
                  <View style={styles.communityAvatar}>
                    <Text style={{ color: '#DC143C', fontWeight: '900', fontSize: 13 }}>{(m.name||'?')[0].toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.communityName}>{m.name || 'Member'}</Text>
                    <Text style={styles.communityPhone}>{m.phone || 'No number'}</Text>
                  </View>
                  <Text style={{ fontSize: 18 }}>📞</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.routeActions}>
            {routePreviewing ? (
              <TouchableOpacity style={styles.startBtn} onPress={startRoute}>
                <Text style={styles.startText}>🚀 START</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.arrivedBtn} onPress={handleArrived}>
                <Text style={styles.arrivedText}>✅ Arrived</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.shareBtn} onPress={() => Alert.alert('Shared', 'Route shared with dispatcher.')}>
              <Text style={styles.shareText}>📤 Share</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Optimize route prompt */}
      {showOptimize && (
        <View style={[styles.optimizeCard, { bottom: selectedHospital ? 220 : 20 }]}>
          <Text style={styles.optimizeTitle}>⚠️ Traffic detected on route</Text>
          <Text style={styles.optimizeSub}>{trafficBlocks.length} block(s) ahead. Find an alternative?</Text>
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
      {/* Police Alert Banner */}
      {policeAlert && (
        <View style={styles.policeBanner}>
          <Text style={styles.policeEmoji}>🚔</Text>
          <View>
            <Text style={styles.policeTitle}>Traffic Police Alerted</Text>
            <Text style={styles.policeSub}>Road clearing in progress ahead</Text>
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

// ── Design tokens ─────────────────────────────────────────────────────────────
const CRIMSON = '#DC143C';
const CRIMSON_DARK = '#A50D2B';
const CRIMSON_LIGHT = 'rgba(220,20,60,0.08)';
const GOLD = '#C9A84C';
const WHITE = '#FFFFFF';
const OFF_WHITE = '#F8F9FA';
const SURFACE = '#FFFFFF';
const BORDER = 'rgba(220,20,60,0.12)';
const TEXT_PRI = '#0D0D1A';
const TEXT_SEC = '#5A5A72';
const TEXT_MUTED = '#9999AA';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d14' },
  map: { flex: 1 },

  // ── Top bar ───────────────────────────────────────────────────────────────
  topBar: {
    position: 'absolute', top: 44, left: 12, right: 12,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8,
  },
  driverChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: WHITE, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 50,
    borderWidth: 1.5, borderColor: CRIMSON,
    shadowColor: CRIMSON, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: CRIMSON },
  chipText: { color: TEXT_PRI, fontWeight: '800', fontSize: 13, letterSpacing: 0.3 },
  btnGroup: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    backgroundColor: WHITE, width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 4,
  },
  iconBtnText: { fontSize: 16 },
  listToggle: {
    backgroundColor: WHITE, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 50,
    borderWidth: 1.5, borderColor: BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 3,
  },
  listToggleText: { color: CRIMSON, fontWeight: '800', fontSize: 12 },

  // ── GPS / location button ─────────────────────────────────────────────────
  myLocBtn: {
    position: 'absolute', right: 12, bottom: 220,
    backgroundColor: WHITE, width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: BORDER,
    shadowColor: CRIMSON, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6,
  },

  // ── Demo card ─────────────────────────────────────────────────────────────
  demoCard: {
    position: 'absolute', top: 100, left: 12, right: 12,
    backgroundColor: WHITE, padding: 16, borderRadius: 20,
    borderWidth: 1.5, borderColor: CRIMSON,
    shadowColor: CRIMSON, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 10,
    zIndex: 100,
  },
  demoTitle: { color: CRIMSON, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 12, textAlign: 'center', textTransform: 'uppercase' },
  demoInput: {
    flex: 1, backgroundColor: OFF_WHITE, color: TEXT_PRI, padding: 10, borderRadius: 10,
    borderWidth: 1, borderColor: BORDER, fontSize: 13,
  },
  demoGoBtn: { backgroundColor: CRIMSON, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center', borderRadius: 10, minHeight: 42 },
  demoPresets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 4 },
  demoBtn: {
    backgroundColor: CRIMSON_LIGHT, borderWidth: 1, borderColor: 'rgba(220,20,60,0.2)',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  demoBtnText: { color: CRIMSON, fontSize: 12, fontWeight: '700' },

  // ── Hospital list sheet ───────────────────────────────────────────────────
  hospSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: WHITE, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32,
    borderTopWidth: 2, borderColor: CRIMSON,
    shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 16,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: CRIMSON, alignSelf: 'center', marginBottom: 14, opacity: 0.3 },
  sheetTitle: { color: TEXT_PRI, fontSize: 17, fontWeight: '800', marginBottom: 12, letterSpacing: 0.2 },
  hospRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(220,20,60,0.07)',
  },
  hospIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: CRIMSON_LIGHT, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(220,20,60,0.15)',
  },
  hospName: { color: TEXT_PRI, fontSize: 14, fontWeight: '700', marginBottom: 2 },
  hospMeta: { color: TEXT_SEC, fontSize: 11 },
  hospBadge: {
    backgroundColor: CRIMSON_LIGHT, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, alignSelf: 'flex-start', marginTop: 3,
  },
  hospBadgeText: { color: CRIMSON, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  hospDist: { alignItems: 'flex-end', gap: 2 },
  hospDistText: { color: CRIMSON, fontSize: 14, fontWeight: '800' },
  hospDirText: { color: TEXT_MUTED, fontSize: 10, fontWeight: '600' },

  // ── Route bottom card ─────────────────────────────────────────────────────
  routeCard: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: WHITE, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36,
    borderTopWidth: 2, borderColor: CRIMSON,
    shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 16,
  },
  routeHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: CRIMSON, alignSelf: 'center', marginBottom: 14, opacity: 0.25 },
  routeHospName: { color: TEXT_PRI, fontSize: 18, fontWeight: '900', letterSpacing: 0.1 },
  routeStats: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' },
  routeEtaBadge: {
    backgroundColor: CRIMSON, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
  },
  routeEtaText: { color: WHITE, fontSize: 13, fontWeight: '800' },
  routeDistText: { color: TEXT_SEC, fontSize: 13, fontWeight: '600' },
  routeTypeText: { color: TEXT_MUTED, fontSize: 12 },
  routeHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  cancelBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: CRIMSON_LIGHT, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(220,20,60,0.2)',
  },
  routeActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  startBtn: {
    flex: 1, backgroundColor: CRIMSON, borderRadius: 14,
    paddingVertical: 17, alignItems: 'center', justifyContent: 'center',
    shadowColor: CRIMSON, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
  },
  startText: { color: WHITE, fontWeight: '900', fontSize: 15, letterSpacing: 0.5 },
  arrivedBtn: {
    flex: 1, backgroundColor: '#109B6E', borderRadius: 14,
    paddingVertical: 17, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#109B6E', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  arrivedText: { color: WHITE, fontWeight: '800', fontSize: 15 },
  shareBtn: {
    backgroundColor: OFF_WHITE, borderRadius: 14, paddingHorizontal: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: BORDER, minHeight: 54,
  },
  shareText: { color: CRIMSON, fontWeight: '700', fontSize: 13 },

  // ── Community info ────────────────────────────────────────────────────────
  communityInfo: { color: CRIMSON, fontSize: 12, fontWeight: '700', marginTop: 6, letterSpacing: 0.3 },
  communityList: {
    backgroundColor: CRIMSON_LIGHT, borderRadius: 12, marginVertical: 8,
    borderWidth: 1.5, borderColor: 'rgba(220,20,60,0.12)', overflow: 'hidden',
  },
  communityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11,
    borderBottomWidth: 1, borderBottomColor: 'rgba(220,20,60,0.07)',
  },
  communityAvatar: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(220,20,60,0.2)',
  },
  communityName: { color: TEXT_PRI, fontSize: 13, fontWeight: '700' },
  communityPhone: { color: CRIMSON, fontSize: 11, marginTop: 1, fontWeight: '600' },

  // ── Optimize card ─────────────────────────────────────────────────────────
  optimizeCard: {
    position: 'absolute', left: 12, right: 12,
    backgroundColor: WHITE, borderRadius: 20, padding: 16,
    borderWidth: 2, borderColor: CRIMSON,
    shadowColor: CRIMSON, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 16, elevation: 10,
  },
  optimizeTitle: { color: CRIMSON, fontSize: 14, fontWeight: '900', marginBottom: 4 },
  optimizeSub: { color: TEXT_SEC, fontSize: 12, marginBottom: 12 },
  optimizeActions: { flexDirection: 'row', gap: 10 },
  optimizeYes: {
    flex: 1, backgroundColor: CRIMSON, borderRadius: 10,
    padding: 13, alignItems: 'center', justifyContent: 'center',
  },
  optimizeNo: {
    flex: 1, backgroundColor: OFF_WHITE, borderRadius: 10,
    padding: 13, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: BORDER,
  },

  // ── Police banner ─────────────────────────────────────────────────────────
  policeBanner: {
    position: 'absolute', top: 104, left: 12, right: 12,
    backgroundColor: '#109B6E', padding: 14, borderRadius: 16,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 10,
    zIndex: 2000,
  },
  policeEmoji: { fontSize: 24 },
  policeTitle: { color: WHITE, fontWeight: '800', fontSize: 15 },
  policeSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 1 },

  // ── Already defined top-level constants used inline ───────────────────────
});

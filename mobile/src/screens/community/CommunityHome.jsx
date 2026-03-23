import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Vibration, Animated, Dimensions, TextInput, Alert
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { useAuthStore, api } from '../../store/useStore';
import { connectSocket, listenToEvents, emitCommunityPosition } from '../../services/socket';

// Dynamically load expo-notifications ONLY outside Expo Go.
// The static import alone triggers addPushTokenListener at module init,
// which crashes in Expo Go SDK 53+. Dynamic require prevents that.
let Notifications = null;
try {
  // Static import of constants is fine
  const Constants = require('expo-constants').default;
  const isExpoGo = Constants.appOwnership === 'expo';
  
  // We ALWAYS try to load notifications for local use
  Notifications = require('expo-notifications');
  
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch (_) {
  console.warn('Failed to load notifications module');
}

const scheduleLocalNotification = async (title, body) => {
  if (!Notifications) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: null,
    });
  } catch (_) {}
};

const { width: SCREEN_W } = Dimensions.get('window');

function getCommunityMapHTML(lat, lng) {
  return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
*{margin:0;padding:0}
html,body,#map{width:100%;height:100%;background:#121316}
</style>
</head><body><div id="map"></div>
<script>
var map=L.map('map',{zoomControl:false}).setView([${lat},${lng}],13);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(map);

var userIcon=L.divIcon({className:'',html:'<div style="background:#fbbc04;border:2px solid #fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,0.4)">👤</div>',iconSize:[24,24],iconAnchor:[12,12]});
var ambulanceIcon=L.divIcon({className:'',html:'<div style="font-size:24px;filter:drop-shadow(0 2px 6px rgba(255,0,0,0.7));">🚑</div>',iconSize:[30,30],iconAnchor:[15,15]});
var marker=L.marker([${lat},${lng}],{icon:userIcon}).addTo(map);
var ambulanceMarker=null;
var routeLine=null;

map.on('click', function(e){
  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'mapClick', lat: e.latlng.lat, lng: e.latlng.lng }));
  marker.setLatLng(e.latlng);
  map.setView(e.latlng);
});

function processMsg(d){
  if(d.type==='updateLocation'){ marker.setLatLng([d.lat,d.lng]); map.setView([d.lat,d.lng]); }
  if(d.type==='ambulanceMoved'){
    if(!ambulanceMarker){ ambulanceMarker=L.marker([d.lat,d.lng],{icon:ambulanceIcon}).addTo(map); }
    else{ ambulanceMarker.setLatLng([d.lat,d.lng]); }
  }
  if(d.type==='drawAmbulanceRoute' && d.coords){
    if(routeLine){ map.removeLayer(routeLine); }
    routeLine=L.polyline(d.coords,{color:'#ea4335',weight:4,opacity:0.9,dashArray:'8,4'}).addTo(map);
    if(d.coords.length>0){ map.fitBounds(routeLine.getBounds(),{padding:[20,20]}); }
  }
  if(d.type==='ambulanceArrived'){
    if(ambulanceMarker){ map.removeLayer(ambulanceMarker); ambulanceMarker=null; }
    if(routeLine){ map.removeLayer(routeLine); routeLine=null; }
  }
}
window.addEventListener('message',function(e){try{processMsg(JSON.parse(e.data));}catch(err){}});
document.addEventListener('message',function(e){try{processMsg(JSON.parse(e.data));}catch(err){}});
</script></body></html>`;
}

export default function CommunityHome({ navigation }) {
  const { user } = useAuthStore();
  const [location, setLocation] = useState(null);
  const [demoLat, setDemoLat] = useState('');
  const [demoLng, setDemoLng] = useState('');
  const [activeAlert, setActiveAlert] = useState(null);
  const [alertHistory, setAlertHistory] = useState([]);
  const [distance, setDistance] = useState(null);
  const [cleared, setCleared] = useState(false);
  const [networkMembers] = useState([
    { id: '1', name: 'OMEGA-2', status: 'cleared' },
    { id: '2', name: 'SIGMA-9', status: 'cleared' },
    { id: '3', name: 'DELTA-4', status: 'standby' },
  ]);
  const webRef = useRef(null);
  const lastAlertDist = useRef(null); // Track threshold crossings so we don't spam notifications

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  // Emergency pulse
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Entry animation
  useEffect(() => {
    Animated.spring(scaleAnim, { toValue: 1, friction: 6, useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    (async () => {
      // Request notification permissions (skipped in Expo Go SDK 53+)
      if (Notifications) await Notifications.requestPermissionsAsync();

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        const newLoc = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        setLocation(newLoc);
        emitCommunityPosition(newLoc.lat, newLoc.lng);
      }
    })();

    const socket = connectSocket(user._id);
    listenToEvents({
      onCommunityAlert: (data) => {
        const alert = {
          ...data,
          receivedAt: new Date().toISOString(),
          id: Date.now().toString(),
          vehicleType: data.vehicleType || 'ambulance',
        };

        setActiveAlert(alert);
        setCleared(false);
        setAlertHistory(prev => [alert, ...prev].slice(0, 15));

        const alertLevel = data.alertLevel;

        if (alertLevel === '10km') {
          // 10 km away — informational, single short buzz
          Vibration.vibrate([0, 300, 150, 300]);
          scheduleLocalNotification(
            '🚑 Ambulance 10 km Away',
            'Emergency vehicle is approaching your area.'
          );
        } else if (alertLevel === '5km') {
          // 5 km away — ring bells, heavy vibration pattern
          Vibration.vibrate([0, 800, 200, 800, 200, 800, 200, 800, 200, 800, 200, 800]);
          scheduleLocalNotification(
            '🔔 AMBULANCE 5 km AWAY — CLEAR THE ROAD',
            'Emergency vehicle is 5 km away. Please pull over immediately.'
          );
        } else if (alertLevel === 'arrived') {
          Vibration.vibrate([0, 200, 100, 200]);
        } else {
          // Legacy / no alertLevel — proximity-based vibration
          if (data.lat && data.lng && location) {
            const d = getDistanceKm(location.lat, location.lng, data.lat, data.lng);
            setDistance(d.toFixed(1));
            if (d < 3) {
              Vibration.vibrate([0, 800, 200, 800, 200, 800, 200, 800, 200, 800, 200, 800]);
            } else {
              Vibration.vibrate([0, 400, 200, 400]);
            }
          } else {
            Vibration.vibrate([0, 500, 200, 500, 200, 500]);
          }
        }
      },
      onVehicleMoved: (data) => {
        // Send ambulance position to WebView for live tracking
        webRef.current?.postMessage(JSON.stringify({ type: 'ambulanceMoved', lat: data.lat, lng: data.lng }));

        // Dynamic live tracking distance
        setLocation((currentLoc) => {
          if (!currentLoc) return currentLoc;
          const d = getDistanceKm(currentLoc.lat, currentLoc.lng, data.lat, data.lng);
          setDistance(d.toFixed(1));

          const prevD = lastAlertDist.current || 999;
          
          if (!activeAlert) {
            setActiveAlert({
              id: Date.now().toString(),
              vehicleType: data.vehicleType || 'ambulance',
              receivedAt: new Date().toISOString()
            });
            setCleared(false);
          }

          // Crossing 10km threshold -> Notification
          if (prevD > 10 && d <= 10 && d > 5) {
            scheduleLocalNotification('🚑 Ambulance 10km Away', 'Emergency vehicle is approaching your sector.');
          }
          // Crossing 5km threshold -> Notification
          if (prevD > 5 && d <= 5 && d > 3) {
            scheduleLocalNotification('🚨 Ambulance 5km Away', 'Please remain vigilant, emergency vehicle is entering your area.');
          }
          // Crossing 3km threshold -> Heavy ringing/vibration
          if (prevD > 3 && d <= 3) {
            Vibration.vibrate([0, 800, 200, 800, 200, 800, 200, 800, 200, 800, 200, 800]);
            scheduleLocalNotification('⚠️ EVASIVE ACTION REQUIRED', 'Ambulance < 3km! Please clear the road immediately.');
          }

          lastAlertDist.current = d;
          return currentLoc;
        });
      },
      onVehicleArrived: (data) => {
        // Clear ambulance from community map
        webRef.current?.postMessage(JSON.stringify({ type: 'ambulanceArrived' }));
        setActiveAlert(null);
        setCleared(false);
        setDistance(null);
      },
      onDisasterEnroute: (data) => {
        const typeIcons = { flood: '🌊', fire: '🔥', medical: '🏥', rescue: '🚁' };
        const icon = typeIcons[data.type] || '🚨';
        const alertObj = {
          id: Date.now().toString(),
          vehicleType: 'disaster',
          teamName: data.teamName || 'Rescue Team',
          disasterType: data.type,
          icon,
          receivedAt: new Date().toISOString(),
          alertLevel: 'disaster',
        };
        setActiveAlert(alertObj);
        setCleared(false);
        Vibration.vibrate([0, 500, 200, 500, 200, 500, 200, 500]);
        scheduleLocalNotification(
          `${icon} EMERGENCY CONVOY EN ROUTE`,
          `${data.teamName || 'Rescue Team'} is heading your way. Clear the road immediately.`
        );
      },
      onDisasterArrived: () => {
        webRef.current?.postMessage(JSON.stringify({ type: 'ambulanceArrived' }));
        setActiveAlert(null);
        setCleared(false);
        setDistance(null);
      },
      onVehicleActive: (data) => {
        // Vehicle just dispatched (or user opened app mid-journey) — show alert card
        const v = data.vehicle || data;
        setActiveAlert(prev => prev || {
          id: Date.now().toString(),
          vehicleType: v.vehicleType || 'ambulance',
          receivedAt: new Date().toISOString(),
          alertLevel: 'dispatched',
        });
        setCleared(false);
        Vibration.vibrate([0, 300, 150, 300]);
      },
      onVoiceBroadcast: (data) => {
        navigation.navigate('VoicePlayer', { audioUrl: data.audioUrl, fromName: data.fromName });
      },
    });
  }, []);

  const handleCleared = () => {
    setCleared(true);
    Vibration.cancel();
  };

  // DEMO: Set manual position
  const DEMO_PRESETS = [
    { label: '📍 Near Baby Memorial', lat: 11.2620, lng: 75.7825 },
    { label: '📍 Near MIMS Hospital', lat: 11.2730, lng: 75.7790 },
    { label: '📍 Mavoor Road', lat: 11.2590, lng: 75.7810 },
    { label: '📍 Mananchira', lat: 11.2555, lng: 75.7785 },
    { label: '📍 Near Medical College', lat: 11.2575, lng: 75.7710 },
  ];

  const setDemoPosition = (lat, lng) => {
    const newLoc = { lat, lng };
    setLocation(newLoc);
    setDemoLat(lat.toString());
    setDemoLng(lng.toString());
    emitCommunityPosition(lat, lng);
    webRef.current?.postMessage(JSON.stringify({ type: 'updateLocation', lat, lng }));
    Alert.alert('📍 Position Set', `Location: ${lat.toFixed(5)}, ${lng.toFixed(5)}\n\nYou will now receive live alerts when an ambulance approaches this position.`);
  };

  const applyManualPosition = () => {
    const lat = parseFloat(demoLat);
    const lng = parseFloat(demoLng);
    if (isNaN(lat) || isNaN(lng)) return Alert.alert('Invalid', 'Enter valid lat/lng numbers');
    setDemoPosition(lat, lng);
  };

  const onWebViewMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'mapClick') {
        setDemoPosition(data.lat, data.lng);
      }
    } catch {}
  };

  const vehicleEmoji = { ambulance: '🚑', fire: '🚒', rescue: '⛵', police: '🚓' };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Profile Header */}
      <View style={styles.profileCard}>
        <View style={styles.profileTop}>
          <Text style={styles.profileLabel}>PROFILE INTERFACE</Text>
          <View style={styles.activeBadge}>
            <Text style={styles.activeBadgeText}>ACTIVE</Text>
          </View>
        </View>
        <View style={styles.profileRow}>
          <View style={styles.profileAvatar}>
            <Text style={styles.avatarText}>A7</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{user?.name || 'ALPHA-7'}</Text>
            <Text style={styles.profileDistrict}>Community Member • ResQNet</Text>
          </View>
        </View>
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={{ fontSize: 20, marginBottom: 4 }}>🎖️</Text>
            <Text style={styles.statLabel}>CREDITS</Text>
            <Text style={styles.statValue}>1,240</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={{ fontSize: 20, marginBottom: 4 }}>✅</Text>
            <Text style={styles.statLabel}>SUCCESS</Text>
            <Text style={styles.statValue}>98%</Text>
          </View>
        </View>
      </View>

      {/* ACTIVE ALERT — Ambulance Approaching */}
      {activeAlert && !cleared ? (
        <Animated.View style={[styles.alertCard, { transform: [{ scale: scaleAnim }] }]}>
          <View style={styles.alertTopLine} />
          <View style={styles.alertContent}>
            {/* Pulsing icon */}
            <View style={styles.alertIconWrap}>
              <Animated.View style={[styles.alertPulse, { opacity: pulseAnim }]} />
              <Text style={styles.alertIconText}>🚨</Text>
            </View>

            <Text style={styles.alertTitle}>
              {(activeAlert.vehicleType || 'Ambulance').toUpperCase()} APPROACHING
            </Text>

            <Text style={styles.alertDistance}>{distance || '?'} KM</Text>

            <View style={styles.alertBadge}>
              <Animated.View style={[styles.alertBadgeDot, { opacity: pulseAnim }]} />
              <Text style={styles.alertBadgeText}>PRIORITY CODE RED • YIELD IMMEDIATE</Text>
            </View>

            <TouchableOpacity style={styles.clearBtn} onPress={handleCleared} activeOpacity={0.8}>
              <Text style={{ fontSize: 18 }}>✅</Text>
              <Text style={styles.clearBtnText}>I HAVE CLEARED THE PATH</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.viewRouteBtn} onPress={() => {
              if (activeAlert) {
                webRef.current?.postMessage(JSON.stringify({ type: 'drawAmbulanceRoute', coords: [] }));
              }
            }}>
              <Text style={{ fontSize: 16 }}>🗺️</Text>
              <Text style={styles.viewRouteBtnText}>Emergency Vehicle Route</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      ) : cleared ? (
        /* Cleared confirmation */
        <View style={styles.clearedCard}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>✅</Text>
          <Text style={styles.clearedTitle}>Path Cleared</Text>
          <Text style={styles.clearedSub}>Thank you! The emergency vehicle has been notified.</Text>
        </View>
      ) : (
        /* No active alert */
        <View style={styles.noAlertCard}>
          <Text style={{ fontSize: 36, marginBottom: 12 }}>📡</Text>
          <Text style={styles.noAlertTitle}>Standing By</Text>
          <Text style={styles.noAlertSub}>You will be alerted when an emergency vehicle approaches within 3 km of your location.</Text>
        </View>
      )}

      {/* Location */}
      {location && (
        <View style={styles.locationCard}>
          <View style={styles.locationHeader}>
            <Text style={{ fontSize: 14 }}>📍</Text>
            <Text style={styles.locationLabel}>CURRENT LOCATION</Text>
          </View>
          <Text style={styles.locationCoords}>{location.lat.toFixed(5)}, {location.lng.toFixed(5)}</Text>
        </View>
      )}

      {/* DEMO: Manual Position Setter */}
      <View style={styles.demoCard}>
        <Text style={styles.demoTitle}>🧪 SET MY POST (Click map)</Text>
        <Text style={styles.demoSub}>Tap on the map to set your location and test proximity alerts (3km/5km/10km) when the ambulance moves.</Text>

        <View style={styles.miniMapWrap}>
          <WebView
            ref={webRef}
            source={{ html: getCommunityMapHTML(location?.lat || 11.2588, location?.lng || 75.7804) }}
            style={{ width: '100%', height: '100%' }}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            onMessage={onWebViewMessage}
          />
        </View>

        <View style={styles.manualRow}>
          <TextInput
            style={styles.manualInput}
            placeholder="Latitude"
            placeholderTextColor="#4a5568"
            keyboardType="numeric"
            value={demoLat}
            onChangeText={setDemoLat}
          />
          <TextInput
            style={styles.manualInput}
            placeholder="Longitude"
            placeholderTextColor="#4a5568"
            keyboardType="numeric"
            value={demoLng}
            onChangeText={setDemoLng}
          />
          <TouchableOpacity style={styles.manualApplyBtn} onPress={applyManualPosition}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Set</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Safety Protocols */}
      <View style={styles.protocolCard}>
        <View style={styles.protocolHeader}>
          <Text style={{ fontSize: 14 }}>🛡️</Text>
          <Text style={styles.protocolTitle}>SAFETY PROTOCOLS</Text>
        </View>
        <View style={styles.protocolList}>
          {[
            'Pull safely to the nearest right-hand shoulder or curb immediately.',
            'Remain stationary until the emergency vehicle has completely passed.',
            'Activate hazard lights to signal other drivers and responders.'
          ].map((text, i) => (
            <View key={i} style={styles.protocolItem}>
              <View style={styles.protocolNum}>
                <Text style={styles.protocolNumText}>{i + 1}</Text>
              </View>
              <Text style={styles.protocolText}>{text}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Proximity Network */}
      <View style={styles.networkCard}>
        <Text style={styles.networkTitle}>PROXIMITY NETWORK</Text>
        {networkMembers.map(m => (
          <View key={m.id} style={[styles.networkRow, m.status === 'standby' && { opacity: 0.4 }]}>
            <View style={[styles.networkDot, { backgroundColor: m.status === 'cleared' ? '#4ade80' : '#8e9199' }]} />
            <Text style={styles.networkName}>{m.name}</Text>
            <Text style={[styles.networkStatus, m.status === 'cleared' ? { color: '#4ade80' } : { color: '#8e9199' }]}>
              {m.status.toUpperCase()}
            </Text>
          </View>
        ))}
      </View>

      {/* Alert History */}
      {alertHistory.length > 0 && (
        <View style={styles.historyCard}>
          <Text style={styles.historyTitle}>RECENT ALERTS</Text>
          {alertHistory.slice(0, 5).map(a => (
            <View key={a.id} style={styles.historyRow}>
              <Text style={{ fontSize: 16 }}>{vehicleEmoji[a.vehicleType] || '🚨'}</Text>
              <Text style={styles.historyText}>{(a.vehicleType || 'Emergency').toUpperCase()}</Text>
              <Text style={styles.historyTime}>{new Date(a.receivedAt).toLocaleTimeString()}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
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
  container: { flex: 1, backgroundColor: '#121316', padding: 16 },
  // Profile Card
  profileCard: { backgroundColor: '#1a1c1e', borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(68,71,78,0.2)' },
  profileTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  profileLabel: { color: '#8e9199', fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  activeBadge: { backgroundColor: 'rgba(138,180,248,0.1)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 50, borderWidth: 1, borderColor: 'rgba(138,180,248,0.2)' },
  activeBadgeText: { color: '#8ab4f8', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  profileAvatar: { width: 56, height: 56, borderRadius: 16, backgroundColor: 'rgba(138,180,248,0.08)', borderWidth: 1, borderColor: 'rgba(68,71,78,0.3)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#8ab4f8', fontSize: 20, fontWeight: '900' },
  profileName: { color: '#e2e2e6', fontSize: 20, fontWeight: '800' },
  profileDistrict: { color: '#8e9199', fontSize: 12, marginTop: 2 },
  statsGrid: { flexDirection: 'row', gap: 12 },
  statBox: { flex: 1, backgroundColor: 'rgba(18,19,22,0.6)', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(68,71,78,0.1)', alignItems: 'center' },
  statLabel: { color: '#8e9199', fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginBottom: 4 },
  statValue: { color: '#e2e2e6', fontSize: 20, fontWeight: '800' },
  // Alert Card
  alertCard: { backgroundColor: '#1a1c1e', borderRadius: 16, marginBottom: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(68,71,78,0.2)' },
  alertTopLine: { height: 4, backgroundColor: '#ff5252' },
  alertContent: { padding: 24, alignItems: 'center' },
  alertIconWrap: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  alertPulse: { position: 'absolute', width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,82,82,0.15)' },
  alertIconText: { fontSize: 48 },
  alertTitle: { color: '#ff5252', fontSize: 12, fontWeight: '800', letterSpacing: 2, marginBottom: 8 },
  alertDistance: { color: '#e2e2e6', fontSize: 56, fontWeight: '900', letterSpacing: -2, marginBottom: 12 },
  alertBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,82,82,0.08)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 50, borderWidth: 1, borderColor: 'rgba(255,82,82,0.2)', marginBottom: 28 },
  alertBadgeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ff5252' },
  alertBadgeText: { color: '#ffb4ab', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  clearBtn: { width: '100%', backgroundColor: '#ff5252', borderRadius: 12, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 10, minHeight: 56 },
  clearBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  viewRouteBtn: { width: '100%', backgroundColor: '#212429', borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52 },
  viewRouteBtnText: { color: '#e2e2e6', fontWeight: '600', fontSize: 14 },
  // Cleared
  clearedCard: { backgroundColor: '#1a1c1e', borderRadius: 16, padding: 32, marginBottom: 16, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(74,222,128,0.2)' },
  clearedTitle: { color: '#4ade80', fontSize: 22, fontWeight: '800', marginBottom: 4 },
  clearedSub: { color: '#8e9199', fontSize: 13, textAlign: 'center' },
  // No alert
  noAlertCard: { backgroundColor: '#1a1c1e', borderRadius: 16, padding: 32, marginBottom: 16, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(68,71,78,0.2)' },
  noAlertTitle: { color: '#8ab4f8', fontSize: 22, fontWeight: '800', marginBottom: 4 },
  noAlertSub: { color: '#8e9199', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  // Location
  locationCard: { backgroundColor: '#1a1c1e', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(68,71,78,0.15)' },
  locationHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  locationLabel: { color: '#8ab4f8', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  locationCoords: { color: '#8e9199', fontFamily: 'monospace', fontSize: 12 },
  // Protocols
  protocolCard: { backgroundColor: 'rgba(18,19,22,0.5)', borderRadius: 16, padding: 20, marginBottom: 16, borderLeftWidth: 4, borderLeftColor: '#ff5252' },
  protocolHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  protocolTitle: { color: '#e2e2e6', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  protocolList: {},
  protocolItem: { flexDirection: 'row', gap: 12, marginBottom: 12, alignItems: 'flex-start' },
  protocolNum: { backgroundColor: 'rgba(255,82,82,0.1)', width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  protocolNumText: { color: '#ff5252', fontSize: 10, fontWeight: '900' },
  protocolText: { color: '#c4c6d0', fontSize: 12, flex: 1, lineHeight: 18 },
  // Network
  networkCard: { backgroundColor: '#1a1c1e', borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(68,71,78,0.2)' },
  networkTitle: { color: '#8e9199', fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 12 },
  networkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8 },
  networkDot: { width: 8, height: 8, borderRadius: 4 },
  networkName: { color: '#e2e2e6', fontSize: 13, fontWeight: '700', flex: 1 },
  networkStatus: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  // History
  historyCard: { backgroundColor: '#1a1c1e', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: 'rgba(68,71,78,0.2)' },
  historyTitle: { color: '#8e9199', fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 12 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  historyText: { color: '#e2e2e6', fontSize: 13, fontWeight: '600', flex: 1 },
  historyTime: { color: '#8e9199', fontSize: 11 },
  // Demo position
  demoCard: { backgroundColor: '#1a1c1e', borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(251,191,36,0.2)', borderLeftWidth: 4, borderLeftColor: '#fbbf24' },
  demoTitle: { color: '#fbbf24', fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 6 },
  demoSub: { color: '#9aa0a6', fontSize: 12, marginBottom: 4 },
  presetBtn: { backgroundColor: 'rgba(251,191,36,0.08)', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 50, marginRight: 8, borderWidth: 1, borderColor: 'rgba(251,191,36,0.15)' },
  presetText: { color: '#fbbf24', fontSize: 12, fontWeight: '700' },
  demoOrText: { color: '#44474e', fontSize: 11, textAlign: 'center', marginVertical: 8 },
  miniMapWrap: { height: 180, borderRadius: 12, overflow: 'hidden', marginVertical: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  manualRow: { flexDirection: 'row', gap: 8 },
  manualInput: { flex: 1, backgroundColor: '#212429', borderRadius: 10, padding: 12, color: '#e2e2e6', fontSize: 13, borderWidth: 1, borderColor: 'rgba(68,71,78,0.3)' },
  manualApplyBtn: { backgroundColor: '#fbbf24', borderRadius: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
});

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Vibration, Animated, Dimensions, Switch, StatusBar,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { useAuthStore, api } from '../../store/useStore';
import { connectSocket, listenToEvents, emitCommunityPosition } from '../../services/socket';

// ── Notifications ────────────────────────────────────────────────────────────
let Notifications = null;
let notificationsReady = false;
try {
  Notifications = require('expo-notifications');
  if (Notifications?.setNotificationHandler) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false,
      }),
    });
    notificationsReady = true;
  }
} catch (_) { Notifications = null; }

const notify = async (title, body) => {
  if (!notificationsReady || !Notifications?.scheduleNotificationAsync) return;
  try { await Notifications.scheduleNotificationAsync({ content: { title, body, sound: true }, trigger: null }); } catch (_) {}
};

// ── Haversine ─────────────────────────────────────────────────────────────────
function getDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Map HTML ──────────────────────────────────────────────────────────────────
function getMapHTML(lat, lng) {
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>*{margin:0;padding:0}html,body,#map{width:100%;height:100%;background:#0d0f14}</style>
</head><body><div id="map"></div><script>
var map=L.map('map',{zoomControl:false}).setView([${lat},${lng}],14);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(map);
var userIcon=L.divIcon({className:'',html:'<div style="width:18px;height:18px;background:#00c9a7;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 4px rgba(0,201,167,0.3)"></div>',iconSize:[18,18],iconAnchor:[9,9]});
var ambIcon=L.divIcon({className:'',html:'<div style="font-size:26px;filter:drop-shadow(0 0 6px rgba(255,80,80,0.8))">🚑</div>',iconSize:[32,32],iconAnchor:[16,16]});
var me=L.marker([${lat},${lng}],{icon:userIcon}).addTo(map);
var amb=null; var route=null;
function msg(d){
  if(d.type==='moveBoth'){me.setLatLng([d.ulat,d.ulng]);map.panTo([d.ulat,d.ulng]);}
  if(d.type==='ambulanceMoved'){if(!amb)amb=L.marker([d.lat,d.lng],{icon:ambIcon}).addTo(map);else amb.setLatLng([d.lat,d.lng]);}
  if(d.type==='drawRoute'&&d.coords){if(route)map.removeLayer(route);route=L.polyline(d.coords,{color:'#ff5050',weight:3,opacity:0.85,dashArray:'8,4'}).addTo(map);if(d.coords.length)map.fitBounds(route.getBounds(),{padding:[20,20]});}
  if(d.type==='clearMap'){if(amb){map.removeLayer(amb);amb=null;}if(route){map.removeLayer(route);route=null;}}
}
window.addEventListener('message',function(e){try{msg(JSON.parse(e.data));}catch(e){}});
document.addEventListener('message',function(e){try{msg(JSON.parse(e.data));}catch(e){}});
</script></body></html>`;
}

const { width: SW } = Dimensions.get('window');

// ── Distance display ──────────────────────────────────────────────────────────
function DistanceMeter({ km }) {
  if (!km) return null;
  const d = parseFloat(km);
  const color = d <= 2 ? '#ff4444' : d <= 5 ? '#ff9800' : '#00c9a7';
  const label = d <= 2 ? '⚠️ VERY CLOSE' : d <= 5 ? '🔔 NEARBY' : '📡 APPROACHING';
  return (
    <View style={meter.wrap}>
      <Text style={meter.label}>{label}</Text>
      <Text style={[meter.km, { color }]}>{d.toFixed(1)} <Text style={meter.unit}>KM</Text></Text>
      <View style={meter.bar}>
        <Animated.View style={[meter.fill, { width: `${Math.max(5, Math.min(100, (1 - d / 12) * 100))}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}
const meter = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 8 },
  label: { color: '#8a91a0', fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 4 },
  km: { fontSize: 64, fontWeight: '900', letterSpacing: -3, lineHeight: 72 },
  unit: { fontSize: 22, fontWeight: '700', letterSpacing: 0 },
  bar: { height: 4, width: '80%', borderRadius: 2, backgroundColor: '#1e2330', marginTop: 10, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
});

// ─────────────────────────────────────────────────────────────────────────────

export default function CommunityHome({ navigation }) {
  const { user } = useAuthStore();
  const [location, setLocation] = useState(null);
  const [activeAlert, setActiveAlert] = useState(null);
  const [alertHistory, setAlertHistory] = useState([]);
  const [distance, setDistance] = useState(null);
  const [cleared, setCleared] = useState(false);
  // Initialize from stored value (user.isActive from login, overridden by AsyncStorage cache)
  const [isActive, setIsActive] = useState(user?.isActive !== false);
  const [togglingActive, setTogglingActive] = useState(false);

  const webRef = useRef(null);
  const lastDist = useRef(999);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Pulse loop for alert
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.15, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Entry animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  // Load persisted toggle state from AsyncStorage (survives app restarts)
  useEffect(() => {
    AsyncStorage.getItem('community_active_status').then(val => {
      if (val !== null) setIsActive(val === 'true');
    }).catch(() => {});
  }, []);

  // Toggle active status — updates backend + persists locally
  const toggleActive = useCallback(async (val) => {
    setIsActive(val); // Optimistic update
    try {
      await AsyncStorage.setItem('community_active_status', String(val));
      await api.patch(`/api/admin/community/${user._id}/status`, { isActive: val });
    } catch {
      // On backend failure keep local state (don't spring back)
      // Only revert if AsyncStorage also fails — unlikely
    }
  }, [user?._id]);

  // Distance-based threshold actions
  const checkThresholds = useCallback((d) => {
    const prev = lastDist.current;

    // 10km → notification only
    if (prev > 10 && d <= 10 && d > 5) {
      notify('🚑 Ambulance 10 km Away', 'Emergency vehicle entering your area. Stay alert.');
      Vibration.vibrate([0, 250, 150, 250]);
    }
    // 5km → heavy vibration + notification (ringing effect)
    if (prev > 5 && d <= 5 && d > 2) {
      notify('🔔 AMBULANCE 5 km — PREPARE TO CLEAR', 'Pull over. Emergency vehicle is 5 km away.');
      Vibration.vibrate([0, 700, 200, 700, 200, 700, 200, 700, 200, 700]);
    }
    // 2km → maximum urgency
    if (prev > 2 && d <= 2) {
      notify('⚠️ CLEAR THE ROAD NOW', 'Ambulance is less than 2 km away!');
      Vibration.vibrate([0, 1000, 100, 1000, 100, 1000, 100, 1000, 100, 1000, 100, 1000]);
    }

    lastDist.current = d;
  }, []);

  // Socket setup
  useEffect(() => {
    (async () => {
      if (notificationsReady && Notifications?.requestPermissionsAsync) await Notifications.requestPermissionsAsync().catch(() => {});
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        const newLoc = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        setLocation(newLoc);
        emitCommunityPosition(newLoc.lat, newLoc.lng);
      }
    })();

    connectSocket(user._id);
    listenToEvents({
      onCommunityAlert: (data) => {
        const alert = { ...data, id: Date.now().toString(), receivedAt: new Date().toISOString(), vehicleType: data.vehicleType || 'ambulance' };
        setActiveAlert(alert);
        setCleared(false);
        setAlertHistory(prev => [alert, ...prev].slice(0, 15));

        if (data.alertLevel === '10km') {
          notify('🚑 Ambulance 10 km Away', 'Emergency vehicle approaching your area.');
          Vibration.vibrate([0, 250, 150, 250]);
        } else if (data.alertLevel === '5km') {
          notify('🔔 AMBULANCE 5 km — CLEAR THE ROAD', 'Emergency vehicle is 5 km away. Pull over now.');
          Vibration.vibrate([0, 700, 200, 700, 200, 700, 200, 700, 200, 700]);
        }
      },
      onVehicleMoved: (data) => {
        webRef.current?.postMessage(JSON.stringify({ type: 'ambulanceMoved', lat: data.lat, lng: data.lng }));
        setLocation(cur => {
          if (!cur) return cur;
          const d = getDistanceKm(cur.lat, cur.lng, data.lat, data.lng);
          setDistance(d.toFixed(1));
          checkThresholds(d);
          // FIX: Do NOT create phantom alert here — only update distance
          return cur;
        });
      },
      onVehicleArrived: () => {
        webRef.current?.postMessage(JSON.stringify({ type: 'clearMap' }));
        setActiveAlert(null); setCleared(false); setDistance(null);
        lastDist.current = 999;
      },
      onDisasterEnroute: (data) => {
        const icons = { flood: '🌊', fire: '🔥', medical: '🏥', rescue: '🚁' };
        const icon = icons[data.type] || '🚨';
        setActiveAlert({ id: Date.now().toString(), vehicleType: 'disaster', teamName: data.teamName, icon, receivedAt: new Date().toISOString(), alertLevel: 'disaster' });
        setCleared(false);
        Vibration.vibrate([0, 500, 200, 500, 200, 500, 200, 500]);
        notify(`${icon} EMERGENCY CONVOY EN ROUTE`, `${data.teamName || 'Rescue Team'} — clear the road.`);
      },
      onDisasterArrived: () => {
        webRef.current?.postMessage(JSON.stringify({ type: 'clearMap' }));
        setActiveAlert(null); setCleared(false); setDistance(null);
      },
      onDisasterCommunityAlert: (data) => {
        const icons = { flood: '🌊', fire: '🔥', medical: '🏥', rescue: '🚁' };
        const icon = icons[data.type] || '🚨';
        const hospName = data.nearestHospital?.name || '';
        const campName = data.safetyCamp?.name || '';
        const distStr = data.distanceKm ? `${data.distanceKm} km away` : '';
        const alert = {
          id: Date.now().toString(), vehicleType: 'disaster',
          teamName: data.teamName, icon, receivedAt: new Date().toISOString(),
          alertLevel: 'disaster', hospitalName: hospName, campName: campName,
        };
        setActiveAlert(alert);
        setCleared(false);
        setAlertHistory(prev => [alert, ...prev].slice(0, 15));
        Vibration.vibrate([0, 700, 200, 700, 200, 700, 200, 700, 200, 700]);
        const body = [
          `${data.teamName || 'Rescue Team'} responding ${distStr}`,
          hospName ? `🏥 ${hospName}` : '',
          campName ? `⛺ Safety camp: ${campName}` : '',
        ].filter(Boolean).join('\n');
        notify(`${icon} DISASTER ALERT — CLEAR THE ROAD`, body);
      },
      onVehicleActive: () => {
        // FIX: Do NOT create phantom alert — real alerts come via alert:community only
      },
      onVoiceBroadcast: (data) => navigation.navigate('VoicePlayer', { audioUrl: data.audioUrl, fromName: data.fromName }),
    });
  }, []);

  const handleCleared = () => { Vibration.cancel(); setCleared(true); };

  const handleAttendDisaster = async () => {
    if (!activeAlert?.eventId) return;
    try {
      await api.patch(`/api/disaster/${activeAlert.eventId}/attend`);
      Vibration.cancel();
      setCleared(true);
      notify('✅ Volunteer Confirmed', `You are now attached to ${activeAlert.teamName}. Proceed safely.`);
    } catch (e) {
      console.warn('Attend error:', e.message);
    }
  };

  const vEmoji = { ambulance: '🚑', fire: '🚒', rescue: '⛵', police: '🚓', disaster: activeAlert?.icon || '🚨' };

  const statusColor = isActive ? '#00c9a7' : '#44495a';
  const statusText = isActive ? 'ACTIVE' : 'INACTIVE';

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0b0d14" />
      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 48 }} showsVerticalScrollIndicator={false}>

        {/* ── Header ── */}
        <Animated.View style={[s.header, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <View style={s.headerLeft}>
            <View style={[s.avatarRing, { borderColor: statusColor }]}>
              <Text style={s.avatarLetter}>{(user?.name || 'U')[0].toUpperCase()}</Text>
            </View>
            <View>
              <Text style={s.headerName}>{user?.name || 'Community Member'}</Text>
              <View style={s.headerBadge}>
                <View style={[s.statusDot, { backgroundColor: statusColor }]} />
                <Text style={[s.statusText, { color: statusColor }]}>{statusText}</Text>
              </View>
            </View>
          </View>
          {/* Active Toggle */}
          <View style={s.toggleWrap}>
            <Text style={s.toggleLabel}>{isActive ? 'On Duty' : 'Off Duty'}</Text>
            <Switch
              value={isActive}
              onValueChange={toggleActive}
              disabled={togglingActive}
              trackColor={{ false: '#1e2330', true: 'rgba(0,201,167,0.35)' }}
              thumbColor={isActive ? '#00c9a7' : '#44495a'}
              ios_backgroundColor="#1e2330"
            />
          </View>
        </Animated.View>

        {/* ── Active Alert ── */}
        {activeAlert && !cleared ? (
          <Animated.View style={[s.alertCard, { opacity: fadeAnim }]}>
            {/* Glow top accent */}
            <View style={s.alertGlow} />
            <View style={s.alertGlowLine} />

            {/* Icon area */}
            <View style={s.alertIconArea}>
              <Animated.View style={[s.alertRing, { opacity: pulseAnim }]} />
              <Text style={s.alertEmoji}>{activeAlert.vehicleType === 'disaster' ? (activeAlert.icon || '🚨') : vEmoji[activeAlert.vehicleType] || '🚑'}</Text>
            </View>

            <Text style={s.alertVehicleType}>
              {activeAlert.vehicleType === 'disaster' ? (activeAlert.teamName || 'RESCUE CONVOY') : `${(activeAlert.vehicleType || 'AMBULANCE').toUpperCase()} APPROACHING`}
            </Text>

            <DistanceMeter km={distance} />

            <View style={s.codeRedBadge}>
              <Animated.View style={[s.codeRedDot, { opacity: pulseAnim }]} />
              <Text style={s.codeRedText}>PRIORITY CODE RED  •  YIELD IMMEDIATE</Text>
            </View>

            <View style={s.alertActions}>
              {activeAlert.vehicleType === 'disaster' ? (
                <>
                  <TouchableOpacity style={[s.clearBtn, { backgroundColor: '#fbbc04' }]} onPress={handleAttendDisaster} activeOpacity={0.8}>
                    <Text style={[s.clearBtnText, { color: '#0F1923' }]}>✋ I CAN ATTEND (VOLUNTEER)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.clearBtn, { backgroundColor: '#161922', marginTop: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }]} onPress={handleCleared} activeOpacity={0.8}>
                    <Text style={[s.clearBtnText, { color: '#8a91a0', fontSize: 13 }]}>❌ Cannot Attend</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity style={s.clearBtn} onPress={handleCleared} activeOpacity={0.8}>
                  <Text style={s.clearBtnText}>✅  I HAVE CLEARED THE PATH</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={s.routeBtn} onPress={() => webRef.current?.postMessage(JSON.stringify({ type: 'drawRoute', coords: [] }))} activeOpacity={0.8}>
                <Text style={s.routeBtnText}>🗺️  Emergency Vehicle Route</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        ) : cleared ? (
          <View style={s.clearedCard}>
            <Text style={s.clearedEmoji}>✅</Text>
            <Text style={s.clearedTitle}>{activeAlert?.vehicleType === 'disaster' ? 'Response Logged' : 'Path Cleared'}</Text>
            <Text style={s.clearedSub}>{activeAlert?.vehicleType === 'disaster' ? 'Thank you for volunteering.' : 'Thank you for keeping emergency lanes clear.'}</Text>
          </View>
        ) : (
          <View style={s.standbyCard}>
            <View style={s.standbyIcon}>
              <Text style={{ fontSize: 32 }}>📡</Text>
            </View>
            <Text style={s.standbyTitle}>Standing By</Text>
            <Text style={s.standbySub}>
              You'll be alerted when an emergency vehicle approaches.{'\n'}
              <Text style={{ color: '#00c9a7' }}>10 km</Text> → Notification  ·  <Text style={{ color: '#ff9800' }}>5 km</Text> → Ringing  ·  <Text style={{ color: '#ff4444' }}>2 km</Text> → Urgent
            </Text>
          </View>
        )}

        {/* ── Live Map ── */}
        <View style={s.mapCard}>
          <View style={s.mapHeader}>
            <View style={s.mapDot} />
            <Text style={s.mapTitle}>LIVE POSITION</Text>
            {location && <Text style={s.mapCoords}>{location.lat.toFixed(4)}, {location.lng.toFixed(4)}</Text>}
          </View>
          <View style={s.mapWrap}>
            <WebView
              ref={webRef}
              source={{ html: getMapHTML(location?.lat || 11.2588, location?.lng || 75.7804) }}
              style={{ width: '100%', height: '100%' }}
              javaScriptEnabled
              domStorageEnabled
              onMessage={(e) => {
                try {
                  const d = JSON.parse(e.nativeEvent.data);
                  if (d.type === 'mapClick') {
                    const newLoc = { lat: d.lat, lng: d.lng };
                    setLocation(newLoc);
                    emitCommunityPosition(d.lat, d.lng);
                  }
                } catch {}
              }}
            />
          </View>
          <Text style={s.mapHint}>Tap map to update your position</Text>
        </View>

        {/* ── Alert History ── */}
        {alertHistory.length > 0 && (
          <View style={s.histCard}>
            <Text style={s.histTitle}>RECENT ALERTS</Text>
            {alertHistory.slice(0, 5).map(a => (
              <View key={a.id} style={s.histRow}>
                <Text style={{ fontSize: 18, width: 28 }}>{vEmoji[a.vehicleType] || '🚨'}</Text>
                <Text style={s.histType}>{(a.vehicleType || 'Emergency').toUpperCase()}</Text>
                <Text style={s.histTime}>{new Date(a.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Protocols ── */}
        <View style={s.protoCard}>
          <Text style={s.protoHeader}>🛡️  SAFETY PROTOCOLS</Text>
          {[
            'Move to the nearest right-hand shoulder or curb immediately.',
            'Stay fully stopped until the emergency vehicle passes.',
            'Switch on hazard lights to signal other drivers.',
          ].map((t, i) => (
            <View key={i} style={s.protoRow}>
              <View style={s.protoNum}><Text style={s.protoNumTxt}>{i + 1}</Text></View>
              <Text style={s.protoTxt}>{t}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const TEAL = '#00c9a7';
const RED = '#ff4b6e';
const BG = '#0b0d14';
const CARD = '#12151f';
const BORDER = 'rgba(255,255,255,0.07)';

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1, paddingHorizontal: 16 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 20 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarRing: { width: 46, height: 46, borderRadius: 14, borderWidth: 2, backgroundColor: '#161922', alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: TEAL, fontSize: 18, fontWeight: '900' },
  headerName: { color: '#e8ecf4', fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
  headerBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  toggleWrap: { alignItems: 'center', gap: 4 },
  toggleLabel: { color: '#8a91a0', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  // Alert Card
  alertCard: { backgroundColor: CARD, borderRadius: 20, marginBottom: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,75,110,0.2)' },
  alertGlow: { position: 'absolute', top: -30, left: SW / 2 - 80, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,75,110,0.08)' },
  alertGlowLine: { height: 2, backgroundColor: RED, opacity: 0.8 },
  alertIconArea: { alignItems: 'center', justifyContent: 'center', paddingTop: 28, paddingBottom: 8, position: 'relative' },
  alertRing: { position: 'absolute', width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(255,75,110,0.15)' },
  alertEmoji: { fontSize: 52, zIndex: 1 },
  alertVehicleType: { color: RED, fontSize: 11, fontWeight: '800', letterSpacing: 2.5, textAlign: 'center', paddingHorizontal: 20 },
  codeRedBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center', backgroundColor: 'rgba(255,75,110,0.08)', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 50, borderWidth: 1, borderColor: 'rgba(255,75,110,0.2)', marginBottom: 20 },
  codeRedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: RED },
  codeRedText: { color: '#ffb4c2', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  alertActions: { paddingHorizontal: 20, paddingBottom: 20, gap: 8 },
  clearBtn: { backgroundColor: RED, borderRadius: 14, paddingVertical: 17, alignItems: 'center' },
  clearBtnText: { color: '#fff', fontWeight: '800', fontSize: 14, letterSpacing: 0.5 },
  routeBtn: { backgroundColor: '#161922', borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: BORDER },
  routeBtnText: { color: '#c0c8d8', fontWeight: '700', fontSize: 13 },

  // Cleared
  clearedCard: { backgroundColor: CARD, borderRadius: 20, padding: 32, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(0,201,167,0.2)' },
  clearedEmoji: { fontSize: 44, marginBottom: 12 },
  clearedTitle: { color: TEAL, fontSize: 22, fontWeight: '800', marginBottom: 6 },
  clearedSub: { color: '#8a91a0', fontSize: 13, textAlign: 'center' },

  // Standby
  standbyCard: { backgroundColor: CARD, borderRadius: 20, padding: 28, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: BORDER },
  standbyIcon: { width: 72, height: 72, borderRadius: 20, backgroundColor: '#161922', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  standbyTitle: { color: '#e8ecf4', fontSize: 20, fontWeight: '800', marginBottom: 6 },
  standbySub: { color: '#8a91a0', fontSize: 13, textAlign: 'center', lineHeight: 22 },

  // Map
  mapCard: { backgroundColor: CARD, borderRadius: 20, marginBottom: 16, overflow: 'hidden', borderWidth: 1, borderColor: BORDER },
  mapHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  mapDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: TEAL },
  mapTitle: { color: TEAL, fontSize: 10, fontWeight: '800', letterSpacing: 2, flex: 1 },
  mapCoords: { color: '#4a5168', fontSize: 10, fontFamily: 'monospace' },
  mapWrap: { height: 200, marginHorizontal: 0 },
  mapHint: { color: '#3a3f50', fontSize: 10, textAlign: 'center', paddingVertical: 8 },

  // History
  histCard: { backgroundColor: CARD, borderRadius: 20, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: BORDER },
  histTitle: { color: '#44495a', fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 12 },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  histType: { color: '#c0c8d8', fontSize: 12, fontWeight: '700', flex: 1, marginLeft: 8 },
  histTime: { color: '#44495a', fontSize: 11 },

  // Protocols
  protoCard: { backgroundColor: CARD, borderRadius: 20, padding: 20, marginBottom: 4, borderWidth: 1, borderColor: BORDER, borderLeftWidth: 3, borderLeftColor: RED },
  protoHeader: { color: '#c0c8d8', fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 16 },
  protoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  protoNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(255,75,110,0.12)', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  protoNumTxt: { color: RED, fontSize: 10, fontWeight: '900' },
  protoTxt: { color: '#8a91a0', fontSize: 12, flex: 1, lineHeight: 20 },
});

import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Vibration, Animated, Dimensions
} from 'react-native';
import * as Location from 'expo-location';
import { useAuthStore, api } from '../../store/useStore';
import { connectSocket, listenToEvents, emitCommunityPosition } from '../../services/socket';

const { width: SCREEN_W } = Dimensions.get('window');

export default function CommunityHome({ navigation }) {
  const { user } = useAuthStore();
  const [location, setLocation] = useState(null);
  const [activeAlert, setActiveAlert] = useState(null);
  const [alertHistory, setAlertHistory] = useState([]);
  const [distance, setDistance] = useState(null);
  const [cleared, setCleared] = useState(false);
  const [networkMembers] = useState([
    { id: '1', name: 'OMEGA-2', status: 'cleared' },
    { id: '2', name: 'SIGMA-9', status: 'cleared' },
    { id: '3', name: 'DELTA-4', status: 'standby' },
  ]);

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

        // Calculate distance
        if (data.lat && data.lng && location) {
          const d = getDistanceKm(location.lat, location.lng, data.lat, data.lng);
          setDistance(d.toFixed(1));

          // < 3km: intensive vibration (phone rings)
          if (d < 3) {
            Vibration.vibrate([0, 800, 200, 800, 200, 800, 200, 800, 200, 800, 200, 800]);
          } else {
            Vibration.vibrate([0, 400, 200, 400]);
          }
        } else {
          Vibration.vibrate([0, 500, 200, 500, 200, 500]);
        }

        setAlertHistory(prev => [alert, ...prev].slice(0, 15));
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

            <TouchableOpacity style={styles.viewRouteBtn} onPress={() => {}}>
              <Text style={{ fontSize: 16 }}>🗺️</Text>
              <Text style={styles.viewRouteBtnText}>View Ambulance Route</Text>
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
});

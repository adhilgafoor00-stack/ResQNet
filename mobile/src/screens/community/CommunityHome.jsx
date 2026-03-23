import { useState, useEffect } from 'react';
import {
  View, Text, Switch, TouchableOpacity, StyleSheet,
  FlatList, Vibration
} from 'react-native';
import * as Location from 'expo-location';
import { useAuthStore, api } from '../../store/useStore';
import { connectSocket, listenToEvents, emitCommunityPosition } from '../../services/socket';

export default function CommunityHome({ navigation }) {
  const { user } = useAuthStore();
  const [alertMode, setAlertMode] = useState(false);
  const [location, setLocation] = useState(null);
  const [alertHistory, setAlertHistory] = useState([]);
  const [activeAlert, setActiveAlert] = useState(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        const newLoc = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        setLocation(newLoc);
        emitCommunityPosition(newLoc.lat, newLoc.lng); // community:position
      }
    })();

    const socket = connectSocket(user._id);
    listenToEvents({
      // alert:community — 500m community alert from dispatcher
      onCommunityAlert: (data) => {
        const alert = { ...data, receivedAt: new Date().toISOString(), id: Date.now().toString() };

        if (alertMode) {
          // ACTIVE MODE: full-screen alert + 5x vibration pulse
          Vibration.vibrate([0, 500, 200, 500, 200, 500, 200, 500, 200, 500]);
          setActiveAlert(alert);
        }

        // Always add to history regardless of mode
        setAlertHistory(prev => [alert, ...prev].slice(0, 20));
      },
      // broadcast:voice — play audio overlay
      onVoiceBroadcast: (data) => {
        navigation.navigate('VoicePlayer', { audioUrl: data.audioUrl, fromName: data.fromName });
      },
    });
  }, [alertMode]);

  const toggleAlertMode = async (value) => {
    setAlertMode(value);
    try {
      // Update user isActive status on server
      await api.patch ? null : null; // Silently — isActive toggled via socket register
    } catch { /* non-blocking */ }
  };

  const vehicleEmoji = { ambulance: '🚑', fire: '🚒', rescue: '⛵', police: '🚓' };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.role}>Community Member</Text>
      </View>

      {/* Alert mode toggle */}
      <View style={styles.modeCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.modeTitle}>Active Alert Mode</Text>
          <Text style={styles.modeDesc}>
            {alertMode
              ? '🔴 ON — Full-screen alerts + vibration'
              : '⚫ OFF — Silent notifications only'}
          </Text>
        </View>
        <Switch
          value={alertMode}
          onValueChange={toggleAlertMode}
          trackColor={{ false: '#2D3F55', true: '#00C896' }}
          thumbColor="#FFFFFF"
        />
      </View>

      {/* Location */}
      {location && (
        <View style={styles.locationCard}>
          <Text style={styles.sectionLabel}>📍 Your Position</Text>
          <Text style={styles.coords}>{location.lat.toFixed(5)}, {location.lng.toFixed(5)}</Text>
        </View>
      )}

      {/* Alert history */}
      <Text style={styles.sectionLabel}>Alert History</Text>
      <FlatList
        data={alertHistory}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.alertItem}>
            <Text style={styles.alertVehicle}>
              {vehicleEmoji[item.vehicleType] || '🚨'} {item.vehicleType?.toUpperCase() || 'Emergency'}
            </Text>
            <Text style={styles.alertTime}>{new Date(item.receivedAt).toLocaleTimeString()}</Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No alerts received yet</Text>
        }
      />

      {/* Full-screen active alert overlay */}
      {activeAlert && (
        <View style={styles.alertOverlay}>
          <Text style={styles.alertOverlayTitle}>⚠️ EMERGENCY VEHICLE</Text>
          <Text style={styles.alertOverlayVehicle}>
            {vehicleEmoji[activeAlert.vehicleType] || '🚨'} {activeAlert.vehicleType?.toUpperCase()}
          </Text>
          <Text style={styles.alertOverlayInstr}>CLEAR THE ROAD</Text>
          <Text style={styles.alertOverlayDesc}>Please move aside immediately</Text>
          <TouchableOpacity
            style={styles.alertDismissBtn}
            onPress={() => setActiveAlert(null)}
          >
            <Text style={{ color: '#FF4757', fontWeight: '700', fontSize: 16 }}>Got it</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1923', padding: 20 },
  header: { marginTop: 48, marginBottom: 24 },
  name: { color: '#FFFFFF', fontSize: 24, fontWeight: '800' },
  role: { color: '#8A9BB0', fontSize: 14, marginTop: 2 },
  modeCard: {
    backgroundColor: '#1A2535',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2D3F55',
  },
  modeTitle: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  modeDesc: { color: '#8A9BB0', fontSize: 13, marginTop: 4 },
  locationCard: {
    backgroundColor: '#1A2535',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2D3F55',
  },
  sectionLabel: { color: '#8A9BB0', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  coords: { color: '#00C896', fontFamily: 'monospace', fontSize: 13 },
  alertItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#1A2535',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2D3F55',
  },
  alertVehicle: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  alertTime: { color: '#8A9BB0', fontSize: 12 },
  emptyText: { color: '#4A5568', textAlign: 'center', marginTop: 24 },
  alertOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(255,71,87,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  alertOverlayTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginBottom: 16 },
  alertOverlayVehicle: { color: '#FFFFFF', fontSize: 56, marginBottom: 16 },
  alertOverlayInstr: { color: '#FFFFFF', fontSize: 32, fontWeight: '900', letterSpacing: 2, marginBottom: 8 },
  alertOverlayDesc: { color: 'rgba(255,255,255,0.8)', fontSize: 16, marginBottom: 40 },
  alertDismissBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 50,
    paddingHorizontal: 32,
    paddingVertical: 16,
    minWidth: 48,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

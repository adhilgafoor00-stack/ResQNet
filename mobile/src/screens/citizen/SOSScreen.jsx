import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
  Alert, ActivityIndicator, Vibration, Linking
} from 'react-native';
import * as Location from 'expo-location';
import NetInfo from '@react-native-community/netinfo';
import { useSosStore, useAuthStore } from '../../store/useStore';
import { smsFallback } from '../../services/offline';

const STATUS_MAP = {
  trapped: { color: '#FF4757', label: 'TRAPPED', priority: 1 },
  injured: { color: '#FFA502', label: 'INJURED', priority: 2 },
  safe: { color: '#2ED573', label: 'SAFE', priority: 3 },
};

export default function SOSScreen() {
  const [selectedStatus, setSelectedStatus] = useState('trapped');
  const [location, setLocation] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('acquiring'); // 'acquiring' | 'captured' | 'failed'
  const [pressing, setPressing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isConnected, setIsConnected] = useState(true);

  const { submitSos, sosState } = useSosStore();
  const { user } = useAuthStore();
  const progressAnim = useRef(new Animated.Value(0)).current;
  const pressTimer = useRef(null);

  useEffect(() => {
    // Get GPS on screen open
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setGpsStatus('failed');
        return;
      }
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        setGpsStatus('captured');
      } catch {
        setGpsStatus('failed');
      }
    })();

    // Monitor connectivity
    const unsub = NetInfo.addEventListener(s => setIsConnected(s.isConnected));
    return () => unsub();
  }, []);

  const startPress = () => {
    setPressing(true);
    progressAnim.setValue(0);
    // Animate progress ring over 3 seconds
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 3000,
      useNativeDriver: false,
    }).start();
    // After 3s — show confirm
    pressTimer.current = setTimeout(() => {
      setPressing(false);
      progressAnim.setValue(0);
      Vibration.vibrate([0, 200, 100, 200]);
      setShowConfirm(true);
    }, 3000);
  };

  const cancelPress = () => {
    setPressing(false);
    progressAnim.setValue(0);
    clearTimeout(pressTimer.current);
  };

  const confirmSos = async () => {
    setShowConfirm(false);
    if (!isConnected) {
      // SMS fallback: zero connectivity
      smsFallback(user.name, location?.lat || 0, location?.lng || 0, selectedStatus);
      return;
    }
    if (!location) {
      Alert.alert('No GPS', 'Location not captured. Please try again.');
      return;
    }
    await submitSos(location, selectedStatus);
    // 5-pulse vibration on SOS sent
    Vibration.vibrate([0, 500, 200, 500, 200, 500, 200, 500, 200, 500]);
  };

  const statusColor = STATUS_MAP[selectedStatus].color;
  const ringSize = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={styles.container}>
      {/* GPS Status */}
      <View style={styles.gpsRow}>
        <View style={[styles.dot, { backgroundColor: gpsStatus === 'captured' ? '#2ED573' : gpsStatus === 'failed' ? '#FF4757' : '#FFA502' }]} />
        <Text style={styles.gpsText}>
          {gpsStatus === 'captured' ? '📍 Location captured' : gpsStatus === 'failed' ? '⚠️ GPS unavailable' : '⏳ Acquiring GPS...'}
        </Text>
        {!isConnected && <Text style={[styles.gpsText, { color: '#FF4757', marginLeft: 12 }]}>⚡ Offline</Text>}
      </View>

      {/* Status Picker */}
      <View style={styles.statusRow}>
        {Object.entries(STATUS_MAP).map(([key, val]) => (
          <TouchableOpacity
            key={key}
            style={[styles.statusBtn, selectedStatus === key && { borderColor: val.color, backgroundColor: val.color + '22' }]}
            onPress={() => setSelectedStatus(key)}
          >
            <Text style={[styles.statusBtnText, { color: selectedStatus === key ? val.color : '#8A9BB0' }]}>
              {val.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Giant SOS button */}
      <View style={styles.sosWrapper}>
        {pressing && (
          <Animated.View style={[styles.progressRing, { borderColor: statusColor, width: ringSize, height: ringSize }]} />
        )}
        <TouchableOpacity
          style={[styles.sosBtn, { backgroundColor: statusColor }]}
          onPressIn={startPress}
          onPressOut={cancelPress}
          activeOpacity={0.9}
        >
          <Text style={styles.sosBtnText}>SOS</Text>
          <Text style={styles.sosBtnHint}>{pressing ? 'Hold 3 sec...' : 'Hold to send'}</Text>
        </TouchableOpacity>
      </View>

      {/* Status feedback */}
      {sosState === 'sent' && (
        <View style={[styles.feedback, { backgroundColor: '#2ED57322', borderColor: '#2ED573' }]}>
          <Text style={{ color: '#2ED573', fontWeight: '700' }}>✅ SOS Sent — Help is on the way</Text>
        </View>
      )}
      {sosState === 'queued' && (
        <View style={[styles.feedback, { backgroundColor: '#FFA50222', borderColor: '#FFA502' }]}>
          <Text style={{ color: '#FFA502', fontWeight: '700' }}>⏳ Queued Offline — Will sync when connected</Text>
        </View>
      )}

      {/* Confirm Modal */}
      {showConfirm && (
        <View style={styles.overlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Confirm SOS?</Text>
            <Text style={{ color: '#8A9BB0', fontSize: 14, marginBottom: 8 }}>
              Status: <Text style={{ color: statusColor, fontWeight: '700' }}>{STATUS_MAP[selectedStatus].label}</Text>
            </Text>
            {location && (
              <Text style={styles.coords}>{location.lat.toFixed(4)}, {location.lng.toFixed(4)}</Text>
            )}
            {!isConnected && (
              <Text style={{ color: '#FF4757', fontSize: 13, marginTop: 8 }}>⚡ No internet — will send via SMS</Text>
            )}
            <TouchableOpacity style={[styles.btn, { backgroundColor: statusColor }]} onPress={confirmSos}>
              <Text style={styles.btnText}>Send SOS</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => setShowConfirm(false)}>
              <Text style={{ color: '#8A9BB0', fontWeight: '600', fontSize: 16 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1923',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  gpsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
    gap: 8,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  gpsText: { color: '#8A9BB0', fontSize: 13 },
  statusRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 48,
  },
  statusBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 50,
    borderWidth: 1.5,
    borderColor: '#2D3F55',
    minWidth: 90,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  statusBtnText: { fontWeight: '700', fontSize: 13 },
  sosWrapper: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  progressRing: {
    position: 'absolute',
    borderWidth: 4,
    borderRadius: 999,
    borderStyle: 'solid',
  },
  sosBtn: {
    width: 180,
    height: 180,
    borderRadius: 90,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#FF4757',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    minWidth: 48,
    minHeight: 48,
  },
  sosBtnText: {
    color: '#FFFFFF',
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: 4,
  },
  sosBtnHint: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    marginTop: 4,
  },
  feedback: {
    marginTop: 32,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    width: '100%',
    alignItems: 'center',
  },
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  confirmCard: {
    backgroundColor: '#1A2535',
    borderRadius: 16,
    padding: 28,
    width: '100%',
    borderWidth: 1,
    borderColor: '#2D3F55',
    alignItems: 'center',
  },
  confirmTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 12,
  },
  coords: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#4A5568',
    marginBottom: 20,
  },
  btn: {
    width: '100%',
    padding: 16,
    borderRadius: 50,
    alignItems: 'center',
    marginTop: 10,
    minHeight: 52,
    justifyContent: 'center',
  },
  btnGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#2D3F55',
  },
  btnText: { color: '#0F1923', fontWeight: '700', fontSize: 16 },
});

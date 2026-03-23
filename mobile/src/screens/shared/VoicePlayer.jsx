import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { X, Volume2 } from 'lucide-react-native';

// expo-av is not available in Expo Go SDK 55+ — safe dynamic import
let Audio = null;
try {
  Audio = require('expo-av').Audio;
} catch (e) {
  console.warn('expo-av not available in this environment');
}

export default function VoicePlayer({ route, navigation }) {
  const { audioUrl, fromName } = route.params;
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const soundRef = useRef(null);
  const waveAnim = useRef(new Animated.Value(1)).current;
  const API_URL = 'http://10.0.2.2:5000';

  useEffect(() => {
    if (Audio) playAudio();  // only attempt if expo-av loaded
    startWaveAnimation();
    return () => { soundRef.current?.unloadAsync?.(); };
  }, []);

  const startWaveAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(waveAnim, { toValue: 1.4, duration: 400, useNativeDriver: true }),
        Animated.timing(waveAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      ])
    ).start();
  };

  const playAudio = async () => {
    if (!Audio) return; // expo-av not available in Expo Go
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        { uri: `${API_URL}${audioUrl}` },
        { shouldPlay: true }
      );
      soundRef.current = sound;
      setIsPlaying(true);

      sound.setOnPlaybackStatusUpdate(status => {
        if (status.isLoaded) {
          setPosition(status.positionMillis || 0);
          setDuration(status.durationMillis || 0);
          if (status.didJustFinish) {
            setIsPlaying(false);
          }
        }
      });
    } catch (err) {
      console.error('Audio playback error:', err);
    }
  };

  const progress = duration > 0 ? position / duration : 0;

  return (
    <View style={styles.container}>
      {/* Waveform animation */}
      <View style={styles.waveContainer}>
        {[0.6, 1, 0.8, 1.2, 0.7, 1, 0.9, 1.1, 0.6, 1].map((h, i) => (
          <Animated.View
            key={i}
            style={[
              styles.waveBar,
              { transform: [{ scaleY: isPlaying ? Animated.multiply(waveAnim, h) : h * 0.3 }] }
            ]}
          />
        ))}
      </View>

      <Volume2 size={48} color="#00C896" />
      <Text style={styles.fromLabel}>Voice Broadcast from</Text>
      <Text style={styles.fromName}>{fromName}</Text>

      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      <Text style={styles.timeText}>
        {Math.round(position / 1000)}s / {Math.round(duration / 1000)}s
      </Text>

      <TouchableOpacity
        style={styles.closeBtn}
        onPress={() => { soundRef.current?.stopAsync(); navigation.goBack(); }}
      >
        <X size={20} color="#8A9BB0" />
        <Text style={styles.closeBtnText}>Close</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1923',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  waveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 80,
    marginBottom: 40,
  },
  waveBar: {
    width: 8,
    height: 40,
    backgroundColor: '#00C896',
    borderRadius: 4,
  },
  fromLabel: { color: '#8A9BB0', fontSize: 14, marginTop: 20 },
  fromName: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginBottom: 32 },
  progressBar: {
    width: '100%',
    height: 4,
    backgroundColor: '#2D3F55',
    borderRadius: 2,
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#00C896', borderRadius: 2 },
  timeText: { color: '#8A9BB0', fontFamily: 'monospace', fontSize: 13, marginBottom: 40 },
  closeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: '#2D3F55',
    minHeight: 52,
  },
  closeBtnText: { color: '#8A9BB0', fontWeight: '600', fontSize: 15 },
});

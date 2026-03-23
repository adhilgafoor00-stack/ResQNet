import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert
} from 'react-native';
import { useAuthStore } from '../../store/useStore';

export default function OTPVerify({ route, navigation }) {
  const { phone } = route.params;
  const [otp, setOtp] = useState('');
  const { verifyOtp, loading, error } = useAuthStore();

  const handleVerify = async () => {
    if (otp.length !== 4) return;
    try {
      await verifyOtp(phone, otp);
      // Navigation handled by App.js role router after auth state updates
    } catch (err) {
      Alert.alert('Invalid OTP', err.message);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.card}>
        <Text style={styles.logo}>ResQNet</Text>
        <Text style={styles.subtitle}>Enter the OTP sent to</Text>
        <Text style={styles.phone}>{phone}</Text>

        <TextInput
          style={styles.otpInput}
          placeholder="1234"
          placeholderTextColor="#4A5568"
          keyboardType="number-pad"
          maxLength={4}
          value={otp}
          onChangeText={setOtp}
          autoFocus
          textAlign="center"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.btn, (otp.length !== 4 || loading) && styles.btnDisabled]}
          onPress={handleVerify}
          disabled={otp.length !== 4 || loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#0F1923" />
            : <Text style={styles.btnText}>Login</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.btnGhost]}
          onPress={() => navigation.goBack()}
        >
          <Text style={[styles.btnText, { color: '#8A9BB0' }]}>Back</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>Demo OTP: 1234</Text>
      </View>
    </KeyboardAvoidingView>
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
  card: {
    backgroundColor: '#1A2535',
    borderRadius: 16,
    padding: 32,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#2D3F55',
    alignItems: 'center',
  },
  logo: {
    fontWeight: '800',
    fontSize: 28,
    color: '#00C896',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#8A9BB0',
  },
  phone: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
    marginBottom: 28,
  },
  otpInput: {
    backgroundColor: '#243044',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2D3F55',
    color: '#FFFFFF',
    fontSize: 32,
    padding: 16,
    width: '100%',
    marginBottom: 20,
    letterSpacing: 12,
  },
  error: {
    color: '#FF4757',
    fontSize: 13,
    marginBottom: 12,
    textAlign: 'center',
  },
  btn: {
    backgroundColor: '#00C896',
    borderRadius: 50,
    padding: 16,
    alignItems: 'center',
    width: '100%',
    minHeight: 52,
    justifyContent: 'center',
    marginBottom: 10,
  },
  btnGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#2D3F55',
  },
  btnDisabled: { opacity: 0.5 },
  btnText: {
    color: '#0F1923',
    fontWeight: '700',
    fontSize: 16,
  },
  hint: {
    fontSize: 12,
    color: '#4A5568',
    marginTop: 8,
  },
});

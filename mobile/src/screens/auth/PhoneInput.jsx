import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert
} from 'react-native';
import { useAuthStore } from '../../store/useStore';

export default function PhoneInput({ navigation }) {
  const [phone, setPhone] = useState('');
  const { requestOtp, loading, error } = useAuthStore();

  const handleNext = async () => {
    if (!phone.trim()) return;
    try {
      await requestOtp(phone.trim());
      navigation.navigate('OTPVerify', { phone: phone.trim() });
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.card}>
        <Text style={styles.logo}>ResQNet</Text>
        <Text style={styles.subtitle}>Emergency Coordination Platform</Text>

        <Text style={styles.label}>Phone Number</Text>
        <TextInput
          style={styles.input}
          placeholder="+91 9000000001"
          placeholderTextColor="#4A5568"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
          autoFocus
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.btn, (!phone || loading) && styles.btnDisabled]}
          onPress={handleNext}
          disabled={!phone || loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#0F1923" />
            : <Text style={styles.btnText}>Send OTP</Text>
          }
        </TouchableOpacity>

        <Text style={styles.hint}>Demo: +919000000001–7 · OTP: 1234</Text>
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
  },
  logo: {
    fontFamily: 'System',
    fontWeight: '800',
    fontSize: 32,
    color: '#00C896',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: '#8A9BB0',
    marginBottom: 32,
  },
  label: {
    fontSize: 13,
    color: '#8A9BB0',
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#243044',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2D3F55',
    color: '#FFFFFF',
    fontSize: 16,
    padding: 14,
    marginBottom: 20,
  },
  error: {
    color: '#FF4757',
    fontSize: 13,
    marginBottom: 12,
  },
  btn: {
    backgroundColor: '#00C896',
    borderRadius: 50,
    padding: 16,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
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
    textAlign: 'center',
    marginTop: 16,
  },
});

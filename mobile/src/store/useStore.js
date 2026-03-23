import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

export const API_URL = 'http://10.24.95.131:5000'; // Android emulator localhost; change for physical device

export const api = axios.create({ baseURL: API_URL });

// Attach token to every request — prefer in-memory store, fallback to AsyncStorage
api.interceptors.request.use(async (config) => {
  // Try in-memory first (instant, avoids async race condition)
  const storeToken = useAuthStore.getState?.()?.token;
  if (storeToken) {
    config.headers.Authorization = `Bearer ${storeToken}`;
    return config;
  }
  // Fallback to persisted token
  const token = await AsyncStorage.getItem('resqnet_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const useAuthStore = create((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  loading: false,
  error: null,

  /** Load persisted session from AsyncStorage on app start */
  hydrate: async () => {
    try {
      const token = await AsyncStorage.getItem('resqnet_token');
      const userStr = await AsyncStorage.getItem('resqnet_user');
      if (token && userStr) {
        set({ token, user: JSON.parse(userStr), isAuthenticated: true });
      }
    } catch (e) { console.error('Hydrate error:', e); }
  },

  requestOtp: async (phone) => {
    set({ loading: true, error: null });
    try {
      await api.post('/api/auth/request-otp', { phone });
      set({ loading: false });
    } catch (err) {
      const isNetworkErr = !err.response;
      const msg = isNetworkErr
        ? `Cannot connect to server (${API_URL}). Check your network or backend is running.`
        : (err.response?.data?.error || 'Failed to send OTP');
      set({ loading: false, error: msg });
      throw new Error(msg);
    }
  },

  verifyOtp: async (phone, otp) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post('/api/auth/verify-otp', { phone, otp });
      const { token, user } = res.data;
      await AsyncStorage.setItem('resqnet_token', token);
      await AsyncStorage.setItem('resqnet_user', JSON.stringify(user));
      set({ token, user, isAuthenticated: true, loading: false });
      return user;
    } catch (err) {
      const isNetworkErr = !err.response;
      const msg = isNetworkErr
        ? `Cannot reach server. Check your network.`
        : (err.response?.data?.error || 'Invalid OTP');
      set({ loading: false, error: msg });
      throw new Error(msg);
    }
  },

  logout: async () => {
    await AsyncStorage.multiRemove(['resqnet_token', 'resqnet_user']);
    set({ user: null, token: null, isAuthenticated: false });
  }
}));

export const useSosStore = create((set, get) => ({
  offlineQueue: [], // SOS reports queued when offline
  lastSosId: null,
  sosState: null, // 'sending' | 'sent' | 'queued' | 'error'

  submitSos: async (location, status) => {
    set({ sosState: 'sending' });
    const payload = { location, status };

    try {
      const res = await api.post('/api/sos', payload);
      set({ lastSosId: res.data.sos._id, sosState: 'sent' });
    } catch (err) {
      // Queue for offline sync
      const queue = get().offlineQueue;
      const item = { ...payload, timestamp: Date.now() };
      const newQueue = [...queue, item];
      set({ offlineQueue: newQueue, sosState: 'queued' });

      // Persist queue
      try {
        await AsyncStorage.setItem('resqnet_sos_queue', JSON.stringify(newQueue));
      } catch (e) { console.error('Queue persist error:', e); }
    }
  },

  /** Flush offline queue when connection restored */
  flushQueue: async () => {
    const queue = get().offlineQueue;
    if (queue.length === 0) return;

    const remaining = [];
    for (const item of queue) {
      try {
        await api.post('/api/sos', { ...item, source: 'offline_sync' });
      } catch {
        remaining.push(item);
      }
    }

    set({ offlineQueue: remaining });
    await AsyncStorage.setItem('resqnet_sos_queue', JSON.stringify(remaining));
  },

  loadQueue: async () => {
    try {
      const str = await AsyncStorage.getItem('resqnet_sos_queue');
      if (str) set({ offlineQueue: JSON.parse(str) });
    } catch (e) { console.error('Load queue error:', e); }
  }
}));

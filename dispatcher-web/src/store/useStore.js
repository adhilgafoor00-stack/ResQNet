import { create } from 'zustand';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const api = axios.create({ baseURL: API_URL });

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('resqnet_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const useAuthStore = create((set) => ({
  user: JSON.parse(localStorage.getItem('resqnet_user') || 'null'),
  token: localStorage.getItem('resqnet_token') || null,
  isAuthenticated: !!localStorage.getItem('resqnet_token'),
  loading: false,
  error: null,

  requestOtp: async (phone) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post('/api/auth/request-otp', { phone });
      set({ loading: false });
      return res.data;
    } catch (err) {
      set({ loading: false, error: err.response?.data?.error || 'Failed to send OTP' });
      throw err;
    }
  },

  verifyOtp: async (phone, otp) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post('/api/auth/verify-otp', { phone, otp });
      const { token, user } = res.data;
      localStorage.setItem('resqnet_token', token);
      localStorage.setItem('resqnet_user', JSON.stringify(user));
      set({ user, token, isAuthenticated: true, loading: false });
      return res.data;
    } catch (err) {
      set({ loading: false, error: err.response?.data?.error || 'Invalid OTP' });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem('resqnet_token');
    localStorage.removeItem('resqnet_user');
    set({ user: null, token: null, isAuthenticated: false });
  }
}));

export const useMapStore = create((set, get) => ({
  sosList: [],
  vehicles: [],
  trafficBlocks: [],
  stats: null,
  selectedSos: null,
  communityMembers: [],

  fetchActiveSos: async () => {
    try {
      const res = await api.get('/api/sos/active');
      set({ sosList: res.data.sosList });
    } catch (err) { console.error('Fetch SOS error:', err); }
  },

  fetchActiveVehicles: async () => {
    try {
      const res = await api.get('/api/vehicles/active');
      set({ vehicles: res.data.vehicles });
    } catch (err) { console.error('Fetch vehicles error:', err); }
  },

  fetchTrafficBlocks: async () => {
    try {
      const res = await api.get('/api/traffic/active');
      set({ trafficBlocks: res.data.blocks });
    } catch (err) { console.error('Fetch traffic error:', err); }
  },

  fetchStats: async () => {
    try {
      const res = await api.get('/api/admin/stats');
      set({ stats: res.data.stats });
    } catch (err) { console.error('Fetch stats error:', err); }
  },

  setSelectedSos: (sos) => set({ selectedSos: sos }),

  resolveSos: async (sosId) => {
    try {
      await api.patch(`/api/sos/${sosId}/resolve`);
      get().fetchActiveSos();
    } catch (err) { console.error('Resolve SOS error:', err); }
  },

  markFalseAlarm: async (sosId) => {
    try {
      await api.patch(`/api/sos/${sosId}/false-alarm`);
      get().fetchActiveSos();
    } catch (err) { console.error('False alarm error:', err); }
  },

  dispatchVehicle: async (vehicleId, destination, sosId) => {
    try {
      await api.post('/api/dispatch', { vehicleId, destination, sosId });
      get().fetchActiveVehicles();
      get().fetchActiveSos();
    } catch (err) { console.error('Dispatch error:', err); }
  },

  placeTrafficBlock: async (lat, lng, radius, reason) => {
    try {
      await api.post('/api/traffic/block', { lat, lng, radius: radius || 200, reason: reason || 'manual' });
      get().fetchTrafficBlocks();
    } catch (err) { console.error('Place block error:', err); }
  },

  removeTrafficBlock: async (blockId) => {
    try {
      await api.delete(`/api/traffic/block/${blockId}`);
      get().fetchTrafficBlocks();
    } catch (err) { console.error('Remove block error:', err); }
  },

  // Socket event handlers
  handleSosNew: (data) => {
    set((state) => ({ sosList: [data.sos, ...state.sosList] }));
  },
  handleSosUpdated: (data) => {
    set((state) => ({
      sosList: state.sosList.map(s =>
        s._id === data.sosId ? { ...s, state: data.state } : s
      ).filter(s => !['resolved', 'false_alarm'].includes(s.state))
    }));
  },
  handleVehicleActive: (data) => {
    set((state) => {
      const exists = state.vehicles.find(v => v._id === data.vehicle._id);
      if (exists) {
        return { vehicles: state.vehicles.map(v => v._id === data.vehicle._id ? data.vehicle : v) };
      }
      return { vehicles: [...state.vehicles, data.vehicle] };
    });
  },
  handleVehicleMoved: (data) => {
    set((state) => ({
      vehicles: state.vehicles.map(v =>
        v._id === data.vehicleId ? { ...v, location: { lat: data.lat, lng: data.lng } } : v
      )
    }));
  },
  handleTrafficBlock: (data) => {
    set((state) => ({ trafficBlocks: [...state.trafficBlocks, data.block] }));
  },
  handleTrafficClear: (data) => {
    set((state) => ({
      trafficBlocks: state.trafficBlocks.filter(b => b._id !== data.blockId)
    }));
  }
}));

export { api };

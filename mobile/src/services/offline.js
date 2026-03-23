import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useSosStore } from '../store/useStore';

/**
 * Offline queue service
 * - Queues failed requests to AsyncStorage
 * - Listens for network reconnect via NetInfo
 * - Auto-flushes queue in order on reconnect
 */

let unsubscribeNetInfo = null;

export function startOfflineSync() {
  // Load any persisted queue from a previous session
  useSosStore.getState().loadQueue();

  // Listen for connectivity restored — flush queue
  unsubscribeNetInfo = NetInfo.addEventListener(state => {
    if (state.isConnected && state.isInternetReachable) {
      console.log('[Offline] Network restored — flushing queue');
      useSosStore.getState().flushQueue();
    }
  });
}

export function stopOfflineSync() {
  unsubscribeNetInfo?.();
}

/**
 * SMS fallback — opens native SMS with pre-filled SOS message
 * Used when ZERO connectivity (no data at all)
 */
export function smsFallback(userName, lat, lng, status = 'TRAPPED') {
  const { Linking } = require('react-native');
  const phone = '+918086100100'; // Kerala Emergency
  const body = `SOS ${status.toUpperCase()} ${lat},${lng} ${userName}`;
  const url = `sms:${phone}?body=${encodeURIComponent(body)}`;
  Linking.openURL(url).catch(err => console.error('SMS fallback error:', err));
}

import { io } from 'socket.io-client';
import { API_URL } from '../store/useStore';

let socket = null;

export function connectSocket(userId) {
  if (socket?.connected) return socket;

  socket = io(API_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
  });

  socket.on('connect', () => {
    console.log('[Socket] Mobile connected:', socket.id);
    socket.emit('register', { userId });
  });

  socket.on('disconnect', () => {
    console.log('[Socket] Mobile disconnected');
  });

  socket.on('connect_error', (err) => {
    console.warn('[Socket] Mobile connection error:', err.message);
  });

  return socket;
}

export function listenToEvents(handlers) {
  if (!socket) return;

  // Server → client events per spec
  socket.on('vehicle:active', handlers.onVehicleActive || (() => {})); // vehicle:active
  socket.on('vehicle:moved', handlers.onVehicleMoved || (() => {}));   // vehicle:moved
  socket.on('vehicle:arrived', handlers.onVehicleArrived || (() => {})); // vehicle:arrived
  socket.on('alert:community', handlers.onCommunityAlert || (() => {})); // alert:community — 500m alert
  socket.on('broadcast:voice', handlers.onVoiceBroadcast || (() => {})); // broadcast:voice — play audio
  socket.on('traffic:block', handlers.onTrafficBlock || (() => {}));     // traffic:block
  socket.on('traffic:clear', handlers.onTrafficClear || (() => {}));     // traffic:clear
}

export function emitDriverLocation(lat, lng) {
  if (socket?.connected) {
    socket.emit('driver:location', { lat, lng }); // driver:location — every 3 seconds
  }
}

export function emitCommunityPosition(lat, lng) {
  if (socket?.connected) {
    socket.emit('community:position', { lat, lng }); // community:position
  }
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

export function getSocket() { return socket; }

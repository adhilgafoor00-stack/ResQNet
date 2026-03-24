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
  socket.on('vehicle:active', handlers.onVehicleActive || (() => {}));
  socket.on('vehicle:moved', handlers.onVehicleMoved || (() => {}));
  socket.on('vehicle:arrived', handlers.onVehicleArrived || (() => {}));
  socket.on('alert:community', handlers.onCommunityAlert || (() => {}));
  socket.on('broadcast:voice', handlers.onVoiceBroadcast || (() => {}));
  socket.on('traffic:block', handlers.onTrafficBlock || (() => {}));
  socket.on('traffic:clear', handlers.onTrafficClear || (() => {}));
  socket.on('police:alerted', handlers.onPoliceAlerted || (() => {}));
  // Disaster response events
  socket.on('disaster:enroute', handlers.onDisasterEnroute || (() => {}));
  socket.on('disaster:arrived', handlers.onDisasterArrived || (() => {}));
  socket.on('disaster:community_alert', handlers.onDisasterCommunityAlert || (() => {}));
  socket.on('disaster:community_alert_broadcast', handlers.onDisasterCommunityAlert || (() => {}));
  socket.on('disaster:team_assigned', handlers.onDisasterTeamAssigned || (() => {}));
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

export function emitArrived(lat, lng) {
  if (socket?.connected) {
    socket.emit('vehicle:arrived', { lat, lng });
  }
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

export function getSocket() { return socket; }

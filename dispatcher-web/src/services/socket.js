import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

let socket = null;

export function connectSocket(userId, handlers) {
  if (socket?.connected) return socket;

  socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket.id);
    // Register user on socket
    socket.emit('register', { userId });
  });

  // Register all event listeners per spec
  socket.on('sos:new', handlers.handleSosNew);
  socket.on('sos:updated', handlers.handleSosUpdated);
  socket.on('vehicle:active', handlers.handleVehicleActive);
  socket.on('vehicle:moved', handlers.handleVehicleMoved);
  socket.on('vehicle:arrived', handlers.handleVehicleArrived || (() => {}));
  socket.on('traffic:block', handlers.handleTrafficBlock);
  socket.on('traffic:clear', handlers.handleTrafficClear);
  socket.on('broadcast:voice', handlers.handleVoiceBroadcast || (() => {}));
  socket.on('police:alerted', handlers.handlePoliceAlerted || (() => {}));
  // Disaster events — always registered so DisasterPanel can use getSocket() safely
  socket.on('disaster:created', handlers.handleDisasterCreated || (() => {}));
  socket.on('disaster:team_assigned', handlers.handleDisasterAssigned || (() => {}));
  socket.on('disaster:enroute', handlers.handleDisasterEnroute || (() => {}));
  socket.on('disaster:arrived', handlers.handleDisasterArrived || (() => {}));

  socket.on('disconnect', () => {
    console.log('[Socket] Disconnected');
  });

  socket.on('connect_error', (err) => {
    console.warn('[Socket] Connection error:', err.message);
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket() {
  return socket;
}

export function emitPoliceAlert(alertedBy) {
  if (socket) {
    socket.emit('police:alert', { alertedBy });
  }
}

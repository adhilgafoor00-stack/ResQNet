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
  socket.on('sos:new', handlers.handleSosNew);             // sos:new — new SOS
  socket.on('sos:updated', handlers.handleSosUpdated);       // sos:updated — status change
  socket.on('vehicle:active', handlers.handleVehicleActive); // vehicle:active — driver goes active
  socket.on('vehicle:moved', handlers.handleVehicleMoved);   // vehicle:moved — GPS update
  socket.on('vehicle:arrived', handlers.handleVehicleArrived || (() => {})); // vehicle:arrived
  socket.on('traffic:block', handlers.handleTrafficBlock);   // traffic:block — new red zone
  socket.on('traffic:clear', handlers.handleTrafficClear);   // traffic:clear — block removed
  socket.on('broadcast:voice', handlers.handleVoiceBroadcast || (() => {})); // broadcast:voice

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

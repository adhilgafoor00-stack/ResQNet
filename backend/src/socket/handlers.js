const Vehicle = require('../models/Vehicle');
const User = require('../models/User');
const SOS = require('../models/SOS');

// Track connected users: { socketId: userId }
const connectedUsers = new Map();

/**
 * Register all Socket.io event handlers
 * Event names match the spec exactly
 */
function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Store user association if provided on connect
    socket.on('register', (data) => {
      if (data && data.userId) {
        connectedUsers.set(socket.id, data.userId);
        console.log(`[Socket] User ${data.userId} registered on socket ${socket.id}`);
      }
    });

    /**
     * 'driver:location' — GPS update every 3 seconds from driver
     * Payload: { lat, lng }
     * Broadcasts: 'vehicle:moved' to all other clients
     */
    socket.on('driver:location', async (data) => {
      try {
        const { lat, lng } = data;
        const userId = connectedUsers.get(socket.id);
        if (!userId) return;

        // Update vehicle location in DB
        const vehicle = await Vehicle.findOne({ driverId: userId });
        if (vehicle) {
          const wasIdle = vehicle.status === 'idle';
          vehicle.location = { lat, lng };
          
          // Auto-activate if driver starts moving/tracking
          if (wasIdle) {
            vehicle.status = 'dispatched'; // or a new 'active' status if preferred
            console.log(`[Socket] Auto-activating vehicle ${vehicle._id} for driver ${userId}`);
          }
          
          await vehicle.save();

          // Update driver user location
          await User.findByIdAndUpdate(userId, {
            location: { lat, lng },
            lastSeen: new Date()
          });

          // Broadcast to all clients
          if (wasIdle) {
            io.emit('vehicle:active', { vehicle });
          }

          socket.broadcast.emit('vehicle:moved', {
            vehicleId: vehicle._id,
            lat,
            lng,
            vehicleType: vehicle.vehicleType
          });
        }
      } catch (error) {
        console.error('[Socket] driver:location error:', error.message);
      }
    });

    /**
     * 'police:alert' — Dispatcher alerts traffic police
     * Broadcasts to all connected drivers
     */
    socket.on('police:alert', (data) => {
      console.log('[Socket] Police alert triggered by:', data.alertedBy);
      io.emit('police:alerted', {
        alertedBy: data.alertedBy,
        timestamp: new Date()
      });
    });

    /**
     * 'volunteer:accept' — Community member accepts SOS
     * Payload: { sosId }
     */
    socket.on('volunteer:accept', async (data) => {
      try {
        const { sosId } = data;
        const userId = connectedUsers.get(socket.id);
        if (!userId || !sosId) return;

        const sos = await SOS.findById(sosId);
        if (sos && !sos.assignedVolunteerId) {
          sos.assignedVolunteerId = userId;
          await sos.save();

          // Notify all clients of update
          io.emit('sos:updated', { sosId: sos._id, state: sos.state }); // sos:updated — volunteer assigned
        }
      } catch (error) {
        console.error('[Socket] volunteer:accept error:', error.message);
      }
    });

    socket.on('vehicle:arrived', async (data) => {
      try {
        const { lat, lng } = data;
        const userId = connectedUsers.get(socket.id);
        if (!userId) return;

        const vehicle = await Vehicle.findOne({ driverId: userId });
        if (vehicle) {
          vehicle.status = 'idle'; // Reset status after arrival
          vehicle.location = { lat, lng };
          await vehicle.save();

          io.emit('vehicle:arrived', { 
            vehicleId: vehicle._id, 
            lat, 
            lng,
            vehicleType: vehicle.vehicleType 
          });
          
          io.emit('alert:community', {
            vehicleType: vehicle.vehicleType,
            alertLevel: 'arrived',
            lat,
            lng,
            message: `✅ Emergency vehicle has arrived at destination`
          });
        }
      } catch (err) {
        console.error('[Socket] vehicle:arrived error:', err.message);
      }
    });

    /**
     * 'community:position' — Community member updates position
     * Payload: { lat, lng }
     */
    socket.on('community:position', async (data) => {
      try {
        const { lat, lng } = data;
        const userId = connectedUsers.get(socket.id);
        if (!userId) return;

        await User.findByIdAndUpdate(userId, {
          location: { lat, lng },
          lastSeen: new Date()
        });
      } catch (error) {
        console.error('[Socket] community:position error:', error.message);
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      const userId = connectedUsers.get(socket.id);
      connectedUsers.delete(socket.id);
      console.log(`[Socket] Client disconnected: ${socket.id}${userId ? ` (user: ${userId})` : ''}`);
    });
  });
}

module.exports = { registerSocketHandlers, connectedUsers };

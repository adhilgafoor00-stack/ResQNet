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
          vehicle.location = { lat, lng };
          await vehicle.save();

          // Update driver user location
          await User.findByIdAndUpdate(userId, {
            location: { lat, lng },
            lastSeen: new Date()
          });

          // Broadcast to all clients: vehicle:moved — GPS update
          socket.broadcast.emit('vehicle:moved', {
            vehicleId: vehicle._id,
            lat,
            lng
          });
        }
      } catch (error) {
        console.error('[Socket] driver:location error:', error.message);
      }
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

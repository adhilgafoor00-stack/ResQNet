const express = require('express');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');
const auth = require('../middleware/auth');
const router = express.Router();

/**
 * POST /api/vehicles/active — Driver goes active
 * Creates or updates active vehicle session
 * Emits socket event 'vehicle:active'
 */
router.post('/active', auth, async (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ success: false, error: 'Only drivers can activate vehicles' });
    }

    // Check if already active
    let vehicle = await Vehicle.findOne({ driverId: req.user._id, status: { $ne: 'returning' } });

    if (vehicle) {
      vehicle.status = 'idle';
      vehicle.location = req.body.location || req.user.location;
      await vehicle.save();
    } else {
      vehicle = await Vehicle.create({
        driverId: req.user._id,
        vehicleType: req.user.vehicleType,
        vehicleNumber: req.user.vehicleNumber || 'Unknown',
        location: req.body.location || { lat: 11.2588, lng: 75.7804 }, // Default: Kozhikode
        status: 'idle'
      });
    }

    // Mark user as active
    req.user.isActive = true;
    req.user.lastSeen = new Date();
    await req.user.save();

    // Emit 'vehicle:active' socket event
    const io = req.app.get('io');
    if (io) {
      io.emit('vehicle:active', { vehicle }); // vehicle:active — driver goes active
    }

    res.json({ success: true, vehicle });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/vehicles/:id/location — GPS update
 * Emits socket event 'vehicle:moved'
 */
router.patch('/:id/location', auth, async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (lat == null || lng == null) {
      return res.status(400).json({ success: false, error: 'lat and lng are required' });
    }

    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) {
      return res.status(404).json({ success: false, error: 'Vehicle not found' });
    }

    vehicle.location = { lat, lng };
    await vehicle.save();

    // Also update driver user location
    await User.findByIdAndUpdate(vehicle.driverId, { location: { lat, lng }, lastSeen: new Date() });

    // Emit 'vehicle:moved' socket event
    const io = req.app.get('io');
    if (io) {
      io.emit('vehicle:moved', { vehicleId: vehicle._id, lat, lng }); // vehicle:moved — GPS update
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/vehicles/:id/arrived — Driver arrived
 * Emits socket event 'vehicle:arrived'
 */
router.patch('/:id/arrived', auth, async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) {
      return res.status(404).json({ success: false, error: 'Vehicle not found' });
    }

    vehicle.status = 'arrived';
    vehicle.arrivedAt = new Date();
    await vehicle.save();

    // Emit 'vehicle:arrived' socket event
    const io = req.app.get('io');
    if (io) {
      io.emit('vehicle:arrived', { vehicleId: vehicle._id, sosId: vehicle.linkedSosId }); // vehicle:arrived — driver arrived
    }

    res.json({ success: true, vehicle });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/vehicles/active — All live vehicles
 */
router.get('/active', auth, async (req, res) => {
  try {
    const vehicles = await Vehicle.find({
      status: { $in: ['idle', 'dispatched'] }
    }).populate('driverId', 'name phone');

    res.json({ success: true, vehicles });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

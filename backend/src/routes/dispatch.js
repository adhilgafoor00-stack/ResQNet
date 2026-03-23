const express = require('express');
const Vehicle = require('../models/Vehicle');
const SOS = require('../models/SOS');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { startVehicleSimulation } = require('../socket/simulation');
const router = express.Router();

/**
 * POST /api/dispatch — Dispatcher assigns vehicle to destination
 * Updates vehicle status, links to SOS, alerts community within 500m
 * Emits: vehicle:active (updated), sos:updated, alert:community
 */
router.post('/', auth, async (req, res) => {
  try {
    if (req.user.role !== 'dispatcher') {
      return res.status(403).json({ success: false, error: 'Only dispatchers can dispatch vehicles' });
    }

    const { vehicleId, destination, sosId } = req.body;

    if (!vehicleId || !destination || !destination.lat || !destination.lng) {
      return res.status(400).json({ success: false, error: 'vehicleId and destination (lat, lng) are required' });
    }

    // Update vehicle
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      return res.status(404).json({ success: false, error: 'Vehicle not found' });
    }

    vehicle.status = 'dispatched';
    vehicle.destination = destination;
    vehicle.linkedSosId = sosId || null;
    vehicle.dispatchedAt = new Date();
    vehicle.arrivedAt = null;
    await vehicle.save();

    // Update SOS state if linked
    if (sosId) {
      const sos = await SOS.findById(sosId);
      if (sos) {
        sos.state = 'dispatched';
        sos.assignedVehicleId = vehicle._id;
        await sos.save();

        const io = req.app.get('io');
        if (io) {
          io.emit('sos:updated', { sosId: sos._id, state: 'dispatched' }); // sos:updated — status change
        }
      }
    }

    const io = req.app.get('io');
    if (io) {
      // Notify all clients of vehicle active / dispatch
      io.emit('vehicle:active', { vehicle });

      // ── Live movement simulation ──────────────────────────────────────────
      // Pick start position: use vehicle's current GPS if available,
      // otherwise default to 15 km north of the destination so the demo
      // passes through both the 10 km and 5 km notification thresholds.
      const KM_PER_DEG_LAT = 111.32; // approx
      const startLat = vehicle.location?.lat  ?? (destination.lat + 15 / KM_PER_DEG_LAT);
      const startLng = vehicle.location?.lng  ?? destination.lng;

      // Save that starting position immediately so the map marker appears
      vehicle.location = { lat: startLat, lng: startLng };
      await vehicle.save();
      io.emit('vehicle:moved', { vehicleId: vehicle._id, lat: startLat, lng: startLng, vehicleType: vehicle.vehicleType });

      startVehicleSimulation(
        io,
        vehicle._id,
        startLat,
        startLng,
        destination.lat,
        destination.lng,
        vehicle.vehicleType
      );
    }

    res.json({ success: true, vehicle });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Haversine distance in metres between two GPS points
 */
function getDistanceMetres(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in metres
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

module.exports = router;

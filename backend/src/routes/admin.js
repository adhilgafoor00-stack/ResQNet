const express = require('express');
const SOS = require('../models/SOS');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');
const auth = require('../middleware/auth');
const router = express.Router();

/**
 * GET /api/admin/stats — Dashboard stats
 * Total SOS today, resolved, avg response time, active vehicles
 */
router.get('/stats', auth, async (req, res) => {
  try {
    if (req.user.role !== 'dispatcher') {
      return res.status(403).json({ success: false, error: 'Dispatcher access only' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalSosToday, resolvedToday, activeVehicles, avgResponseTime] = await Promise.all([
      SOS.countDocuments({ createdAt: { $gte: today } }),
      SOS.countDocuments({ state: 'resolved', resolvedAt: { $gte: today } }),
      Vehicle.countDocuments({ status: { $in: ['idle', 'dispatched'] } }),
      SOS.aggregate([
        { $match: { state: 'resolved', responseTimeSeconds: { $ne: null } } },
        { $group: { _id: null, avgTime: { $avg: '$responseTimeSeconds' } } }
      ])
    ]);

    res.json({
      success: true,
      stats: {
        totalSosToday,
        resolvedToday,
        activeVehicles,
        avgResponseTimeSeconds: avgResponseTime[0]?.avgTime || 0,
        pendingSos: await SOS.countDocuments({ state: 'pending' })
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/community — List all community members
 */
router.get('/community', auth, async (req, res) => {
  try {
    if (req.user.role !== 'dispatcher') {
      return res.status(403).json({ success: false, error: 'Dispatcher access only' });
    }
    const members = await User.find({ role: 'community' })
      .select('name phone location isActive lastSeen');
    res.json({ success: true, members });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/community/near-route — Count members near a route
 * Query: fromLat, fromLng, toLat, toLng
 */
router.get('/community/near-route', auth, async (req, res) => {
  try {
    const { fromLat, fromLng, toLat, toLng } = req.query;
    if (!fromLat || !fromLng || !toLat || !toLng) {
      return res.status(400).json({ error: 'Missing coordinates' });
    }

    // Simple corridor algorithm: distance to line segment
    const members = await User.find({ role: 'community', 'location.lat': { $ne: null } });
    
    function distToSegment(p, a, b) {
      const x = p.lng, y = p.lat;
      const x1 = parseFloat(a.lng), y1 = parseFloat(a.lat);
      const x2 = parseFloat(b.lng), y2 = parseFloat(b.lat);
      
      const A = x - x1, B = y - y1, C = x2 - x1, D = y2 - y1;
      const dot = A * C + B * D;
      const len_sq = C * C + D * D;
      let param = -1;
      if (len_sq !== 0) param = dot / len_sq;

      let xx, yy;
      if (param < 0) {
        xx = x1; yy = y1;
      } else if (param > 1) {
        xx = x2; yy = y2;
      } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
      }

      const dx = x - xx, dy = y - yy;
      return Math.sqrt(dx * dx + dy * dy); // roughly in degrees
    }

    const BUFFER_DEG = 0.005; // approx 500m
    const nearMembers = members.filter(m => {
      const d = distToSegment(m.location, { lat: fromLat, lng: fromLng }, { lat: toLat, lng: toLng });
      return d <= BUFFER_DEG;
    });

    res.json({ success: true, count: nearMembers.length, members: nearMembers });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/admin/community/:id/location — Update member location
 */
router.patch('/community/:id/location', auth, async (req, res) => {
  try {
    if (req.user.role !== 'dispatcher') {
      return res.status(403).json({ success: false, error: 'Dispatcher access only' });
    }
    const { lat, lng } = req.body;
    await User.findByIdAndUpdate(req.params.id, {
      location: { lat, lng }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

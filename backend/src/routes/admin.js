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
 * GET /api/admin/users/flagged — Flagged accounts (3+ false alerts)
 */
router.get('/users/flagged', auth, async (req, res) => {
  try {
    if (req.user.role !== 'dispatcher') {
      return res.status(403).json({ success: false, error: 'Dispatcher access only' });
    }

    const flaggedUsers = await User.find({ isFlagged: true })
      .select('name phone falseAlertCount lastSeen')
      .sort({ falseAlertCount: -1 });

    res.json({ success: true, users: flaggedUsers });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

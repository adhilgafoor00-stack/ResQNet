const express = require('express');
const SOS = require('../models/SOS');
const User = require('../models/User');
const auth = require('../middleware/auth');
const router = express.Router();

/**
 * POST /api/sos — Create SOS report
 * Auto-assigns priority: trapped=1, injured=2, safe=3
 * Emits socket event 'sos:new'
 */
router.post('/', auth, async (req, res) => {
  try {
    const { location, status, source } = req.body;

    if (!location || !location.lat || !location.lng) {
      return res.status(400).json({ success: false, error: 'Location (lat, lng) is required' });
    }

    if (!status || !['safe', 'injured', 'trapped'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Valid status (safe/injured/trapped) is required' });
    }

    // Auto-assign priority based on status
    const priorityMap = { trapped: 1, injured: 2, safe: 3 };

    const sos = await SOS.create({
      citizenId: req.user._id,
      citizenName: req.user.name,
      citizenPhone: req.user.phone,
      location,
      status,
      priority: priorityMap[status],
      source: source || 'app',
      state: 'pending'
    });

    // Emit 'sos:new' socket event to all connected clients
    const io = req.app.get('io');
    if (io) {
      io.emit('sos:new', { sos }); // sos:new — new SOS appears on map
    }

    res.status(201).json({ success: true, sos });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/sos/active — All unresolved SOS reports
 */
router.get('/active', auth, async (req, res) => {
  try {
    const sosList = await SOS.find({
      state: { $in: ['pending', 'dispatched'] }
    }).sort({ priority: 1, createdAt: -1 });

    res.json({ success: true, sosList });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/sos/:id/resolve — Mark SOS as resolved
 * Emits socket event 'sos:updated'
 */
router.patch('/:id/resolve', auth, async (req, res) => {
  try {
    const sos = await SOS.findById(req.params.id);
    if (!sos) {
      return res.status(404).json({ success: false, error: 'SOS not found' });
    }

    sos.state = 'resolved';
    sos.resolvedAt = new Date();
    sos.responseTimeSeconds = Math.round((sos.resolvedAt - sos.createdAt) / 1000);
    await sos.save();

    // Emit 'sos:updated' socket event
    const io = req.app.get('io');
    if (io) {
      io.emit('sos:updated', { sosId: sos._id, state: 'resolved' }); // sos:updated — status change
    }

    res.json({ success: true, sos });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/sos/:id/false-alarm — Mark SOS as false alarm
 * Increments falseAlertCount on user, flags if >= 3
 */
router.patch('/:id/false-alarm', auth, async (req, res) => {
  try {
    const sos = await SOS.findById(req.params.id);
    if (!sos) {
      return res.status(404).json({ success: false, error: 'SOS not found' });
    }

    sos.state = 'false_alarm';
    sos.resolvedAt = new Date();
    await sos.save();

    // Increment false alert count on the citizen
    const citizen = await User.findById(sos.citizenId);
    if (citizen) {
      citizen.falseAlertCount += 1;
      if (citizen.falseAlertCount >= 3) {
        citizen.isFlagged = true;
      }
      await citizen.save();
    }

    // Emit 'sos:updated' socket event
    const io = req.app.get('io');
    if (io) {
      io.emit('sos:updated', { sosId: sos._id, state: 'false_alarm' }); // sos:updated — status change
    }

    res.json({ success: true, sos });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

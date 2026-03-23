const express = require('express');
const TrafficBlock = require('../models/TrafficBlock');
const auth = require('../middleware/auth');
const router = express.Router();

/**
 * POST /api/traffic/block — Place traffic block
 * Emits socket event 'traffic:block'
 */
router.post('/block', auth, async (req, res) => {
  try {
    const { lat, lng, radius, severity, reason } = req.body;

    if (lat == null || lng == null) {
      return res.status(400).json({ success: false, error: 'lat and lng are required' });
    }

    const block = await TrafficBlock.create({
      lat,
      lng,
      radius: radius || 200,
      severity: severity || 'high',
      reason: reason || 'manual',
      reportedBy: req.user._id,
      isActive: true
    });

    // Emit 'traffic:block' socket event
    const io = req.app.get('io');
    if (io) {
      io.emit('traffic:block', { block }); // traffic:block — new red zone
    }

    res.status(201).json({ success: true, block });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/traffic/block/:id — Remove traffic block
 * Emits socket event 'traffic:clear'
 */
router.delete('/block/:id', auth, async (req, res) => {
  try {
    const block = await TrafficBlock.findById(req.params.id);
    if (!block) {
      return res.status(404).json({ success: false, error: 'Traffic block not found' });
    }

    block.isActive = false;
    block.clearedAt = new Date();
    await block.save();

    // Emit 'traffic:clear' socket event
    const io = req.app.get('io');
    if (io) {
      io.emit('traffic:clear', { blockId: block._id }); // traffic:clear — block removed
    }

    res.json({ success: true, message: 'Traffic block cleared' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/traffic/active — All active blocks
 */
router.get('/active', auth, async (req, res) => {
  try {
    const blocks = await TrafficBlock.find({ isActive: true }).sort({ createdAt: -1 });
    res.json({ success: true, blocks });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

const express = require('express');
const multer = require('multer');
const path = require('path');
const VoiceBroadcast = require('../models/VoiceBroadcast');
const User = require('../models/User');
const auth = require('../middleware/auth');
const router = express.Router();

// Multer config for voice file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads'));
  },
  filename: (req, file, cb) => {
    cb(null, `voice_${Date.now()}_${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'), false);
    }
  }
});

/**
 * POST /api/broadcast/voice — Upload + broadcast voice message
 * Emits socket event 'broadcast:voice'
 */
router.post('/voice', auth, upload.single('audio'), async (req, res) => {
  try {
    if (req.user.role !== 'dispatcher') {
      return res.status(403).json({ success: false, error: 'Only dispatchers can broadcast' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Audio file is required' });
    }

    const { lat, lng, radius, duration } = req.body;

    const audioUrl = `/uploads/${req.file.filename}`;

    const broadcast = await VoiceBroadcast.create({
      dispatcherId: req.user._id,
      audioUrl,
      duration: duration || 0,
      targetZone: {
        lat: lat || 11.2588,
        lng: lng || 75.7804,
        radius: radius || 5000
      }
    });

    // Emit 'broadcast:voice' socket event to all active responders
    const io = req.app.get('io');
    if (io) {
      io.emit('broadcast:voice', { // broadcast:voice — play audio
        audioUrl,
        fromName: req.user.name,
        broadcastId: broadcast._id
      });
    }

    res.status(201).json({ success: true, broadcast });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

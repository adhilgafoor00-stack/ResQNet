const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();

/**
 * POST /api/auth/request-otp
 * In DEMO_MODE, always returns success (no SMS sent)
 */
router.post('/request-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, error: 'Phone number is required' });
    }

    // Check if user exists in DB
    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not registered. Contact admin.' });
    }

    // In demo mode: no actual SMS, OTP is always 1234
    if (process.env.DEMO_MODE === 'true') {
      return res.json({ success: true, message: 'OTP sent (demo: 1234)' });
    }

    // Production: integrate SMS provider here
    res.json({ success: true, message: 'OTP sent to your phone' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/auth/verify-otp
 * Validates OTP (1234 in demo mode), returns JWT + user
 */
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ success: false, error: 'Phone and OTP are required' });
    }

    // Demo mode: accept 1234
    if (process.env.DEMO_MODE === 'true' && otp !== '1234') {
      return res.status(401).json({ success: false, error: 'Invalid OTP' });
    }

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Generate JWT — 30 day expiry
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Update last seen
    user.lastSeen = new Date();
    await user.save();

    res.json({
      success: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        vehicleType: user.vehicleType,
        vehicleNumber: user.vehicleNumber,
        isActive: user.isActive
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

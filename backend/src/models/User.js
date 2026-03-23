const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  role: {
    type: String,
    enum: ['dispatcher', 'driver', 'community', 'citizen'],
    required: true
  },
  vehicleType: {
    type: String,
    enum: ['ambulance', 'fire', 'rescue', 'police', null],
    default: null
  },
  vehicleNumber: { type: String, default: null },
  location: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null }
  },
  isActive: { type: Boolean, default: false },
  fcmToken: { type: String, default: null },
  falseAlertCount: { type: Number, default: 0 },
  isFlagged: { type: Boolean, default: false },
  lastSeen: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);

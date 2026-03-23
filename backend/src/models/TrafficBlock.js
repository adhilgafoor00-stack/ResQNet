const mongoose = require('mongoose');

const trafficBlockSchema = new mongoose.Schema({
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  radius: { type: Number, required: true }, // metres
  severity: {
    type: String,
    enum: ['high', 'medium'],
    default: 'high'
  },
  reason: {
    type: String,
    enum: ['flood', 'accident', 'crowd', 'manual'],
    default: 'manual'
  },
  reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  clearedAt: { type: Date, default: null }
});

module.exports = mongoose.model('TrafficBlock', trafficBlockSchema);

const mongoose = require('mongoose');

const sosSchema = new mongoose.Schema({
  citizenId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  citizenName: { type: String, required: true },
  citizenPhone: { type: String, required: true },
  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  status: {
    type: String,
    enum: ['safe', 'injured', 'trapped'],
    required: true
  },
  priority: {
    type: Number,
    enum: [1, 2, 3],
    required: true
  },
  state: {
    type: String,
    enum: ['pending', 'dispatched', 'resolved', 'false_alarm'],
    default: 'pending'
  },
  source: {
    type: String,
    enum: ['app', 'sms', 'offline_sync'],
    default: 'app'
  },
  assignedVehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null },
  assignedVolunteerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  resolvedAt: { type: Date, default: null },
  responseTimeSeconds: { type: Number, default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SOS', sosSchema);

const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema({
  driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  vehicleType: {
    type: String,
    enum: ['ambulance', 'fire', 'rescue', 'police'],
    required: true
  },
  vehicleNumber: { type: String, required: true },
  location: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null }
  },
  status: {
    type: String,
    enum: ['idle', 'dispatched', 'arrived', 'returning'],
    default: 'idle'
  },
  destination: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    name: { type: String, default: null }
  },
  currentRoute: [{
    lat: { type: Number },
    lng: { type: Number }
  }],
  linkedSosId: { type: mongoose.Schema.Types.ObjectId, ref: 'SOS', default: null },
  dispatchedAt: { type: Date, default: null },
  arrivedAt: { type: Date, default: null }
});

module.exports = mongoose.model('Vehicle', vehicleSchema);

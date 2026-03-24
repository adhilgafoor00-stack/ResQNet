const mongoose = require('mongoose');

const statusLogSchema = new mongoose.Schema({
  status: { type: String, enum: ['received', 'assigned', 'enroute', 'arrived'], required: true },
  note: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

const disasterSchema = new mongoose.Schema({
  teamName: { type: String, required: true },
  type: {
    type: String,
    enum: ['flood', 'fire', 'medical', 'rescue'],
    required: true
  },
  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    address: { type: String, default: '' }
  },
  destination: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    address: { type: String, default: '' }
  },
  nearestHospital: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    name: { type: String, default: '' },
    type: { type: String, default: '' }
  },
  safetyCamp: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    name: { type: String, default: '' },
    capacity: { type: Number, default: null }
  },
  resourceVehicles: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' }],
  resourceVolunteers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  status: {
    type: String,
    enum: ['received', 'assigned', 'enroute', 'arrived'],
    default: 'received'
  },
  statusLog: [statusLogSchema],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('DisasterEvent', disasterSchema);

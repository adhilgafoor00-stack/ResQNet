const mongoose = require('mongoose');

const ambulanceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  licensePlate: { type: String, required: true },
  currentLat: { type: Number, required: true },
  currentLng: { type: Number, required: true },
  status: { type: String, enum: ['Available', 'Busy'], default: 'Available' },
});

const requestSchema = new mongoose.Schema({
  patientName: { type: String, required: true },
  pickupLat: { type: Number, required: true },
  pickupLng: { type: Number, required: true },
  status: { type: String, enum: ['Pending', 'Accepted', 'Completed'], default: 'Pending' },
  ambulanceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ambulance', default: null },
  createdAt: { type: Date, default: Date.now },
});

const Ambulance = mongoose.model('Ambulance', ambulanceSchema);
const Request = mongoose.model('Request', requestSchema);

module.exports = { Ambulance, Request };

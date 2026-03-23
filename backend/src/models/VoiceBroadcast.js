const mongoose = require('mongoose');

const voiceBroadcastSchema = new mongoose.Schema({
  dispatcherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  audioUrl: { type: String, required: true },
  duration: { type: Number, default: 0 },
  targetZone: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    radius: { type: Number, required: true }
  },
  deliveredTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('VoiceBroadcast', voiceBroadcastSchema);

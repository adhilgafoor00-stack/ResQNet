const express = require('express');
const auth = require('../middleware/auth');
const DisasterEvent = require('../models/DisasterEvent');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');

const router = express.Router();

// Injected by app.js so we can emit socket events
let _io = null;
function setIo(io) { _io = io; }

/**
 * POST /api/disaster — Create new disaster event (SOS received)
 */
router.post('/', auth, async (req, res) => {
  try {
    const { teamName, type, location, destination } = req.body;
    if (!teamName || !type || !location?.lat || !location?.lng) {
      return res.status(400).json({ success: false, error: 'teamName, type and location required' });
    }
    const event = await DisasterEvent.create({
      teamName,
      type,
      location,
      destination: destination || {},
      statusLog: [{ status: 'received', note: 'Disaster SOS created' }],
      createdBy: req.user.userId,
    });
    if (_io) _io.emit('disaster:created', { event });
    res.status(201).json({ success: true, event });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/disaster/active — All active (non-arrived) events
 */
router.get('/active', auth, async (req, res) => {
  try {
    const events = await DisasterEvent.find({ status: { $ne: 'arrived' } })
      .populate('resourceVehicles', 'vehicleType vehicleNumber status location')
      .populate('resourceVolunteers', 'name phone location isActive')
      .sort({ createdAt: -1 });
    res.json({ success: true, events });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/disaster/:id — Single event
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const event = await DisasterEvent.findById(req.params.id)
      .populate('resourceVehicles', 'vehicleType vehicleNumber status location')
      .populate('resourceVolunteers', 'name phone location isActive');
    if (!event) return res.status(404).json({ success: false, error: 'Event not found' });
    res.json({ success: true, event });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /api/disaster/:id/assign — Assign resources
 */
router.patch('/:id/assign', auth, async (req, res) => {
  try {
    const { vehicleIds = [], volunteerIds = [], destination } = req.body;
    const event = await DisasterEvent.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, error: 'Event not found' });

    event.resourceVehicles = vehicleIds;
    event.resourceVolunteers = volunteerIds;
    if (destination?.lat) event.destination = destination;
    event.status = 'assigned';
    event.statusLog.push({ status: 'assigned', note: `${vehicleIds.length} vehicles, ${volunteerIds.length} volunteers assigned` });
    await event.save();

    if (_io) _io.emit('disaster:team_assigned', { eventId: event._id, teamName: event.teamName, vehicleIds, volunteerIds });
    res.json({ success: true, event });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /api/disaster/:id/enroute — Start convoy
 */
router.patch('/:id/enroute', auth, async (req, res) => {
  try {
    const event = await DisasterEvent.findById(req.params.id)
      .populate('resourceVehicles', 'vehicleType vehicleNumber location');
    if (!event) return res.status(404).json({ success: false, error: 'Event not found' });

    event.status = 'enroute';
    event.statusLog.push({ status: 'enroute', note: 'Convoy started' });
    await event.save();

    // Start simulation for each vehicle
    const { startVehicleSimulation } = require('../socket/simulation');
    const destLat = event.destination?.lat || event.location.lat;
    const destLng = event.destination?.lng || event.location.lng;

    for (const v of event.resourceVehicles) {
      const startLat = v.location?.lat || event.location.lat;
      const startLng = v.location?.lng || event.location.lng;
      startVehicleSimulation(
        _io, v._id.toString(), startLat, startLng, destLat, destLng, v.vehicleType,
        event._id.toString() // pass disaster event ID for convoy tracking
      );
    }

    // Alert community members near route
    if (_io) {
      _io.emit('disaster:enroute', {
        eventId: event._id,
        teamName: event.teamName,
        type: event.type,
        origin: event.location,
        destination: event.destination,
      });
    }

    res.json({ success: true, event });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /api/disaster/:id/arrived — Mark arrived
 */
router.patch('/:id/arrived', auth, async (req, res) => {
  try {
    const event = await DisasterEvent.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, error: 'Event not found' });

    event.status = 'arrived';
    event.statusLog.push({ status: 'arrived', note: 'Convoy arrived at destination' });
    await event.save();

    const { stopVehicleSimulation } = require('../socket/simulation');
    for (const vId of event.resourceVehicles) {
      stopVehicleSimulation(vId.toString());
    }

    if (_io) _io.emit('disaster:arrived', { eventId: event._id, teamName: event.teamName });
    res.json({ success: true, event });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = { router, setIo };

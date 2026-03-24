const express = require('express');
const auth = require('../middleware/auth');
const DisasterEvent = require('../models/DisasterEvent');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');
const SAFETY_CAMPS = require('../data/safetyCamps');

const router = express.Router();

// Injected by app.js so we can emit socket events
let _io = null;
function setIo(io) { _io = io; }

// ── Haversine distance (km) ──────────────────────────────────────────────────
function getDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Hospital search helper (reused from route.js logic) ──────────────────────
async function fetchNearbyHospitals(lat, lng, limit = 3) {
  try {
    const query = `[out:json][timeout:10];node["amenity"="hospital"](around:20000,${lat},${lng});out ${limit + 5};`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'ResQNet/1.0 (emergency dispatch app)',
        'Accept': 'application/json'
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal
    });
    clearTimeout(timeout);
    const data = JSON.parse(await res.text());
    const hospitals = data.elements
      .filter(e => e.tags?.name)
      .map(e => ({
        id: `osm-${e.id}`,
        name: e.tags.name,
        lat: e.lat,
        lng: e.lon,
        type: e.tags['healthcare:speciality'] || (e.tags.emergency === 'yes' ? 'Emergency' : 'General'),
        beds: e.tags.capacity || e.tags['beds'] || 'N/A',
        distance: getDistanceKm(lat, lng, e.lat, e.lon)
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);
    return hospitals;
  } catch {
    return [];
  }
}

/**
 * GET /api/disaster/recommendations?lat=&lng=
 * Returns nearest hospitals + safety camps for a given SOS location.
 */
router.get('/recommendations', auth, async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ success: false, error: 'lat and lng required' });

  const latF = parseFloat(lat), lngF = parseFloat(lng);

  // Nearest hospitals (top 3)
  const hospitals = await fetchNearbyHospitals(latF, lngF, 3);

  // Nearest safety camps (top 2)
  const camps = SAFETY_CAMPS
    .map(c => ({ ...c, distance: getDistanceKm(latF, lngF, c.lat, c.lng) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 2);

  res.json({ success: true, hospitals, safetyCamps: camps });
});

/**
 * POST /api/disaster — Create new disaster event (SOS received)
 */
router.post('/', auth, async (req, res) => {
  try {
    const { teamName, type, location, destination, nearestHospital, safetyCamp } = req.body;
    if (!teamName || !type || !location?.lat || !location?.lng) {
      return res.status(400).json({ success: false, error: 'teamName, type and location required' });
    }

    // Auto-fetch recommendations if not provided
    let hospData = nearestHospital || null;
    let campData = safetyCamp || null;
    if (!hospData || !campData) {
      const hospitals = await fetchNearbyHospitals(location.lat, location.lng, 1);
      if (!hospData && hospitals.length > 0) {
        hospData = { lat: hospitals[0].lat, lng: hospitals[0].lng, name: hospitals[0].name, type: hospitals[0].type };
      }
      if (!campData) {
        const camps = SAFETY_CAMPS
          .map(c => ({ ...c, distance: getDistanceKm(location.lat, location.lng, c.lat, c.lng) }))
          .sort((a, b) => a.distance - b.distance);
        if (camps.length > 0) {
          campData = { lat: camps[0].lat, lng: camps[0].lng, name: camps[0].name, capacity: camps[0].capacity };
        }
      }
    }

    const event = await DisasterEvent.create({
      teamName,
      type,
      location,
      destination: destination || {},
      nearestHospital: hospData || {},
      safetyCamp: campData || {},
      statusLog: [{ status: 'received', note: 'Disaster SOS created' }],
      createdBy: req.user.userId,
    });
    if (_io) {
      _io.emit('disaster:created', { event });
      
      // ── AUTO-NOTIFY community within 30km ──────────────────────────────────
      try {
        const communityUsers = await User.find({ role: 'community', isActive: true });
        const nearby = communityUsers.filter(u =>
          u.location?.lat && getDistanceKm(event.location.lat, event.location.lng, u.location.lat, u.location.lng) <= 30
        );
        console.log(`[Disaster] Notifying ${nearby.length} community members within 30km`);
        nearby.forEach(u => {
          const dist = getDistanceKm(event.location.lat, event.location.lng, u.location.lat, u.location.lng);
          _io.to(u._id.toString()).emit('disaster:community_alert', {
            eventId: event._id,
            teamName: event.teamName,
            type: event.type,
            origin: event.location,
            destination: event.destination,
            nearestHospital: event.nearestHospital,
            safetyCamp: event.safetyCamp,
            distanceKm: Math.round(dist * 10) / 10,
          });
        });

        // Also broadcast general alert for non-room-joined clients
        _io.emit('disaster:community_alert_broadcast', {
          eventId: event._id,
          teamName: event.teamName,
          type: event.type,
          origin: event.location,
          nearestHospital: event.nearestHospital,
          safetyCamp: event.safetyCamp,
        });
      } catch (err) {
        console.warn('[Disaster] Community notify error:', err.message);
      }
    }
    
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
 * PATCH /api/disaster/:id/attend — A community member volunteers to attend
 */
router.patch('/:id/attend', auth, async (req, res) => {
  try {
    const event = await DisasterEvent.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, error: 'Event not found' });
    if (event.status === 'arrived') return res.status(400).json({ success: false, error: 'Event already resolved' });

    // Ensure user isn't already in list
    const userId = req.user.userId;
    if (!event.resourceVolunteers.includes(userId)) {
      event.resourceVolunteers.push(userId);
      event.statusLog.push({ status: event.status, note: 'A community volunteer joined the rescue team' });
      await event.save();
    }

    const userDoc = await User.findById(userId).select('name phone location');

    if (_io) {
      _io.emit('disaster:volunteer_attended', {
        eventId: event._id,
        user: userDoc
      });
    }

    res.json({ success: true, event });
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
 * PATCH /api/disaster/:id/assign — Assign resources (rescue vehicles + team)
 */
router.patch('/:id/assign', auth, async (req, res) => {
  try {
    const { vehicleIds = [], volunteerIds = [], destination } = req.body;
    const event = await DisasterEvent.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, error: 'Event not found' });

    event.resourceVehicles = vehicleIds;
    if (volunteerIds && volunteerIds.length > 0) {
      // Only merge if explicitly passed
      const combined = new Set([...event.resourceVolunteers.map(v => v.toString()), ...volunteerIds]);
      event.resourceVolunteers = Array.from(combined);
    }
    if (destination?.lat) event.destination = destination;
    event.status = 'assigned';
    event.statusLog.push({ status: 'assigned', note: `${vehicleIds.length} rescue vehicles, ${volunteerIds.length} team members assigned` });
    await event.save();

    // Notify assigned rescue drivers
    if (_io) {
      _io.emit('disaster:team_assigned', {
        eventId: event._id,
        teamName: event.teamName,
        type: event.type,
        location: event.location,
        destination: event.destination,
        nearestHospital: event.nearestHospital,
        safetyCamp: event.safetyCamp,
        vehicleIds,
        volunteerIds
      });
    }
    res.json({ success: true, event });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /api/disaster/:id/enroute — Start convoy + auto-notify community within 30km
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
        event._id.toString()
      );
    }

    if (_io) {
      // Broadcast to all dispatcher/driver clients
      _io.emit('disaster:enroute', {
        eventId: event._id,
        teamName: event.teamName,
        type: event.type,
        origin: event.location,
        destination: event.destination,
        nearestHospital: event.nearestHospital,
        safetyCamp: event.safetyCamp,
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

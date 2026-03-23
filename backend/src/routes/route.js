const express = require('express');
const auth = require('../middleware/auth');
const router = express.Router();

/**
 * POST /api/route — OSRM basic routing (JSON body)
 * Body: { start: [lng, lat], end: [lng, lat] }
 */
router.post('/', auth, async (req, res) => {
  try {
    const { start, end } = req.body;
    if (!start || !end) {
      return res.status(400).json({ success: false, error: 'start [lng,lat] and end [lng,lat] required' });
    }
    const url = `https://router.project-osrm.org/route/v1/driving/${start[0]},${start[1]};${end[0]},${end[1]}?overview=full&geometries=geojson&steps=true`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.code !== 'Ok') {
      return res.status(400).json({ success: false, error: 'Could not compute route' });
    }
    res.json({
      success: true,
      route: data.routes[0],
      duration: data.routes[0].duration,
      distance: data.routes[0].distance
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/route/basic — Proxy to OSRM for basic routing
 * Client sends: ?start=lng,lat&end=lng,lat
 * Proxies to OSRM public API (no API key needed)
 */
router.get('/basic', auth, async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ success: false, error: 'start and end coordinates required (lng,lat format)' });
    }

    const url = `https://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&geometries=geojson&steps=true`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.code !== 'Ok') {
      return res.status(400).json({ success: false, error: 'Could not compute route' });
    }

    res.json({
      success: true,
      route: data.routes[0],
      duration: data.routes[0].duration,
      distance: data.routes[0].distance
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/route/reroute — Proxy to OpenRouteService with avoid zones
 * Hides ORS API key from client
 * Body: { start: [lng, lat], end: [lng, lat], avoidPolygons: GeoJSON }
 */
router.post('/reroute', auth, async (req, res) => {
  try {
    const { start, end, avoidPolygons } = req.body;
    if (!start || !end) {
      return res.status(400).json({ success: false, error: 'start and end coordinates required' });
    }

    const apiKey = process.env.ORS_API_KEY;
    if (!apiKey) {
      // Fallback to OSRM if no ORS key
      const url = `https://router.project-osrm.org/route/v1/driving/${start[0]},${start[1]};${end[0]},${end[1]}?overview=full&geometries=geojson`;
      const response = await fetch(url);
      const data = await response.json();

      return res.json({
        success: true,
        route: data.routes?.[0] || null,
        fallback: true,
        message: 'Used OSRM fallback (no ORS API key configured)'
      });
    }

    const body = {
      coordinates: [start, end],
      options: {}
    };

    if (avoidPolygons) {
      body.options.avoid_polygons = avoidPolygons;
    }

    const response = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    res.json({
      success: true,
      route: data.features?.[0] || null,
      duration: data.features?.[0]?.properties?.summary?.duration || 0,
      distance: data.features?.[0]?.properties?.summary?.distance || 0
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/route/hospitals?lat=&lng=&radius=
 * Backend-proxied hospital search via Overpass → falls back to Nominatim
 * Avoids client-side rate limits and HTML errors from the public Overpass API
 */
router.get('/hospitals', auth, async (req, res) => {
  const { lat, lng, radius = 20000 } = req.query;
  if (!lat || !lng) {
    return res.status(400).json({ success: false, error: 'lat and lng required' });
  }

  // Try Overpass first
  try {
    const query = `[out:json][timeout:10];node["amenity"="hospital"](around:${radius},${lat},${lng});out 20;`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const overpassRes = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'ResQNet/1.0 (emergency dispatch app; contact@resqnet.app)',
        'Accept': 'application/json'
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal
    });
    clearTimeout(timeout);

    const text = await overpassRes.text();
    const data = JSON.parse(text); // may throw if HTML error page

    const hospitals = data.elements
      .filter(e => e.tags && e.tags.name)
      .map(e => ({
        id: `osm-${e.id}`,
        name: e.tags.name,
        lat: e.lat,
        lng: e.lon,
        type: e.tags['healthcare:speciality'] || (e.tags.emergency === 'yes' ? 'Emergency' : 'General'),
        beds: e.tags.capacity || e.tags['beds'] || 'N/A'
      }));

    if (hospitals.length > 0) {
      return res.json({ success: true, hospitals, source: 'overpass' });
    }
    // fall through if no results
  } catch (overpassErr) {
    console.warn('[Hospitals] Overpass failed:', overpassErr.message, '— trying Nominatim');
  }

  // Fallback: Nominatim structured search
  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=hospital&format=json&limit=15&bounded=1&viewbox=${parseFloat(lng)-0.3},${parseFloat(lat)+0.3},${parseFloat(lng)+0.3},${parseFloat(lat)-0.3}`;
    const nomRes = await fetch(nominatimUrl, {
      headers: { 'User-Agent': 'ResQNet/1.0 (emergency dispatch; contact@resqnet.app)' }
    });
    const nomData = await nomRes.json();

    const hospitals = nomData
      .filter(p => p.display_name)
      .map((p, i) => ({
        id: `nom-${p.place_id || i}`,
        name: p.display_name.split(',')[0],
        lat: parseFloat(p.lat),
        lng: parseFloat(p.lon),
        type: p.type || 'Hospital',
        beds: 'N/A'
      }));

    return res.json({ success: true, hospitals, source: 'nominatim' });
  } catch (nomErr) {
    console.error('[Hospitals] Nominatim also failed:', nomErr.message);
    return res.status(503).json({ success: false, error: 'Hospital lookup unavailable' });
  }
});

module.exports = router;


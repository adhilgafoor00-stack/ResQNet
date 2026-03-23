const express = require('express');
const auth = require('../middleware/auth');
const router = express.Router();

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

module.exports = router;

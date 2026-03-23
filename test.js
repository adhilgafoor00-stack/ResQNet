const query = `[out:json];node["amenity"="hospital"](around:20000,11.2588,75.7804);out 15;`;
fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `data=${encodeURIComponent(query)}`
}).then(r => r.text()).then(console.log);

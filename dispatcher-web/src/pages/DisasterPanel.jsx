import { useState, useEffect, useRef } from 'react';
import { api } from '../store/useStore';
import { getSocket } from '../services/socket';

const TYPE_META = {
  flood:   { icon: '🌊', label: 'Flood',   color: '#1a73e8' },
  fire:    { icon: '🔥', label: 'Fire',    color: '#ea4335' },
  medical: { icon: '🏥', label: 'Medical', color: '#34a853' },
  rescue:  { icon: '🚁', label: 'Rescue',  color: '#fbbc04' },
};

const STATUS_STEPS = ['received','assigned','enroute','arrived'];
const STATUS_LABELS = {
  received: 'SOS Received', assigned: 'Team Assigned',
  enroute: 'En Route', arrived: 'Arrived ✅'
};

// ── Convoy map HTML ───────────────────────────────────────────────────────────
function getConvoyMapHTML(originLat, originLng, destLat, destLng, campLat, campLng, campName) {
  const destMarker = destLat && destLng
    ? `L.marker([${destLat},${destLng}],{icon:destIcon}).addTo(map).bindPopup('<b>🏥 Destination</b>');
       L.polyline([[${originLat},${originLng}],[${destLat},${destLng}]],{color:'#ea4335',weight:4,dashArray:'8,4',opacity:0.8}).addTo(map);
       map.fitBounds([[${originLat},${originLng}],[${destLat},${destLng}]],{padding:[40,40]});` : '';
  const campMarker = campLat && campLng
    ? `L.marker([${campLat},${campLng}],{icon:campIcon}).addTo(map).bindPopup('<b>⛺ ${campName || 'Safety Camp'}</b>');` : '';
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<style>*{margin:0;padding:0}html,body,#map{width:100%;height:100%}</style>
</head><body><div id="map"></div><script>
var map=L.map('map',{zoomControl:true}).setView([${originLat},${originLng}],13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
var originIcon=L.divIcon({className:'',html:'<div style="font-size:24px">📍</div>',iconSize:[28,28],iconAnchor:[14,28]});
var destIcon=L.divIcon({className:'',html:'<div style="font-size:24px">🏥</div>',iconSize:[28,28],iconAnchor:[14,28]});
var campIcon=L.divIcon({className:'',html:'<div style="font-size:22px">⛺</div>',iconSize:[26,26],iconAnchor:[13,26]});
L.marker([${originLat},${originLng}],{icon:originIcon}).addTo(map).bindPopup('SOS Location');
${destMarker}
${campMarker}
var vehicleMarkers={};
function updateVehicle(id,lat,lng,vtype){
  var icons={ambulance:'🚑',fire:'🚒',rescue:'⛑️',police:'🚓'};
  var icon=L.divIcon({className:'',html:'<div style="font-size:22px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5))">'+( icons[vtype]||'🚑')+'</div>',iconSize:[28,28],iconAnchor:[14,14]});
  if(vehicleMarkers[id]){vehicleMarkers[id].setLatLng([lat,lng]);}
  else{vehicleMarkers[id]=L.marker([lat,lng],{icon:icon}).addTo(map);}
}
window.addEventListener('message',function(e){try{var d=JSON.parse(e.data);if(d.type==='vehicleMoved')updateVehicle(d.id,d.lat,d.lng,d.vtype);}catch(e){}});
document.addEventListener('message',function(e){try{var d=JSON.parse(e.data);if(d.type==='vehicleMoved')updateVehicle(d.id,d.lat,d.lng,d.vtype);}catch(e){}});
<\/script></body></html>`;
}

export default function DisasterPanel() {
  const [step, setStep] = useState(1);
  const [activeEvent, setActiveEvent] = useState(null);
  const [events, setEvents] = useState([]);

  // Step 1
  const [form, setForm] = useState({ teamName: '', type: 'flood', lat: '', lng: '', destLat: '', destLng: '', destName: '', address: '' });
  const [detectingGPS, setDetectingGPS] = useState(false);
  const [recommendations, setRecommendations] = useState({ hospitals: [], safetyCamps: [] });
  const [fetchingRec, setFetchingRec] = useState(false);
  const [selectedCamp, setSelectedCamp] = useState(null);

  // Step 2
  const [vehicles, setVehicles] = useState([]);
  const [rescueTeam, setRescueTeam] = useState([]);
  const [selectedVehicles, setSelectedVehicles] = useState([]);
  const [selectedRescueMembers, setSelectedRescueMembers] = useState([]);

  // Step 3
  const mapRef = useRef(null);
  const [convoySent, setConvoySent] = useState(false);

  useEffect(() => { fetchResources(); fetchActiveEvents(); }, []);

  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    s.on('disaster:created', ({ event }) => setEvents(prev => [event, ...prev]));
    s.on('disaster:team_assigned', ({ eventId }) => {
      setEvents(prev => prev.map(e => e._id === eventId ? { ...e, status: 'assigned' } : e));
      if (activeEvent?._id === eventId) setActiveEvent(ev => ({ ...ev, status: 'assigned' }));
    });
    s.on('disaster:enroute', ({ eventId }) => {
      setEvents(prev => prev.map(e => e._id === eventId ? { ...e, status: 'enroute' } : e));
      if (activeEvent?._id === eventId) setActiveEvent(ev => ({ ...ev, status: 'enroute' }));
    });
    s.on('disaster:arrived', ({ eventId }) => {
      setEvents(prev => prev.map(e => e._id === eventId ? { ...e, status: 'arrived' } : e));
      if (activeEvent?._id === eventId) setActiveEvent(ev => ({ ...ev, status: 'arrived' }));
    });
    s.on('vehicle:moved', ({ vehicleId, lat, lng, vehicleType }) => {
      mapRef.current?.contentWindow?.postMessage(JSON.stringify({ type: 'vehicleMoved', id: vehicleId, lat, lng, vtype: vehicleType }), '*');
    });
    return () => { s.off('disaster:created'); s.off('disaster:team_assigned'); s.off('disaster:enroute'); s.off('disaster:arrived'); s.off('vehicle:moved'); };
  }, [activeEvent]);

  const fetchResources = async () => {
    try {
      const [vRes, uRes] = await Promise.all([
        api.get('/api/vehicles/active'),
        api.get('/api/admin/community'),
      ]);
      setVehicles(vRes.data.vehicles || []);
      // Rescue team = drivers with rescue vehicleType (from vehicles), community members = volunteers
      setRescueTeam((uRes.data.members || []).filter(m => m.isActive));
    } catch {}
  };

  const fetchActiveEvents = async () => {
    try { const res = await api.get('/api/disaster/active'); setEvents(res.data.events || []); } catch {}
  };

  // Fetch recommendations when GPS changes
  const fetchRecommendations = async (lat, lng) => {
    if (!lat || !lng) return;
    setFetchingRec(true);
    try {
      const res = await api.get('/api/disaster/recommendations', { params: { lat, lng } });
      setRecommendations({ hospitals: res.data.hospitals || [], safetyCamps: res.data.safetyCamps || [] });
    } catch {} finally { setFetchingRec(false); }
  };

  const detectGPS = () => {
    setDetectingGPS(true);
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(5);
        const lng = pos.coords.longitude.toFixed(5);
        setForm(f => ({ ...f, lat, lng }));
        setDetectingGPS(false);
        fetchRecommendations(lat, lng);
      },
      () => {
        setForm(f => ({ ...f, lat: '11.2588', lng: '75.7804' }));
        setDetectingGPS(false);
        fetchRecommendations('11.2588', '75.7804');
      }
    );
  };

  const selectHospital = (h) => {
    setForm(f => ({ ...f, destLat: String(h.lat), destLng: String(h.lng), destName: h.name }));
  };

  const selectCamp = (c) => {
    setSelectedCamp(c);
  };

  const handleCreateSOS = async () => {
    if (!form.teamName || !form.type || !form.lat || !form.lng) return alert('Fill all required fields');
    try {
      const res = await api.post('/api/disaster', {
        teamName: form.teamName, type: form.type,
        location: { lat: parseFloat(form.lat), lng: parseFloat(form.lng), address: form.address },
        destination: form.destLat ? { lat: parseFloat(form.destLat), lng: parseFloat(form.destLng), address: form.destName } : undefined,
        safetyCamp: selectedCamp ? { lat: selectedCamp.lat, lng: selectedCamp.lng, name: selectedCamp.name, capacity: selectedCamp.capacity } : undefined,
      });
      setActiveEvent(res.data.event);
      setStep(2);
    } catch (err) { alert('Error: ' + (err.response?.data?.error || err.message)); }
  };

  const handleAssignTeam = async () => {
    if (!activeEvent) return;
    if (selectedVehicles.length === 0) return alert('Select at least one rescue vehicle');
    try {
      const res = await api.patch(`/api/disaster/${activeEvent._id}/assign`, {
        vehicleIds: selectedVehicles,
        volunteerIds: selectedRescueMembers,
        destination: form.destLat ? { lat: parseFloat(form.destLat), lng: parseFloat(form.destLng) } : undefined,
      });
      setActiveEvent(res.data.event);
      setStep(3);
    } catch (err) { alert('Error: ' + (err.response?.data?.error || err.message)); }
  };

  const handleStartConvoy = async () => {
    try { await api.patch(`/api/disaster/${activeEvent._id}/enroute`); setConvoySent(true); }
    catch (err) { alert('Error: ' + (err.response?.data?.error || err.message)); }
  };

  const handleMarkArrived = async () => {
    try { await api.patch(`/api/disaster/${activeEvent._id}/arrived`); }
    catch (err) { alert('Error: ' + (err.response?.data?.error || err.message)); }
  };

  const toggleVehicle = (id) => setSelectedVehicles(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const toggleMember = (id) => setSelectedRescueMembers(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const meta = TYPE_META[form.type] || TYPE_META.flood;
  const resetAll = () => {
    setStep(1); setActiveEvent(null);
    setForm({ teamName:'', type:'flood', lat:'', lng:'', destLat:'', destLng:'', destName:'', address:'' });
    setSelectedVehicles([]); setSelectedRescueMembers([]); setConvoySent(false);
    setRecommendations({ hospitals: [], safetyCamps: [] }); setSelectedCamp(null);
  };

  return (
    <div className="disaster-panel">
      {/* Sidebar */}
      <div className="disaster-sidebar">
        <div className="disaster-sidebar-header">
          <h3>🚨 Active Events</h3>
          <button className="btn-new-event" onClick={resetAll}>+ New</button>
        </div>
        {events.length === 0 && <p className="no-events">No active events</p>}
        {events.map(ev => (
          <div key={ev._id} className={`event-card ${activeEvent?._id === ev._id ? 'active' : ''}`}
            onClick={() => { setActiveEvent(ev); setStep(3); }}>
            <span className="event-type-badge">{TYPE_META[ev.type]?.icon} {TYPE_META[ev.type]?.label}</span>
            <p className="event-team">{ev.teamName}</p>
            <span className={`status-badge status-${ev.status}`}>{STATUS_LABELS[ev.status]}</span>
          </div>
        ))}
      </div>

      {/* Main */}
      <div className="disaster-main">
        <div className="step-wizard">
          {['SOS Intake','Assign Team','Convoy Track'].map((s, i) => (
            <div key={i} className={`step-item ${step === i+1 ? 'active' : step > i+1 ? 'done' : ''}`}>
              <div className="step-circle">{step > i+1 ? '✓' : i+1}</div>
              <span>{s}</span>
            </div>
          ))}
        </div>

        {/* STEP 1 — SOS Form with recommendations */}
        {step === 1 && (
          <div className="disaster-card">
            <h2>🆘 Create Disaster SOS</h2>
            <div className="form-grid">
              <div className="form-col">
                <label>Team Name *</label>
                <input className="disaster-input" placeholder="e.g. Flood Rescue Alpha" value={form.teamName} onChange={e => setForm(f => ({...f, teamName: e.target.value}))} />
                <label>Disaster Type *</label>
                <div className="type-selector">
                  {Object.entries(TYPE_META).map(([k,v]) => (
                    <button key={k} className={`type-btn ${form.type === k ? 'selected' : ''}`}
                      style={form.type===k?{borderColor:v.color,background:v.color+'22'}:{}}
                      onClick={() => setForm(f=>({...f,type:k}))}>
                      {v.icon} {v.label}
                    </button>
                  ))}
                </div>
                <label>Address (optional)</label>
                <input className="disaster-input" placeholder="Street / Landmark" value={form.address} onChange={e => setForm(f => ({...f, address: e.target.value}))} />
              </div>

              <div className="form-col">
                <label>📍 Incident Location *</label>
                <div className="coord-row">
                  <input className="disaster-input" placeholder="Latitude" value={form.lat}
                    onChange={e => { setForm(f=>({...f,lat:e.target.value})); }}
                    onBlur={() => fetchRecommendations(form.lat, form.lng)} />
                  <input className="disaster-input" placeholder="Longitude" value={form.lng}
                    onChange={e => { setForm(f=>({...f,lng:e.target.value})); }}
                    onBlur={() => fetchRecommendations(form.lat, form.lng)} />
                </div>
                <button className="btn-detect" onClick={detectGPS} disabled={detectingGPS}>
                  {detectingGPS ? '⏳ Detecting...' : '📡 Auto-Detect GPS'}
                </button>

                <label>🏥 Destination Hospital</label>
                {form.destName ? (
                  <div className="rec-selected">
                    <span>✅ {form.destName}</span>
                    <button onClick={() => setForm(f=>({...f,destLat:'',destLng:'',destName:''}))} className="rec-clear">✕</button>
                  </div>
                ) : (
                  <div className="coord-row">
                    <input className="disaster-input" placeholder="Dest. Lat" value={form.destLat} onChange={e => setForm(f=>({...f,destLat:e.target.value}))} />
                    <input className="disaster-input" placeholder="Dest. Lng" value={form.destLng} onChange={e => setForm(f=>({...f,destLng:e.target.value}))} />
                  </div>
                )}
              </div>
            </div>

            {/* Recommendations */}
            {fetchingRec && <p className="rec-loading">⏳ Fetching nearby hospitals & camps...</p>}
            {(recommendations.hospitals.length > 0 || recommendations.safetyCamps.length > 0) && (
              <div className="rec-section">
                {recommendations.hospitals.length > 0 && (
                  <>
                    <h4 className="rec-title">🏥 Nearest Hospitals (click to select)</h4>
                    <div className="rec-grid">
                      {recommendations.hospitals.map(h => (
                        <button key={h.id} className={`rec-card ${form.destLat === String(h.lat) ? 'rec-active' : ''}`} onClick={() => selectHospital(h)}>
                          <span className="rec-name">{h.name}</span>
                          <span className="rec-meta">{h.type} · {h.distance?.toFixed(1)} km</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {recommendations.safetyCamps.length > 0 && (
                  <>
                    <h4 className="rec-title">⛺ Nearest Safety Camps (optional)</h4>
                    <div className="rec-grid">
                      {recommendations.safetyCamps.map(c => (
                        <button key={c.id} className={`rec-card ${selectedCamp?.id === c.id ? 'rec-active' : ''}`} onClick={() => selectCamp(selectedCamp?.id === c.id ? null : c)}>
                          <span className="rec-name">{c.name}</span>
                          <span className="rec-meta">Cap: {c.capacity} · {c.distance?.toFixed(1)} km</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            <button className="btn-primary-disaster" onClick={handleCreateSOS}>🆘 Create SOS Event</button>
          </div>
        )}

        {/* STEP 2 — Assign Rescue Team */}
        {step === 2 && (
          <div className="disaster-card">
            <h2>🚒 Assign Rescue Team — {activeEvent?.teamName}</h2>
            <div className="resource-grid">
              <div className="resource-col">
                <h4>🚑 Rescue Vehicles ({selectedVehicles.length} selected)</h4>
                {vehicles.length === 0 && <p className="no-res">No vehicles available</p>}
                {vehicles.map(v => (
                  <div key={v._id} className={`resource-item ${selectedVehicles.includes(v._id) ? 'selected' : ''}`} onClick={() => toggleVehicle(v._id)}>
                    <span className="res-icon">{v.vehicleType === 'ambulance' ? '🚑' : v.vehicleType === 'fire' ? '🚒' : v.vehicleType === 'rescue' ? '⛑️' : '🚔'}</span>
                    <div>
                      <p className="res-name">{v.vehicleNumber || 'Unit'}</p>
                      <p className="res-meta">{v.vehicleType} · {v.status}</p>
                    </div>
                    {selectedVehicles.includes(v._id) && <span className="check">✓</span>}
                  </div>
                ))}
              </div>
              <div className="resource-col">
                <h4>🙋 Rescue Team Members ({selectedRescueMembers.length} selected)</h4>
                {rescueTeam.length === 0 && <p className="no-res">No active team members</p>}
                {rescueTeam.map(m => (
                  <div key={m._id} className={`resource-item ${selectedRescueMembers.includes(m._id) ? 'selected' : ''}`} onClick={() => toggleMember(m._id)}>
                    <span className="res-icon">⛑️</span>
                    <div>
                      <p className="res-name">{m.name}</p>
                      <p className="res-meta">{m.phone}</p>
                    </div>
                    {selectedRescueMembers.includes(m._id) && <span className="check">✓</span>}
                  </div>
                ))}
              </div>
            </div>
            <p style={{color:'var(--color-text-secondary)',fontSize:13,marginBottom:14}}>
              ℹ️ Community members within 30km will be auto-notified when convoy starts.
            </p>
            <button className="btn-primary-disaster" onClick={handleAssignTeam}>✅ Assign Team &amp; Continue</button>
          </div>
        )}

        {/* STEP 3 — Convoy Dashboard */}
        {step === 3 && activeEvent && (
          <div className="disaster-card convoy-card">
            <div className="convoy-header">
              <div>
                <h2>{TYPE_META[activeEvent.type]?.icon} {activeEvent.teamName}</h2>
                <p className="convoy-meta">
                  {activeEvent.nearestHospital?.name && `🏥 ${activeEvent.nearestHospital.name}`}
                  {activeEvent.safetyCamp?.name && ` · ⛺ ${activeEvent.safetyCamp.name}`}
                </p>
              </div>
              <div className="status-timeline">
                {STATUS_STEPS.map(s => (
                  <div key={s} className={`timeline-step ${STATUS_STEPS.indexOf(activeEvent.status) >= STATUS_STEPS.indexOf(s) ? 'reached' : ''}`}>
                    <div className="timeline-dot" />
                    <span>{STATUS_LABELS[s]}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Map */}
            <div style={{ height: 340, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
              {activeEvent.location?.lat && (
                <iframe ref={mapRef} title="convoy-map" style={{ width: '100%', height: '100%', border: 'none' }}
                  srcDoc={getConvoyMapHTML(
                    activeEvent.location.lat, activeEvent.location.lng,
                    activeEvent.destination?.lat, activeEvent.destination?.lng,
                    activeEvent.safetyCamp?.lat, activeEvent.safetyCamp?.lng, activeEvent.safetyCamp?.name
                  )}
                />
              )}
            </div>

            {/* Info row */}
            {(activeEvent.nearestHospital?.name || activeEvent.safetyCamp?.name) && (
              <div className="convoy-info-row">
                {activeEvent.nearestHospital?.name && (
                  <div className="convoy-info-chip"><span>🏥</span><span>{activeEvent.nearestHospital.name} • {activeEvent.nearestHospital.type}</span></div>
                )}
                {activeEvent.safetyCamp?.name && (
                  <div className="convoy-info-chip"><span>⛺</span><span>{activeEvent.safetyCamp.name} • Cap: {activeEvent.safetyCamp.capacity}</span></div>
                )}
              </div>
            )}

            {/* Status Log */}
            <div className="status-log">
              <h4>📋 Status Log</h4>
              {(activeEvent.statusLog || []).map((log, i) => (
                <div key={i} className="log-row">
                  <span className={`log-badge log-${log.status}`}>{STATUS_LABELS[log.status]}</span>
                  <span className="log-note">{log.note}</span>
                  <span className="log-time">{new Date(log.timestamp).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="convoy-actions">
              {activeEvent.status === 'assigned' && !convoySent && (
                <button className="btn-primary-disaster" onClick={handleStartConvoy}>🚀 Start Convoy</button>
              )}
              {convoySent && activeEvent.status === 'assigned' && (
                <p style={{color:'var(--color-text-secondary)',fontSize:13}}>⏳ Convoy starting...</p>
              )}
              {activeEvent.status === 'enroute' && (
                <button className="btn-arrived" onClick={handleMarkArrived}>🏁 Mark Arrived</button>
              )}
              {activeEvent.status === 'arrived' && (
                <div className="arrived-banner">✅ Convoy has arrived!</div>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`
        .disaster-panel { display: flex; height: calc(100vh - 56px); background: var(--color-bg-dark); color: white; overflow: hidden; }
        .disaster-sidebar { width: 240px; flex-shrink: 0; background: var(--color-bg-card); border-right: 1px solid var(--color-border); display: flex; flex-direction: column; padding: 16px; gap: 8px; overflow-y: auto; }
        .disaster-sidebar-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .disaster-sidebar-header h3 { font-size: 14px; margin: 0; }
        .btn-new-event { background: var(--color-danger); color: #fff; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 700; }
        .no-events { color: var(--color-text-secondary); font-size: 12px; text-align: center; padding: 20px 0; }
        .event-card { background: var(--color-bg-elevated); border: 1px solid var(--color-border); border-radius: 8px; padding: 10px; cursor: pointer; transition: all 0.2s; }
        .event-card:hover, .event-card.active { border-color: var(--color-accent); }
        .event-type-badge { font-size: 11px; font-weight: 600; }
        .event-team { font-size: 13px; font-weight: 700; margin: 4px 0; }
        .status-badge { font-size: 10px; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
        .status-badge.status-received { background: #fbbc0440; color: #fbbc04; }
        .status-badge.status-assigned { background: #1a73e840; color: #81b4ea; }
        .status-badge.status-enroute  { background: #ea433540; color: #ef9a9a; }
        .status-badge.status-arrived  { background: #34a85340; color: #81c995; }
        .disaster-main { flex: 1; overflow-y: auto; padding: 24px; }
        .step-wizard { display: flex; align-items: center; margin-bottom: 28px; gap: 0; }
        .step-item { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--color-text-secondary); flex: 1; }
        .step-item.active { color: white; font-weight: 700; }
        .step-item.done { color: var(--color-safe); }
        .step-circle { width: 28px; height: 28px; border-radius: 50%; background: var(--color-bg-elevated); border: 2px solid var(--color-border); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; }
        .step-item.active .step-circle { background: var(--color-accent); border-color: var(--color-accent); color: #0F1923; }
        .step-item.done .step-circle { background: var(--color-safe); border-color: var(--color-safe); color: #0F1923; }
        .disaster-card { background: var(--color-bg-card); border: 1px solid var(--color-border); border-radius: var(--radius-card); padding: 24px; }
        .disaster-card h2 { font-size: 20px; margin: 0 0 20px; }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 20px; }
        .form-col { display: flex; flex-direction: column; gap: 12px; }
        .form-col label { font-size: 12px; font-weight: 600; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }
        .disaster-input { background: var(--color-bg-elevated); border: 1px solid var(--color-border); color: white; padding: 10px 14px; border-radius: 8px; font-size: 14px; outline: none; transition: border 0.2s; }
        .disaster-input:focus { border-color: var(--color-accent); }
        .coord-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .btn-detect { background: transparent; border: 1px solid var(--color-accent); color: var(--color-accent); padding: 8px 14px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; }
        .type-selector { display: flex; gap: 8px; flex-wrap: wrap; }
        .type-btn { background: var(--color-bg-elevated); border: 1px solid var(--color-border); color: white; padding: 8px 14px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.2s; }
        .rec-selected { display: flex; justify-content: space-between; align-items: center; background: #34a85320; border: 1px solid #34a853; border-radius: 8px; padding: 8px 12px; font-size: 13px; color: #81c995; }
        .rec-clear { background: transparent; border: none; color: #888; cursor: pointer; font-size: 14px; }
        .rec-loading { color: var(--color-text-secondary); font-size: 13px; margin: 12px 0 0; }
        .rec-section { margin-bottom: 20px; }
        .rec-title { font-size: 12px; font-weight: 700; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin: 16px 0 8px; }
        .rec-grid { display: flex; gap: 8px; flex-wrap: wrap; }
        .rec-card { background: var(--color-bg-elevated); border: 1px solid var(--color-border); color: white; padding: 10px 14px; border-radius: 10px; cursor: pointer; text-align: left; transition: all 0.2s; display: flex; flex-direction: column; gap: 3px; min-width: 160px; max-width: 240px; }
        .rec-card:hover { border-color: var(--color-accent); }
        .rec-card.rec-active { border-color: var(--color-danger); background: rgba(234,67,53,0.1); }
        .rec-name { font-size: 13px; font-weight: 700; }
        .rec-meta { font-size: 11px; color: var(--color-text-secondary); }
        .resource-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 20px; }
        .resource-col h4 { font-size: 13px; margin: 0 0 12px; color: var(--color-text-secondary); }
        .no-res { color: var(--color-text-secondary); font-size: 13px; }
        .resource-item { display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--color-bg-elevated); border: 1px solid var(--color-border); border-radius: 8px; cursor: pointer; margin-bottom: 8px; transition: border 0.2s; }
        .resource-item:hover, .resource-item.selected { border-color: var(--color-accent); }
        .res-icon { font-size: 22px; }
        .res-name { font-size: 14px; font-weight: 600; margin: 0; }
        .res-meta { font-size: 11px; color: var(--color-text-secondary); margin: 0; text-transform: capitalize; }
        .check { margin-left: auto; color: var(--color-accent); font-weight: 700; font-size: 16px; }
        .btn-primary-disaster { background: var(--color-danger); color: #fff; border: none; padding: 14px 28px; border-radius: 10px; cursor: pointer; font-size: 15px; font-weight: 700; transition: opacity 0.2s; }
        .btn-primary-disaster:hover { opacity: 0.85; }
        .btn-arrived { background: #34a853; color: #fff; border: none; padding: 14px 28px; border-radius: 10px; cursor: pointer; font-size: 15px; font-weight: 700; }
        .arrived-banner { background: #34a85330; color: #81c995; padding: 16px 24px; border-radius: 10px; border: 1px solid #34a853; font-size: 16px; font-weight: 700; }
        .convoy-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; gap: 16px; }
        .convoy-meta { color: var(--color-text-secondary); font-size: 13px; margin: 4px 0 0; }
        .convoy-info-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
        .convoy-info-chip { display: flex; align-items: center; gap: 6px; background: var(--color-bg-elevated); border: 1px solid var(--color-border); padding: 6px 12px; border-radius: 20px; font-size: 12px; color: var(--color-text-secondary); }
        .status-timeline { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .timeline-step { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 11px; color: var(--color-text-secondary); }
        .timeline-step.reached { color: var(--color-safe); }
        .timeline-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--color-border); }
        .timeline-step.reached .timeline-dot { background: var(--color-safe); }
        .status-log { border: 1px solid var(--color-border); border-radius: 8px; padding: 12px; margin-bottom: 20px; max-height: 140px; overflow-y: auto; }
        .status-log h4 { font-size: 12px; margin: 0 0 10px; color: var(--color-text-secondary); }
        .log-row { display: flex; align-items: center; gap: 12px; padding: 6px 0; border-bottom: 1px solid var(--color-border); font-size: 12px; }
        .log-row:last-child { border-bottom: none; }
        .log-badge { font-size: 10px; padding: 2px 8px; border-radius: 10px; font-weight: 600; background: var(--color-bg-elevated); }
        .log-note { flex: 1; color: var(--color-text-secondary); }
        .log-time { color: var(--color-text-secondary); font-family: var(--font-mono); }
        .convoy-actions { display: flex; gap: 12px; flex-wrap: wrap; }
      `}</style>
    </div>
  );
}


const TYPE_META = {
  flood:   { icon: '🌊', label: 'Flood',   color: '#1a73e8' },
  fire:    { icon: '🔥', label: 'Fire',    color: '#ea4335' },
  medical: { icon: '🏥', label: 'Medical', color: '#34a853' },
  rescue:  { icon: '🚁', label: 'Rescue',  color: '#fbbc04' },
};

const STATUS_STEPS = ['received','assigned','enroute','arrived'];
const STATUS_LABELS = {
  received: 'SOS Received',
  assigned: 'Team Assigned',
  enroute: 'En Route',
  arrived: 'Arrived ✅'
};

// ── Map HTML for convoy tracking ──────────────────────────────────────────────
function getConvoyMapHTML(originLat, originLng, destLat, destLng) {
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>*{margin:0;padding:0}html,body,#map{width:100%;height:100%}</style>
</head><body><div id="map"></div><script>
var map=L.map('map').setView([${originLat},${originLng}],13);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(map);

var originIcon=L.divIcon({className:'',html:'<div style="font-size:24px">📍</div>',iconSize:[28,28],iconAnchor:[14,28]});
var destIcon=L.divIcon({className:'',html:'<div style="font-size:24px">🏥</div>',iconSize:[28,28],iconAnchor:[14,28]});
L.marker([${originLat},${originLng}],{icon:originIcon}).addTo(map).bindPopup('SOS Location');
${destLat && destLng ? `L.marker([${destLat},${destLng}],{icon:destIcon}).addTo(map).bindPopup('Destination');` : ''}
${destLat && destLng ? `L.polyline([[${originLat},${originLng}],[${destLat},${destLng}]],{color:'#ea4335',weight:4,dashArray:'8,4',opacity:0.8}).addTo(map);
  map.fitBounds([[${originLat},${originLng}],[${destLat},${destLng}]],{padding:[40,40]});` : ''}

var vehicleMarkers={};
function updateVehicle(id,lat,lng,vtype){
  var icons={ambulance:'🚑',fire:'🚒',rescue:'⛵',police:'🚓'};
  var em=icons[vtype]||'🚑';
  var icon=L.divIcon({className:'',html:'<div style="font-size:22px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5))">'+em+'</div>',iconSize:[28,28],iconAnchor:[14,14]});
  if(vehicleMarkers[id]){vehicleMarkers[id].setLatLng([lat,lng]);}
  else{vehicleMarkers[id]=L.marker([lat,lng],{icon:icon}).addTo(map);}
}
window.addEventListener('message',function(e){try{var d=JSON.parse(e.data);if(d.type==='vehicleMoved')updateVehicle(d.id,d.lat,d.lng,d.vtype);}catch(e){}});
document.addEventListener('message',function(e){try{var d=JSON.parse(e.data);if(d.type==='vehicleMoved')updateVehicle(d.id,d.lat,d.lng,d.vtype);}catch(e){}});
</script></body></html>`;
}

export default function DisasterPanel() {
  const [step, setStep] = useState(1); // 1=SOS form, 2=assign, 3=convoy
  const [activeEvent, setActiveEvent] = useState(null);
  const [events, setEvents] = useState([]);

  // Step 1 — SOS form
  const [form, setForm] = useState({ teamName: '', type: 'flood', lat: '', lng: '', destLat: '', destLng: '', address: '' });
  const [detectingGPS, setDetectingGPS] = useState(false);

  // Step 2 — Resources
  const [vehicles, setVehicles] = useState([]);
  const [volunteers, setVolunteers] = useState([]);
  const [selectedVehicles, setSelectedVehicles] = useState([]);
  const [selectedVolunteers, setSelectedVolunteers] = useState([]);

  // Step 3 — Convoy
  const mapRef = useRef(null);
  const [convoySent, setConvoySent] = useState(false);

  // Load available resources + active events on mount
  useEffect(() => {
    fetchResources();
    fetchActiveEvents();
  }, []);

  // Real-time socket updates
  useEffect(() => {
    const s = getSocket();
    if (!s) return;

    s.on('disaster:created', ({ event }) => {
      setEvents(prev => [event, ...prev]);
    });
    s.on('disaster:team_assigned', ({ eventId }) => {
      setEvents(prev => prev.map(e => e._id === eventId ? { ...e, status: 'assigned' } : e));
      if (activeEvent?._id === eventId) setActiveEvent(ev => ({ ...ev, status: 'assigned' }));
    });
    s.on('disaster:enroute', ({ eventId }) => {
      setEvents(prev => prev.map(e => e._id === eventId ? { ...e, status: 'enroute' } : e));
      if (activeEvent?._id === eventId) setActiveEvent(ev => ({ ...ev, status: 'enroute' }));
    });
    s.on('disaster:arrived', ({ eventId }) => {
      setEvents(prev => prev.map(e => e._id === eventId ? { ...e, status: 'arrived' } : e));
      if (activeEvent?._id === eventId) setActiveEvent(ev => ({ ...ev, status: 'arrived' }));
    });
    s.on('vehicle:moved', ({ vehicleId, lat, lng, vehicleType }) => {
      mapRef.current?.contentWindow?.postMessage(JSON.stringify({ type: 'vehicleMoved', id: vehicleId, lat, lng, vtype: vehicleType }), '*');
    });
    return () => {
      s.off('disaster:created');
      s.off('disaster:team_assigned');
      s.off('disaster:enroute');
      s.off('disaster:arrived');
      s.off('vehicle:moved');
    };
  }, [activeEvent]);

  const fetchResources = async () => {
    try {
      const [vRes, uRes] = await Promise.all([
        api.get('/api/vehicles/active'),
        api.get('/api/admin/community'),
      ]);
      setVehicles(vRes.data.vehicles || []);
      setVolunteers((uRes.data.members || []).filter(m => m.isActive));
    } catch {}
  };

  const fetchActiveEvents = async () => {
    try {
      const res = await api.get('/api/disaster/active');
      setEvents(res.data.events || []);
    } catch {}
  };

  const detectGPS = () => {
    setDetectingGPS(true);
    navigator.geolocation?.getCurrentPosition(
      (pos) => { setForm(f => ({ ...f, lat: pos.coords.latitude.toFixed(5), lng: pos.coords.longitude.toFixed(5) })); setDetectingGPS(false); },
      () => { setForm(f => ({ ...f, lat: '11.2588', lng: '75.7804' })); setDetectingGPS(false); }
    );
  };

  const handleCreateSOS = async () => {
    if (!form.teamName || !form.type || !form.lat || !form.lng) return alert('Fill all required fields');
    try {
      const res = await api.post('/api/disaster', {
        teamName: form.teamName,
        type: form.type,
        location: { lat: parseFloat(form.lat), lng: parseFloat(form.lng), address: form.address },
        destination: form.destLat ? { lat: parseFloat(form.destLat), lng: parseFloat(form.destLng) } : undefined,
      });
      setActiveEvent(res.data.event);
      setStep(2);
    } catch (err) { alert('Error: ' + (err.response?.data?.error || err.message)); }
  };

  const handleAssignTeam = async () => {
    if (!activeEvent) return;
    if (selectedVehicles.length === 0) return alert('Select at least one vehicle');
    try {
      const res = await api.patch(`/api/disaster/${activeEvent._id}/assign`, {
        vehicleIds: selectedVehicles,
        volunteerIds: selectedVolunteers,
        destination: form.destLat ? { lat: parseFloat(form.destLat), lng: parseFloat(form.destLng) } : undefined,
      });
      setActiveEvent(res.data.event);
      setStep(3);
    } catch (err) { alert('Error: ' + (err.response?.data?.error || err.message)); }
  };

  const handleStartConvoy = async () => {
    try {
      await api.patch(`/api/disaster/${activeEvent._id}/enroute`);
      setConvoySent(true);
    } catch (err) { alert('Error: ' + (err.response?.data?.error || err.message)); }
  };

  const handleMarkArrived = async () => {
    try {
      await api.patch(`/api/disaster/${activeEvent._id}/arrived`);
    } catch (err) { alert('Error: ' + (err.response?.data?.error || err.message)); }
  };

  const toggleVehicle = (id) => setSelectedVehicles(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const toggleVolunteer = (id) => setSelectedVolunteers(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const meta = form.type ? TYPE_META[form.type] : TYPE_META.flood;

  return (
    <div className="disaster-panel">
      {/* Sidebar — Event List */}
      <div className="disaster-sidebar">
        <div className="disaster-sidebar-header">
          <h3>🚨 Active Events</h3>
          <button className="btn-new-event" onClick={() => { setStep(1); setActiveEvent(null); setForm({ teamName:'', type:'flood', lat:'', lng:'', destLat:'', destLng:'', address:'' }); setSelectedVehicles([]); setSelectedVolunteers([]); setConvoySent(false); }}>+ New</button>
        </div>
        {events.length === 0 && <p className="no-events">No active events</p>}
        {events.map(ev => (
          <div key={ev._id} className={`event-card ${activeEvent?._id === ev._id ? 'active' : ''}`} onClick={() => { setActiveEvent(ev); setStep(3); }}>
            <span className="event-type-badge">{TYPE_META[ev.type]?.icon} {TYPE_META[ev.type]?.label}</span>
            <p className="event-team">{ev.teamName}</p>
            <span className={`status-badge status-${ev.status}`}>{STATUS_LABELS[ev.status]}</span>
          </div>
        ))}
      </div>

      {/* Main Content */}
      <div className="disaster-main">
        {/* Step Wizard */}
        <div className="step-wizard">
          {['SOS Intake','Assign Team','Convoy Track'].map((s, i) => (
            <div key={i} className={`step-item ${step === i+1 ? 'active' : step > i+1 ? 'done' : ''}`}>
              <div className="step-circle">{step > i+1 ? '✓' : i+1}</div>
              <span>{s}</span>
            </div>
          ))}
        </div>

        {/* STEP 1 — SOS Form */}
        {step === 1 && (
          <div className="disaster-card">
            <h2>🆘 Create Disaster SOS</h2>
            <div className="form-grid">
              <div className="form-col">
                <label>Team Name *</label>
                <input className="disaster-input" placeholder="e.g. Flood Rescue Team Alpha" value={form.teamName} onChange={e => setForm(f => ({...f, teamName: e.target.value}))} />

                <label>Disaster Type *</label>
                <div className="type-selector">
                  {Object.entries(TYPE_META).map(([k,v]) => (
                    <button key={k} className={`type-btn ${form.type === k ? 'selected' : ''}`} style={form.type===k?{borderColor:v.color,background:v.color+'22'}:{}} onClick={() => setForm(f=>({...f,type:k}))}>
                      {v.icon} {v.label}
                    </button>
                  ))}
                </div>

                <label>Incident Address (optional)</label>
                <input className="disaster-input" placeholder="Street / Landmark" value={form.address} onChange={e => setForm(f => ({...f, address: e.target.value}))} />
              </div>

              <div className="form-col">
                <label>📍 Incident Location *</label>
                <div className="coord-row">
                  <input className="disaster-input" placeholder="Latitude" value={form.lat} onChange={e => setForm(f=>({...f,lat:e.target.value}))} />
                  <input className="disaster-input" placeholder="Longitude" value={form.lng} onChange={e => setForm(f=>({...f,lng:e.target.value}))} />
                </div>
                <button className="btn-detect" onClick={detectGPS} disabled={detectingGPS}>
                  {detectingGPS ? '⏳ Detecting...' : '📡 Auto-Detect GPS'}
                </button>

                <label>🏥 Destination (Hospital)</label>
                <div className="coord-row">
                  <input className="disaster-input" placeholder="Dest. Lat" value={form.destLat} onChange={e => setForm(f=>({...f,destLat:e.target.value}))} />
                  <input className="disaster-input" placeholder="Dest. Lng" value={form.destLng} onChange={e => setForm(f=>({...f,destLng:e.target.value}))} />
                </div>
              </div>
            </div>
            <button className="btn-primary-disaster" onClick={handleCreateSOS}>🆘 Create SOS Event</button>
          </div>
        )}

        {/* STEP 2 — Resource Assignment */}
        {step === 2 && (
          <div className="disaster-card">
            <h2>🚒 Assign Resources — {activeEvent?.teamName}</h2>
            <div className="resource-grid">
              <div className="resource-col">
                <h4>🚑 Available Vehicles ({selectedVehicles.length} selected)</h4>
                {vehicles.length === 0 && <p className="no-res">No vehicles available</p>}
                {vehicles.map(v => (
                  <div key={v._id} className={`resource-item ${selectedVehicles.includes(v._id) ? 'selected' : ''}`} onClick={() => toggleVehicle(v._id)}>
                    <span className="res-icon">{v.vehicleType === 'ambulance' ? '🚑' : v.vehicleType === 'fire' ? '🚒' : '🚔'}</span>
                    <div>
                      <p className="res-name">{v.vehicleNumber || 'Unit'}</p>
                      <p className="res-meta">{v.vehicleType} · {v.status}</p>
                    </div>
                    {selectedVehicles.includes(v._id) && <span className="check">✓</span>}
                  </div>
                ))}
              </div>
              <div className="resource-col">
                <h4>🙋 Active Volunteers ({selectedVolunteers.length} selected)</h4>
                {volunteers.length === 0 && <p className="no-res">No active volunteers</p>}
                {volunteers.map(v => (
                  <div key={v._id} className={`resource-item ${selectedVolunteers.includes(v._id) ? 'selected' : ''}`} onClick={() => toggleVolunteer(v._id)}>
                    <span className="res-icon">👤</span>
                    <div>
                      <p className="res-name">{v.name}</p>
                      <p className="res-meta">{v.phone}</p>
                    </div>
                    {selectedVolunteers.includes(v._id) && <span className="check">✓</span>}
                  </div>
                ))}
              </div>
            </div>
            <button className="btn-primary-disaster" onClick={handleAssignTeam}>✅ Assign Team & Continue</button>
          </div>
        )}

        {/* STEP 3 — Convoy Dashboard */}
        {step === 3 && activeEvent && (
          <div className="disaster-card convoy-card">
            <div className="convoy-header">
              <div>
                <h2>{TYPE_META[activeEvent.type]?.icon} {activeEvent.teamName}</h2>
                <p className="convoy-meta">Kozhikode Emergency Response</p>
              </div>
              <div className="status-timeline">
                {STATUS_STEPS.map(s => (
                  <div key={s} className={`timeline-step ${STATUS_STEPS.indexOf(activeEvent.status) >= STATUS_STEPS.indexOf(s) ? 'reached' : ''}`}>
                    <div className="timeline-dot" />
                    <span>{STATUS_LABELS[s]}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Convoy Map */}
            <div style={{ height: 340, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
              {activeEvent.location?.lat && (
                <iframe
                  ref={mapRef}
                  title="convoy-map"
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  srcDoc={getConvoyMapHTML(
                    activeEvent.location.lat, activeEvent.location.lng,
                    activeEvent.destination?.lat, activeEvent.destination?.lng
                  )}
                />
              )}
            </div>

            {/* Status Log */}
            <div className="status-log">
              <h4>📋 Status Log</h4>
              {(activeEvent.statusLog || []).map((log, i) => (
                <div key={i} className="log-row">
                  <span className={`log-badge log-${log.status}`}>{STATUS_LABELS[log.status]}</span>
                  <span className="log-note">{log.note}</span>
                  <span className="log-time">{new Date(log.timestamp).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="convoy-actions">
              {activeEvent.status === 'assigned' && !convoySent && (
                <button className="btn-primary-disaster" onClick={handleStartConvoy}>🚀 Start Convoy</button>
              )}
              {activeEvent.status === 'enroute' && (
                <button className="btn-arrived" onClick={handleMarkArrived}>🏁 Mark Arrived</button>
              )}
              {activeEvent.status === 'arrived' && (
                <div className="arrived-banner">✅ Convoy has arrived at destination!</div>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`
        .disaster-panel { display: flex; height: calc(100vh - 56px); background: var(--color-bg-dark); color: white; overflow: hidden; }
        .disaster-sidebar { width: 240px; flex-shrink: 0; background: var(--color-bg-card); border-right: 1px solid var(--color-border); display: flex; flex-direction: column; padding: 16px; gap: 8px; overflow-y: auto; }
        .disaster-sidebar-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .disaster-sidebar-header h3 { font-size: 14px; margin: 0; }
        .btn-new-event { background: var(--color-danger); color: #fff; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 700; }
        .no-events { color: var(--color-text-secondary); font-size: 12px; text-align: center; padding: 20px 0; }
        .event-card { background: var(--color-bg-elevated); border: 1px solid var(--color-border); border-radius: 8px; padding: 10px; cursor: pointer; transition: all 0.2s; }
        .event-card:hover, .event-card.active { border-color: var(--color-accent); }
        .event-type-badge { font-size: 11px; font-weight: 600; }
        .event-team { font-size: 13px; font-weight: 700; margin: 4px 0; }
        .status-badge { font-size: 10px; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
        .status-badge.status-received { background: #fbbc0440; color: #fbbc04; }
        .status-badge.status-assigned { background: #1a73e840; color: #81b4ea; }
        .status-badge.status-enroute { background: #ea433540; color: #ef9a9a; }
        .status-badge.status-arrived { background: #34a85340; color: #81c995; }

        .disaster-main { flex: 1; overflow-y: auto; padding: 24px; }
        .step-wizard { display: flex; align-items: center; margin-bottom: 28px; gap: 0; }
        .step-item { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--color-text-secondary); flex: 1; }
        .step-item.active { color: white; font-weight: 700; }
        .step-item.done { color: var(--color-safe); }
        .step-circle { width: 28px; height: 28px; border-radius: 50%; background: var(--color-bg-elevated); border: 2px solid var(--color-border); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; }
        .step-item.active .step-circle { background: var(--color-accent); border-color: var(--color-accent); color: #0F1923; }
        .step-item.done .step-circle { background: var(--color-safe); border-color: var(--color-safe); color: #0F1923; }

        .disaster-card { background: var(--color-bg-card); border: 1px solid var(--color-border); border-radius: var(--radius-card); padding: 24px; }
        .disaster-card h2 { font-size: 20px; margin: 0 0 20px; }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 20px; }
        .form-col { display: flex; flex-direction: column; gap: 12px; }
        .form-col label { font-size: 12px; font-weight: 600; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }
        .disaster-input { background: var(--color-bg-elevated); border: 1px solid var(--color-border); color: white; padding: 10px 14px; border-radius: 8px; font-size: 14px; outline: none; transition: border 0.2s; }
        .disaster-input:focus { border-color: var(--color-accent); }
        .coord-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .btn-detect { background: transparent; border: 1px solid var(--color-accent); color: var(--color-accent); padding: 8px 14px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; }
        .type-selector { display: flex; gap: 8px; flex-wrap: wrap; }
        .type-btn { background: var(--color-bg-elevated); border: 1px solid var(--color-border); color: white; padding: 8px 14px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.2s; }

        .resource-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 20px; }
        .resource-col h4 { font-size: 13px; margin: 0 0 12px; color: var(--color-text-secondary); }
        .no-res { color: var(--color-text-secondary); font-size: 13px; }
        .resource-item { display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--color-bg-elevated); border: 1px solid var(--color-border); border-radius: 8px; cursor: pointer; margin-bottom: 8px; transition: border 0.2s; }
        .resource-item:hover, .resource-item.selected { border-color: var(--color-accent); }
        .res-icon { font-size: 22px; }
        .res-name { font-size: 14px; font-weight: 600; margin: 0; }
        .res-meta { font-size: 11px; color: var(--color-text-secondary); margin: 0; text-transform: capitalize; }
        .check { margin-left: auto; color: var(--color-accent); font-weight: 700; font-size: 16px; }

        .btn-primary-disaster { background: var(--color-danger); color: #fff; border: none; padding: 14px 28px; border-radius: 10px; cursor: pointer; font-size: 15px; font-weight: 700; transition: opacity 0.2s; }
        .btn-primary-disaster:hover { opacity: 0.85; }
        .btn-arrived { background: #34a853; color: #fff; border: none; padding: 14px 28px; border-radius: 10px; cursor: pointer; font-size: 15px; font-weight: 700; }
        .arrived-banner { background: #34a85330; color: #81c995; padding: 16px 24px; border-radius: 10px; border: 1px solid #34a853; font-size: 16px; font-weight: 700; }

        .convoy-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; gap: 16px; }
        .convoy-meta { color: var(--color-text-secondary); font-size: 13px; margin: 4px 0 0; }
        .status-timeline { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .timeline-step { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 11px; color: var(--color-text-secondary); }
        .timeline-step.reached { color: var(--color-safe); }
        .timeline-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--color-border); }
        .timeline-step.reached .timeline-dot { background: var(--color-safe); }

        .status-log { border: 1px solid var(--color-border); border-radius: 8px; padding: 12px; margin-bottom: 20px; max-height: 140px; overflow-y: auto; }
        .status-log h4 { font-size: 12px; margin: 0 0 10px; color: var(--color-text-secondary); }
        .log-row { display: flex; align-items: center; gap: 12px; padding: 6px 0; border-bottom: 1px solid var(--color-border); font-size: 12px; }
        .log-row:last-child { border-bottom: none; }
        .log-badge { font-size: 10px; padding: 2px 8px; border-radius: 10px; font-weight: 600; background: var(--color-bg-elevated); }
        .log-note { flex: 1; color: var(--color-text-secondary); }
        .log-time { color: var(--color-text-secondary); font-family: var(--font-mono); }
        .convoy-actions { display: flex; gap: 12px; }
      `}</style>
    </div>
  );
}

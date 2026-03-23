import React, { useState, useEffect } from 'react';
import { api } from '../store/useStore';
import { Users, Truck, MapPin, Save, X } from 'lucide-react';

const MAP_HTML = (initialLat, initialLng) => `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>*{margin:0;padding:0}html,body,#map{width:100%;height:100%}</style>
</head><body><div id="map"></div>
<script>
var map = L.map('map').setView([${initialLat}, ${initialLng}], 13);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {maxZoom:19}).addTo(map);
var pin = L.marker([${initialLat}, ${initialLng}], {draggable: true}).addTo(map);
pin.on('dragend', function(e){
  var ll = e.target.getLatLng();
  window.parent.postMessage(JSON.stringify({type:'pinMoved', lat: ll.lat, lng: ll.lng}), '*');
});
map.on('click', function(e){
  pin.setLatLng(e.latlng);
  window.parent.postMessage(JSON.stringify({type:'pinMoved', lat: e.latlng.lat, lng: e.latlng.lng}), '*');
});
</script></body></html>`;

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState('community');
  const [members, setMembers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [editLoc, setEditLoc] = useState({ lat: 11.2588, lng: 75.7804 });
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [mapKey, setMapKey] = useState(0);

  useEffect(() => { fetchData(); }, [activeTab]);

  // Listen for map picker events
  useEffect(() => {
    const handler = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.type === 'pinMoved') {
          setEditLoc({ lat: d.lat, lng: d.lng });
        }
      } catch {}
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'community') {
        const res = await api.get('/api/admin/community');
        setMembers(res.data.members || []);
      } else {
        const res = await api.get('/api/vehicles/active');
        setVehicles(res.data.vehicles || []);
      }
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateLocation = async (userId) => {
    try {
      await api.patch(`/api/admin/community/${userId}/location`, {
        lat: parseFloat(editLoc.lat),
        lng: parseFloat(editLoc.lng)
      });
      fetchData();
      setSelectedUser(null);
      setShowMapPicker(false);
    } catch (err) {
      alert('Failed to update: ' + (err.response?.data?.error || err.message));
    }
  };

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h2>⚙️ System Configuration</h2>
        <div className="admin-tabs">
          <button className={activeTab === 'community' ? 'active' : ''} onClick={() => setActiveTab('community')}>
            <Users size={16} style={{marginRight:6}}/> Community Members
          </button>
          <button className={activeTab === 'vehicles' ? 'active' : ''} onClick={() => setActiveTab('vehicles')}>
            <Truck size={16} style={{marginRight:6}}/> Vehicle Fleet
          </button>
        </div>
      </div>

      <div className="admin-content">
        {loading ? (
          <div className="admin-loading">⏳ Syncing data...</div>
        ) : activeTab === 'community' ? (
          <div className="table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Location</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.length === 0 && (
                  <tr><td colSpan={5} style={{textAlign:'center', color: 'var(--color-text-secondary)', padding: 32}}>No community members found.</td></tr>
                )}
                {members.map(m => (
                  <tr key={m._id} className={selectedUser === m._id ? 'selected-row' : ''}>
                    <td>{m.name}</td>
                    <td>{m.phone}</td>
                    <td>
                      <span className={`status-pill ${m.isActive ? 'dispatched' : 'idle'}`}>
                        {m.isActive ? '🟢 Active' : '⚫ Idle'}
                      </span>
                    </td>
                    <td className="mono">
                      {m.location?.lat?.toFixed(4) || '—'}, {m.location?.lng?.toFixed(4) || '—'}
                    </td>
                    <td>
                      <button
                        className="btn-edit"
                        onClick={() => {
                          setSelectedUser(m._id);
                          setEditLoc({ lat: m.location?.lat || 11.2588, lng: m.location?.lng || 75.7804 });
                          setMapKey(k => k + 1);
                          setShowMapPicker(true);
                        }}
                      >
                        <MapPin size={14} style={{marginRight:4}}/> Set Location
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Plate</th>
                  <th>Driver</th>
                  <th>Status</th>
                  <th>Location</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.length === 0 && (
                  <tr><td colSpan={5} style={{textAlign:'center', color: 'var(--color-text-secondary)', padding: 32}}>No vehicles found.</td></tr>
                )}
                {vehicles.map(v => (
                  <tr key={v._id}>
                    <td style={{ textTransform: 'capitalize' }}>{v.vehicleType}</td>
                    <td className="mono">{v.vehicleNumber}</td>
                    <td>{v.driverId?.name || 'Unassigned'}</td>
                    <td>
                      <span className={`status-pill ${v.status}`}>{v.status}</span>
                    </td>
                    <td className="mono">
                      {v.location?.lat?.toFixed(4)}, {v.location?.lng?.toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Map Picker Modal */}
      {showMapPicker && selectedUser && (
        <div className="map-picker-overlay">
          <div className="map-picker-modal">
            <div className="map-picker-header">
              <h3>📍 Set Location</h3>
              <button onClick={() => { setShowMapPicker(false); setSelectedUser(null); }} className="map-picker-close"><X size={18} /></button>
            </div>
            <p style={{color:'var(--color-text-secondary)', fontSize: 13, marginBottom: 12}}>
              Click on the map or drag the pin to set the member's location.
            </p>
            <div className="map-picker-coords">
              Lat: <strong>{editLoc.lat?.toFixed ? editLoc.lat.toFixed(5) : editLoc.lat}</strong>
              &nbsp;&nbsp;Lng: <strong>{editLoc.lng?.toFixed ? editLoc.lng.toFixed(5) : editLoc.lng}</strong>
            </div>
            <div style={{height: 320, borderRadius: 12, overflow:'hidden', margin: '12px 0'}}>
              <iframe
                key={mapKey}
                title="location-picker"
                style={{width:'100%', height:'100%', border:'none'}}
                srcDoc={MAP_HTML(editLoc.lat, editLoc.lng)}
              />
            </div>
            <button className="btn-primary" onClick={() => handleUpdateLocation(selectedUser)}>
              <Save size={16} style={{marginRight:8}}/> Save Location
            </button>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .admin-panel { height: calc(100vh - 56px); display: flex; flex-direction: column; background: var(--color-bg-dark); color: white; padding: 24px; overflow: hidden; }
        .admin-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-shrink: 0; }
        .admin-header h2 { margin: 0; font-size: 20px; }
        .admin-tabs { display: flex; gap: 8px; background: var(--color-bg-card); padding: 4px; border-radius: var(--radius-pill); border: 1px solid var(--color-border); }
        .admin-tabs button { padding: 8px 18px; border: none; background: transparent; color: var(--color-text-secondary); border-radius: var(--radius-pill); cursor: pointer; font-weight: 600; display: flex; align-items: center; font-size: 13px; transition: all 0.2s; }
        .admin-tabs button.active { background: var(--color-accent); color: #0F1923; }
        .admin-content { flex: 1; overflow-y: auto; }
        .table-container { background: var(--color-bg-card); border: 1px solid var(--color-border); border-radius: var(--radius-card); overflow: hidden; }
        .admin-table { width: 100%; border-collapse: collapse; text-align: left; }
        .admin-table th { background: var(--color-bg-elevated); padding: 14px 16px; color: var(--color-text-secondary); font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
        .admin-table td { padding: 14px 16px; border-bottom: 1px solid var(--color-border); font-size: 14px; }
        .admin-table tr:last-child td { border-bottom: none; }
        .admin-table tr.selected-row td { background: rgba(var(--color-accent-rgb, 100,181,246), 0.08); }
        .mono { font-family: var(--font-mono); font-size: 13px; }
        .admin-loading { padding: 64px; text-align: center; color: var(--color-text-secondary); font-size: 16px; }
        .btn-edit { color: var(--color-info); background: transparent; border: 1px solid var(--color-info); padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px; display: flex; align-items: center; }
        .btn-edit:hover { background: rgba(100,181,246,0.1); }
        /* Map Picker Modal */
        .map-picker-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 24px; }
        .map-picker-modal { background: var(--color-bg-card); border: 1px solid var(--color-border); border-radius: var(--radius-card); padding: 24px; width: 100%; max-width: 600px; }
        .map-picker-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .map-picker-header h3 { margin: 0; font-size: 18px; }
        .map-picker-close { background: transparent; border: none; color: var(--color-text-secondary); cursor: pointer; padding: 4px; border-radius: 4px; }
        .map-picker-close:hover { background: var(--color-bg-elevated); }
        .map-picker-coords { font-family: var(--font-mono); font-size: 13px; color: var(--color-accent); background: var(--color-bg-elevated); padding: 8px 14px; border-radius: 6px; }
      `}} />
    </div>
  );
}

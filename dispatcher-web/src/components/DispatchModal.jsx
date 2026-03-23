import { useState } from 'react';
import { useMapStore } from '../store/useStore';
import { Navigation, X } from 'lucide-react';

export default function DispatchModal({ vehicleId, onClose }) {
  const { sosList, vehicles, dispatchVehicle } = useMapStore();
  const [destName, setDestName] = useState('');
  const [destLat, setDestLat] = useState('');
  const [destLng, setDestLng] = useState('');
  const [linkedSos, setLinkedSos] = useState('');
  const [loading, setLoading] = useState(false);

  const vehicle = vehicles.find(v => v._id === vehicleId);

  // Quick-fill from SOS selection
  const handleSosSelect = (e) => {
    const sosId = e.target.value;
    setLinkedSos(sosId);
    if (sosId) {
      const sos = sosList.find(s => s._id === sosId);
      if (sos?.location) {
        setDestLat(String(sos.location.lat));
        setDestLng(String(sos.location.lng));
        setDestName(`SOS — ${sos.citizenName}`);
      }
    }
  };

  const handleDispatch = async () => {
    if (!destLat || !destLng) return;
    setLoading(true);
    await dispatchVehicle(
      vehicleId,
      { lat: parseFloat(destLat), lng: parseFloat(destLng), name: destName },
      linkedSos || null
    );
    setLoading(false);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3>Dispatch Vehicle</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
            <X size={20} />
          </button>
        </div>

        {vehicle && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--color-bg-elevated)', borderRadius: 8, fontSize: 13, color: 'var(--color-text-secondary)' }}>
            🚑 {vehicle.vehicleType?.toUpperCase()} · {vehicle.vehicleNumber}
          </div>
        )}

        <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: 'var(--color-text-secondary)' }}>Link to Active SOS (optional)</label>
        <select value={linkedSos} onChange={handleSosSelect}>
          <option value="">— No SOS linked —</option>
          {sosList.map(sos => (
            <option key={sos._id} value={sos._id}>
              {sos.citizenName} · {sos.status} · {sos.state}
            </option>
          ))}
        </select>

        <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: 'var(--color-text-secondary)' }}>Destination Name</label>
        <input
          placeholder="e.g. Kozhikode Medical College"
          value={destName}
          onChange={e => setDestName(e.target.value)}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: 'var(--color-text-secondary)' }}>Latitude</label>
            <input placeholder="11.2588" value={destLat} onChange={e => setDestLat(e.target.value)} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: 'var(--color-text-secondary)' }}>Longitude</label>
            <input placeholder="75.7804" value={destLng} onChange={e => setDestLng(e.target.value)} />
          </div>
        </div>

        <div className="modal-actions">
          <button
            className="btn-primary"
            style={{ flex: 1 }}
            onClick={handleDispatch}
            disabled={loading || !destLat || !destLng}
          >
            <Navigation size={14} style={{ marginRight: 6 }} />
            {loading ? 'Dispatching...' : 'Dispatch Now'}
          </button>
          <button className="btn-primary btn-ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

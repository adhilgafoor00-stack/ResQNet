import { useState } from 'react';
import { useMapStore } from '../store/useStore';
import { Truck, Navigation, Circle } from 'lucide-react';

const vehicleEmoji = { ambulance: '🚑', fire: '🚒', rescue: '⛵', police: '🚓' };

export default function VehiclePanel({ onDispatch }) {
  const { vehicles } = useMapStore();

  if (vehicles.length === 0) {
    return (
      <div className="empty-state">
        <Truck size={32} color="var(--color-text-muted)" />
        <p>No active vehicles</p>
      </div>
    );
  }

  return (
    <div>
      {vehicles.map(v => (
        <div key={v._id} className="vehicle-card">
          <div className="vehicle-header">
            <span className="vehicle-type">
              {vehicleEmoji[v.vehicleType]} {v.vehicleType}
            </span>
            <div className="vehicle-status">
              <div className={`dot ${v.status}`} />
              <span style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>{v.status}</span>
            </div>
          </div>

          <div className="vehicle-number">{v.vehicleNumber}</div>

          {v.destination?.name && (
            <div style={{ fontSize: 12, color: 'var(--color-info)', marginTop: 4 }}>
              <Navigation size={10} style={{ marginRight: 4 }} />
              {v.destination.name}
            </div>
          )}

          <button
            className="btn-sm"
            style={{
              marginTop: 10,
              width: '100%',
              background: v.status === 'idle' ? 'var(--color-accent)' : 'var(--color-bg-dark)',
              color: v.status === 'idle' ? '#0F1923' : 'var(--color-text-muted)',
              border: v.status === 'idle' ? 'none' : '1px solid var(--color-border)'
            }}
            onClick={() => v.status === 'idle' && onDispatch(v._id)}
            disabled={v.status !== 'idle'}
          >
            {v.status === 'idle' ? 'Dispatch' : v.status === 'dispatched' ? 'En Route...' : 'Arrived'}
          </button>
        </div>
      ))}
    </div>
  );
}

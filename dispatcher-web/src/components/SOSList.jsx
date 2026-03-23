import { useMapStore } from '../store/useStore';
import { AlertTriangle, Clock, MapPin, Check, XCircle } from 'lucide-react';

const priorityLabel = { 1: 'trapped', 2: 'injured', 3: 'safe' };

function timeAgo(dateStr) {
  const diff = Math.round((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  return `${Math.round(diff / 3600)}h ago`;
}

export default function SOSList() {
  const { sosList, setSelectedSos, selectedSos, resolveSos, markFalseAlarm } = useMapStore();

  if (sosList.length === 0) {
    return (
      <div className="empty-state">
        <AlertTriangle size={32} color="var(--color-text-muted)" />
        <p>No active SOS reports</p>
      </div>
    );
  }

  return (
    <div>
      {sosList.map(sos => (
        <div
          key={sos._id}
          className={`sos-card priority-${sos.priority}`}
          onClick={() => setSelectedSos(sos)}
        >
          <div className="sos-header">
            <span className="sos-name">{sos.citizenName}</span>
            <span className={`status-pill ${sos.status}`}>{sos.status}</span>
          </div>

          <div className="sos-location">
            <MapPin size={10} style={{ marginRight: 4 }} />
            {sos.location?.lat?.toFixed(4)}, {sos.location?.lng?.toFixed(4)}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="sos-time">
              <Clock size={10} style={{ marginRight: 4 }} />
              {timeAgo(sos.createdAt)}
            </span>
            <span className={`status-pill ${sos.state}`}>{sos.state}</span>
          </div>

          <div className="sos-actions">
            <button
              className="btn-sm"
              style={{ background: 'var(--color-accent)', color: '#0F1923', flex: 1 }}
              onClick={(e) => { e.stopPropagation(); resolveSos(sos._id); }}
            >
              <Check size={12} style={{ marginRight: 4 }} /> Resolve
            </button>
            <button
              className="btn-sm"
              style={{ background: 'var(--color-bg-dark)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
              onClick={(e) => { e.stopPropagation(); markFalseAlarm(sos._id); }}
            >
              <XCircle size={12} style={{ marginRight: 4 }} /> False
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

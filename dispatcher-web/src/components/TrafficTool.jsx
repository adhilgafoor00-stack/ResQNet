import { AlertOctagon, X } from 'lucide-react';

export default function TrafficTool({ trafficMode, setTrafficMode }) {
  return (
    <div className="traffic-tool">
      <AlertOctagon size={16} color={trafficMode ? '#FF4757' : 'var(--color-text-muted)'} />
      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Traffic Block</span>

      <button
        className={`traffic-btn ${trafficMode ? 'active' : 'inactive'}`}
        onClick={() => setTrafficMode(!trafficMode)}
      >
        {trafficMode ? '⛔ Click Map to Place' : 'Enable Tool'}
      </button>

      {trafficMode && (
        <button
          className="traffic-btn inactive"
          onClick={() => setTrafficMode(false)}
          style={{ display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <X size={12} /> Done
        </button>
      )}
    </div>
  );
}

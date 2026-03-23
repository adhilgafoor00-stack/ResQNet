import { useEffect, useState } from 'react';
import { useAuthStore, useMapStore } from '../store/useStore';
import { connectSocket, disconnectSocket } from '../services/socket';
import LiveMap from '../components/Map';
import SOSList from '../components/SOSList';
import VehiclePanel from '../components/VehiclePanel';
import VoiceBroadcast from '../components/VoiceBroadcast';
import TrafficTool from '../components/TrafficTool';
import DispatchModal from '../components/DispatchModal';
import { LogOut, Radio, Siren, Truck, AlertTriangle } from 'lucide-react';

export default function Dashboard() {
  const { user, logout } = useAuthStore();
  const {
    sosList, vehicles, stats, fetchActiveSos, fetchActiveVehicles,
    fetchTrafficBlocks, fetchStats,
    handleSosNew, handleSosUpdated, handleVehicleActive,
    handleVehicleMoved, handleTrafficBlock, handleTrafficClear
  } = useMapStore();

  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [selectedVehicleForDispatch, setSelectedVehicleForDispatch] = useState(null);
  const [trafficMode, setTrafficMode] = useState(false);
  const [policeAlertBanner, setPoliceAlertBanner] = useState(false);

  useEffect(() => {
    // Fetch initial data
    fetchActiveSos();
    fetchActiveVehicles();
    fetchTrafficBlocks();
    fetchStats();

    // Refresh stats every 30s
    const statsInterval = setInterval(fetchStats, 30000);

    // Connect socket
    const socket = connectSocket(user?._id, {
      handleSosNew,
      handleSosUpdated,
      handleVehicleActive,
      handleVehicleMoved,
      handleTrafficBlock,
      handleTrafficClear,
      handlePoliceAlerted: () => {
        setPoliceAlertBanner(true);
        setTimeout(() => setPoliceAlertBanner(false), 4000);
      },
    });

    return () => {
      clearInterval(statsInterval);
      disconnectSocket();
    };
  }, []);

  const handleDispatch = (vehicleId) => {
    setSelectedVehicleForDispatch(vehicleId);
    setShowDispatchModal(true);
  };

  return (
    <div className="dashboard">
      {/* Top Bar */}
      <div className="topbar">
        <div className="brand">ResQNet</div>

        <div className="stats-row">
          <div className="stat-item">
            <span className="stat-value">{stats?.pendingSos || 0}</span>
            <span className="stat-label">Active SOS</span>
          </div>
          <div className="stat-item">
            <span className="stat-value" style={{ color: 'var(--color-info)' }}>{stats?.activeVehicles || 0}</span>
            <span className="stat-label">Vehicles</span>
          </div>
          <div className="stat-item">
            <span className="stat-value" style={{ color: 'var(--color-safe)' }}>{stats?.resolvedToday || 0}</span>
            <span className="stat-label">Resolved</span>
          </div>
          <div className="stat-item">
            <span className="stat-value" style={{ color: 'var(--color-warning)' }}>
              {stats?.avgResponseTimeSeconds ? `${Math.round(stats.avgResponseTimeSeconds / 60)}m` : '—'}
            </span>
            <span className="stat-label">Avg Response</span>
          </div>
        </div>

        <div className="user-info">
          <span className="user-name">{user?.name}</span>
          <button className="logout-btn" onClick={logout}>
            <LogOut size={12} style={{ marginRight: 4 }} /> Logout
          </button>
        </div>
      </div>

      {/* Police Alert Confirmation Banner */}
      {policeAlertBanner && (
        <div style={{
          position: 'fixed',
          top: 64,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--color-safe)',
          color: '#0F1923',
          padding: '12px 28px',
          borderRadius: 'var(--radius-pill)',
          fontWeight: 700,
          fontSize: 14,
          zIndex: 5000,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          animation: 'slideUp 0.3s ease-out'
        }} className="toast">
          🚔 Traffic Police Alerted — Road clearing broadcast sent
        </div>
      )}

      {/* Left Sidebar — Active SOS List */}
      <div className="sidebar-left">
        <h3><Siren size={18} color="var(--color-danger)" /> Active SOS ({sosList.length})</h3>
        <SOSList />
      </div>

      {/* Center — Map */}
      <div className="map-area">
        <LiveMap trafficMode={trafficMode} />
        <TrafficTool trafficMode={trafficMode} setTrafficMode={setTrafficMode} />
      </div>

      {/* Right Sidebar — Vehicle Panel */}
      <div className="sidebar-right">
        <h3><Truck size={18} color="var(--color-info)" /> Vehicles ({vehicles.length})</h3>
        <VehiclePanel onDispatch={handleDispatch} />
        <VoiceBroadcast />
      </div>

      {/* Dispatch Modal */}
      {showDispatchModal && (
        <DispatchModal
          vehicleId={selectedVehicleForDispatch}
          onClose={() => setShowDispatchModal(false)}
        />
      )}
    </div>
  );
}

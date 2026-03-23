import { useState } from 'react';
import { useAuthStore } from './store/useStore';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AdminPanel from './pages/AdminPanel';
import './index.css';

export default function App() {
  const { isAuthenticated, user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('dashboard');

  // If not logged in, show login
  if (!isAuthenticated) return <Login />;

  // Dispatchers only on web — other roles redirected
  if (user && user.role !== 'dispatcher') {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="logo">ResQNet</div>
          <p style={{ color: 'var(--color-warning)', marginBottom: 16 }}>
            ⚠️ This console is for dispatchers only.
          </p>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: 24 }}>
            Logged in as: <strong>{user.name}</strong> ({user.role})<br />
            Please use the mobile app for your role.
          </p>
          <button className="btn-primary" onClick={useAuthStore.getState().logout}>
            Logout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="layout">
      {/* Global Tab Switcher (Floating or in Header) */}
      <div className="tab-switcher">
        <button 
          className={activeTab === 'dashboard' ? 'active' : ''} 
          onClick={() => setActiveTab('dashboard')}
        >
          🖥️ Ops Dashboard
        </button>
        <button 
          className={activeTab === 'admin' ? 'active' : ''} 
          onClick={() => setActiveTab('admin')}
        >
          ⚙️ Admin Panel
        </button>
      </div>

      {activeTab === 'dashboard' ? <Dashboard /> : <AdminPanel />}
    </div>
  );
}

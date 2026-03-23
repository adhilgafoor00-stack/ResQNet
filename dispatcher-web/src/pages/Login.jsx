import { useState } from 'react';
import { useAuthStore } from '../store/useStore';
import { AlertCircle } from 'lucide-react';

export default function Login() {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState('phone'); // 'phone' or 'otp'
  const { requestOtp, verifyOtp, loading, error } = useAuthStore();

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    try {
      await requestOtp(phone);
      setStep('otp');
    } catch (err) { /* error handled by store */ }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    try {
      const result = await verifyOtp(phone, otp);
      if (result.user.role !== 'dispatcher') {
        useAuthStore.getState().logout();
        alert('This web app is for dispatchers only. Please use the mobile app.');
      }
    } catch (err) { /* error handled by store */ }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="logo">ResQNet</div>
        <p className="subtitle">Emergency Coordination — Dispatcher Console</p>

        {error && (
          <div className="error-msg" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {step === 'phone' ? (
          <form onSubmit={handleRequestOtp}>
            <label htmlFor="phone">Phone Number</label>
            <input
              id="phone"
              type="tel"
              placeholder="+91 9000000001"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoFocus
            />
            <button type="submit" className="btn-primary" disabled={loading || !phone}>
              {loading ? 'Sending...' : 'Send OTP'}
            </button>
            <p style={{ marginTop: 16, fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center' }}>
              Demo: +919000000001 • OTP: 1234
            </p>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp}>
            <label htmlFor="otp">Enter OTP</label>
            <input
              id="otp"
              type="text"
              placeholder="1234"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              maxLength={4}
              autoFocus
              style={{ textAlign: 'center', fontSize: 24, letterSpacing: 12, fontFamily: 'var(--font-mono)' }}
            />
            <button type="submit" className="btn-primary" disabled={loading || otp.length !== 4}>
              {loading ? 'Verifying...' : 'Login'}
            </button>
            <button
              type="button"
              className="btn-primary btn-ghost"
              onClick={() => { setStep('phone'); setOtp(''); }}
              style={{ marginTop: 10 }}
            >
              Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

import { useState, useRef } from 'react';
import { useAuthStore } from '../store/useStore';
import { Mic, MicOff, Radio } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function VoiceBroadcast() {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | recording | uploading | sent | error
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const { token } = useAuthStore();

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      mediaRecorder.onstop = uploadAudio;

      mediaRecorder.start();
      setIsRecording(true);
      setStatus('recording');
    } catch (err) {
      setStatus('error');
      console.error('Microphone access denied:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      setIsRecording(false);
      setStatus('uploading');
    }
  };

  const uploadAudio = async () => {
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
    const formData = new FormData();
    formData.append('audio', blob, `broadcast_${Date.now()}.webm`);
    formData.append('lat', '11.2588');
    formData.append('lng', '75.7804');
    formData.append('radius', '5000');

    try {
      const res = await fetch(`${API_URL}/api/broadcast/voice`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      if (res.ok) {
        setStatus('sent');
        setTimeout(() => setStatus('idle'), 3000);
      } else {
        setStatus('error');
      }
    } catch (err) {
      setStatus('error');
      console.error('Upload error:', err);
    }
  };

  return (
    <div className="voice-section">
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 14, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-secondary)' }}>
        <Radio size={14} /> Voice Broadcast
      </h3>

      <button
        className={`voice-btn ${isRecording ? 'recording' : ''}`}
        onMouseDown={startRecording}
        onMouseUp={stopRecording}
        onTouchStart={startRecording}
        onTouchEnd={stopRecording}
        disabled={status === 'uploading'}
      >
        {isRecording ? (
          <><MicOff size={16} /> Release to Send</>
        ) : status === 'uploading' ? (
          <>⏳ Sending...</>
        ) : status === 'sent' ? (
          <>✅ Broadcast Sent!</>
        ) : status === 'error' ? (
          <>❌ Error — Try Again</>
        ) : (
          <><Mic size={16} /> Hold to Record &amp; Broadcast</>
        )}
      </button>

      <p style={{ fontSize: 11, color: 'var(--color-text-muted)', textAlign: 'center', marginTop: 8 }}>
        Hold button to record. Release to broadcast to all responders.
      </p>
    </div>
  );
}

import { useState, useEffect } from 'react';
import axios from 'axios';
import MapComponent from './components/MapComponent';
import './App.css';

const API_BASE_URL = 'http://localhost:5000/api';

function App() {
  const [ambulances, setAmbulances] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const ambRes = await axios.get(`${API_BASE_URL}/ambulances`);
      const reqRes = await axios.get(`${API_BASE_URL}/requests`);
      setAmbulances(ambRes.data);
      setRequests(reqRes.data);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const handleRequestAmbulance = async () => {
    const patientName = prompt('Enter your name:');
    if (!patientName) return;

    // Simulate location (Bangalore center)
    const pickupLat = 12.9716 + (Math.random() - 0.5) * 0.01;
    const pickupLng = 77.5946 + (Math.random() - 0.5) * 0.01;

    try {
      await axios.post(`${API_BASE_URL}/requests`, {
        patientName,
        pickupLat,
        pickupLng
      });
      alert('Ambulance requested successfully!');
      fetchData();
    } catch (err) {
      alert('Error requesting ambulance');
    }
  };

  const markers = [
    ...ambulances.map(a => ({ lat: a.currentLat, lng: a.currentLng, name: `Ambulance: ${a.name}`, status: a.status })),
    ...requests.map(r => ({ lat: r.pickupLat, lng: r.pickupLng, name: `Patient: ${r.patientName}`, status: r.status }))
  ];

  return (
    <div className="App">
      <header className="header">
        <h1>ResQNet: Ambulance Tracker</h1>
      </header>
      <main className="main-content">
        {loading ? (
          <p>Loading markers...</p>
        ) : (
          <div className="map-wrapper">
            <MapComponent center={[12.9716, 77.5946]} markers={markers} />
          </div>
        )}
        <div className="controls">
          <button onClick={handleRequestAmbulance}>Request Ambulance</button>
        </div>
        <div className="status-lists">
            <div className="list-section">
                <h3>Live Requests</h3>
                <ul>
                    {requests.map((r, i) => (
                        <li key={i}>{r.patientName} - {r.status}</li>
                    ))}
                </ul>
            </div>
        </div>
      </main>
    </div>
  );
}

export default App;

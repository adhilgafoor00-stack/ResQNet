import { useState } from 'react';
import MapComponent from './components/MapComponent';
import './App.css';

function App() {
  const [markers, setMarkers] = useState([
    { lat: 12.9716, lng: 77.5946, name: 'Ambulance 1', status: 'Available' },
    { lat: 12.9352, lng: 77.6245, name: 'Patient Request', status: 'Pending' }
  ]);

  return (
    <div className="App">
      <header className="header">
        <h1>ResQNet: Ambulance Tracker</h1>
      </header>
      <main className="main-content">
        <div className="map-wrapper">
          <MapComponent center={[12.9716, 77.5946]} markers={markers} />
        </div>
        <div className="controls">
          <button onClick={() => alert('Requesting Ambulance...')}>Request Ambulance</button>
        </div>
      </main>
    </div>
  );
}

export default App;

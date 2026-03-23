import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMapEvents } from 'react-leaflet';
import { divIcon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useMapStore } from '../store/useStore';

// Kozhikode, Kerala center
const MAP_CENTER = [11.2588, 75.7804];

// Custom SVG pin icons per type
function makeIcon(cls) {
  return divIcon({
    className: '',
    html: `<div class="custom-pin ${cls}"></div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
  });
}

const ICONS = {
  sos_trapped: makeIcon('sos-trapped pin-pulse'),
  sos_injured: makeIcon('sos-injured'),
  sos_safe: makeIcon('sos-safe'),
  vehicle_ambulance: makeIcon('vehicle'),
  vehicle_fire: makeIcon('vehicle'),
  vehicle_rescue: makeIcon('vehicle'),
  vehicle_police: makeIcon('vehicle'),
  community: makeIcon('community'),
};

const vehicleEmoji = { ambulance: '🚑', fire: '🚒', rescue: '⛵', police: '🚓' };

// Click handler inside map to place traffic blocks
function ClickHandler({ trafficMode }) {
  const { placeTrafficBlock } = useMapStore();
  useMapEvents({
    click(e) {
      if (!trafficMode) return;
      placeTrafficBlock(e.latlng.lat, e.latlng.lng, 200, 'manual');
    }
  });
  return null;
}

export default function LiveMap({ trafficMode }) {
  const { sosList, vehicles, trafficBlocks, removeTrafficBlock } = useMapStore();

  return (
    <MapContainer
      center={MAP_CENTER}
      zoom={14}
      style={{ width: '100%', height: '100%' }}
      zoomControl={true}
    >
      {/* Dark CartoDB tile layer — matches emergency ops aesthetic */}
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        maxZoom={19}
      />

      <ClickHandler trafficMode={trafficMode} />

      {/* SOS Pins — color by priority/status */}
      {sosList.map(sos => {
        if (!sos.location?.lat) return null;
        const iconKey = `sos_${sos.status}`;
        return (
          <Marker
            key={sos._id}
            position={[sos.location.lat, sos.location.lng]}
            icon={ICONS[iconKey] || ICONS.sos_injured}
          >
            <Popup>
              <div style={{ fontFamily: 'DM Sans, sans-serif', minWidth: 180 }}>
                <strong>{sos.citizenName}</strong><br />
                <span style={{ color: sos.status === 'trapped' ? '#FF4757' : sos.status === 'injured' ? '#FFA502' : '#2ED573', textTransform: 'uppercase', fontSize: 11, fontWeight: 700 }}>{sos.status}</span>
                <br />{sos.citizenPhone}
                <br /><small style={{ opacity: 0.6, fontFamily: 'JetBrains Mono, monospace' }}>{sos.location.lat.toFixed(4)}, {sos.location.lng.toFixed(4)}</small>
              </div>
            </Popup>
          </Marker>
        );
      })}

      {/* Vehicle Pins */}
      {vehicles.map(v => {
        if (!v.location?.lat) return null;
        return (
          <Marker
            key={v._id}
            position={[v.location.lat, v.location.lng]}
            icon={ICONS[`vehicle_${v.vehicleType}`] || ICONS.vehicle_ambulance}
          >
            <Popup>
              <div style={{ fontFamily: 'DM Sans, sans-serif', minWidth: 160 }}>
                <strong>{vehicleEmoji[v.vehicleType]} {v.vehicleType?.toUpperCase()}</strong><br />
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{v.vehicleNumber}</span><br />
                <span style={{ color: v.status === 'dispatched' ? '#1E90FF' : '#2ED573', textTransform: 'uppercase', fontSize: 11, fontWeight: 700 }}>{v.status}</span>
              </div>
            </Popup>
          </Marker>
        );
      })}

      {/* Traffic Block Circles — red semi-transparent */}
      {trafficBlocks.map(block => (
        <Circle
          key={block._id}
          center={[block.lat, block.lng]}
          radius={block.radius}
          pathOptions={{ color: '#FF4757', fillColor: '#FF4757', fillOpacity: 0.2, weight: 2 }}
          eventHandlers={{
            contextmenu: () => removeTrafficBlock(block._id)
          }}
        >
          <Popup>
            <div style={{ fontFamily: 'DM Sans, sans-serif' }}>
              <strong style={{ color: '#FF4757' }}>⛔ Traffic Block</strong><br />
              {block.reason} · {block.severity}<br />
              <small>Right-click to remove</small>
            </div>
          </Popup>
        </Circle>
      ))}
    </MapContainer>
  );
}

/**
 * Static safety camp / shelter locations across Kozhikode district.
 * Used by the disaster recommendation API to suggest nearby safe zones.
 */
const SAFETY_CAMPS = [
  { id: 'sc-1', name: 'Town Hall Relief Camp', lat: 11.2500, lng: 75.7706, capacity: 500, type: 'Camp' },
  { id: 'sc-2', name: 'Govt. UP School Nadakkavu', lat: 11.2621, lng: 75.7850, capacity: 200, type: 'Camp' },
  { id: 'sc-3', name: 'Koduvally Medical Camp', lat: 11.3668, lng: 75.9090, capacity: 300, type: 'Medical Camp' },
  { id: 'sc-4', name: 'EMS Stadium Shelter', lat: 11.2523, lng: 75.7788, capacity: 800, type: 'Camp' },
  { id: 'sc-5', name: 'Chevayur Rescue Home', lat: 11.2745, lng: 75.8015, capacity: 250, type: 'Rescue Home' },
  { id: 'sc-6', name: 'Feroke Medical Camp', lat: 11.2030, lng: 75.8320, capacity: 180, type: 'Medical Camp' },
  { id: 'sc-7', name: 'Ramanattukara Rescue Home', lat: 11.1878, lng: 75.8585, capacity: 150, type: 'Rescue Home' },
  { id: 'sc-8', name: 'Beypore Community Hall', lat: 11.1725, lng: 75.8130, capacity: 350, type: 'Camp' },
  { id: 'sc-9', name: 'Medical College Relief Camp', lat: 11.2590, lng: 75.7710, capacity: 600, type: 'Medical Camp' },
  { id: 'sc-10', name: 'Kalanthode Rescue Home', lat: 11.3130, lng: 75.8650, capacity: 200, type: 'Rescue Home' },
];

module.exports = SAFETY_CAMPS;

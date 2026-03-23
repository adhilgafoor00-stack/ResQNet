# Design Doc: Ambulance MERN Map Application

## Goal
A simple web application for coordinating ambulance services. It includes a patient interface to request an ambulance and a driver interface to view and manage requests on a map.

## Architecture
- **Tech Stack:** MERN (MongoDB, Express, React, Node.js)
- **Map Provider:** Leaflet with OpenStreetMap
- **State Management:** React Context API (if needed) or simple props
- **Communication:** REST API (Node/Express to React)

## Components
### Backend
- **Express Server:** Handles API requests.
- **MongoDB Models:**
  - `Ambulance`: id, name, licensePlate, currentLat, currentLng, status (Available, Busy)
  - `Request`: id, patientName, pickupLat, pickupLng, status (Pending, Accepted, Completed)
- **Endpoints:**
  - `GET /api/ambulances`: List available ambulances
  - `POST /api/requests`: Create a new ambulance request
  - `GET /api/requests`: List all requests (for drivers)

### Frontend
- **Map Component:** Displays current location, available ambulances, and active requests.
- **Request Form:** Simple form for patients to provide their name and request an ambulance.
- **Driver Dashboard:** List of pending requests with "Accept" functionality.

## Data Flow
1. Patient submits request via form.
2. Backend saves request to MongoDB.
3. Driver sees new request on their dashboard.
4. Driver accepts request, updating request status.
5. Location updates (simulated or manual for simplicity).

## Testing
- Manual verification of form submission.
- API endpoint testing via browser or curl.
- Visual verification of map markers.

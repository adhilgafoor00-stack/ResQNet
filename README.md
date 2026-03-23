# ResQNet — Unified Emergency Coordination Platform

> Built for Kerala, India. Built for when everything else fails.

## Architecture
```
resqnet/
├── backend/          Node.js + Express + MongoDB + Socket.io
├── dispatcher-web/   React + Vite + Leaflet.js (laptop web app)
└── mobile/           React Native + Expo (Android — all 4 roles)
```

## Demo Credentials (OTP for all: `1234`)

| Role | Phone | Name |
|------|-------|------|
| Dispatcher | +919000000001 | Control Room — Kozhikode |
| Driver (Ambulance) | +919000000002 | Arun Kumar |
| Driver (Fire) | +919000000003 | Suresh Nair |
| Driver (Rescue) | +919000000004 | Biju Thomas |
| Driver (Police) | +919000000005 | Rajan Pillai |
| Community | +919000000006 | Arjun — Mavoor Road |
| Citizen | +919000000007 | Meera — Flood Victim |

## Quick Start

### 1. Backend
```bash
cd backend
cp .env.example .env        # Add your MONGODB_URI and JWT_SECRET
npm install
npm run seed                # Creates 7 demo users
npm run dev                 # Starts on port 5000
```

### 2. Dispatcher Web
```bash
cd dispatcher-web
npm install
npm run dev                 # Opens on localhost:5173
# Login with +919000000001 / OTP: 1234
```

### 3. Mobile App
```bash
cd mobile
npm install
npx expo start              # Scan QR with Expo Go on Android
# Login with any demo phone + OTP: 1234
```

## Environment Variables (`backend/.env`)
```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/resqnet
JWT_SECRET=your_secret
DEMO_MODE=true
ORS_API_KEY=          # Optional: OpenRouteService key for AI rerouting
```

## Tech Stack
- **Backend**: Node.js, Express, MongoDB, Socket.io, JWT, Multer
- **Web**: React, Vite, Leaflet.js, Zustand, Socket.io-client
- **Mobile**: React Native, Expo, react-navigation, react-native-maps, zustand
- **Maps**: CartoDB dark tiles (free), OSRM routing (free), OpenRouteService rerouting
- **Auth**: OTP login — demo OTP hardcoded `1234` when `DEMO_MODE=true`

## Features
- ✅ OTP authentication with 30-day JWT sessions
- ✅ SOS reporting (hold 3s button, GPS, status picker)
- ✅ Live map (dispatcher) — dark Leaflet tiles, custom SVG pins
- ✅ Vehicle dispatch with Haversine-based 500m community alerts
- ✅ Real-time GPS tracking every 3s via Socket.io
- ✅ Traffic blocks with circle visualization and AI rerouting (ORS)
- ✅ Voice broadcast (dispatcher) → all responders (expo-av)
- ✅ Community alerts with 5x vibration + full-screen overlay
- ✅ Offline queue with AsyncStorage + NetInfo auto-sync
- ✅ SMS fallback: zero connectivity → native SMS with pre-filled SOS
- ✅ Driver keep-awake (expo-keep-awake) during active dispatch

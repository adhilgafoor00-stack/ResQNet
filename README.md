<div align="center">

# 🚑 ResQNet

**Unified Emergency Coordination Platform**

*Built for Kerala, India. Built for when everything else fails.*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-Backend-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-Dispatcher_Web-blue.svg)](https://reactjs.org/)
[![React Native](https://img.shields.io/badge/React_Native-Mobile-blue.svg)](https://reactnative.dev/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Database-success.svg)](https://www.mongodb.com/)

</div>

<br />

## 📖 Table of Contents
- [About the Project](#-about-the-project)
- [Architecture](#-architecture)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation & Setup](#installation--setup)
- [Demo Credentials](#-demo-credentials)
- [Environment Variables](#-environment-variables)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🎯 About the Project

**ResQNet** is a robust, real-time emergency coordination platform designed to bridge the gap between citizens in distress, emergency responders, and dispatchers. Built specifically for high-stress scenarios where network connectivity might be limited, it ensures that every SOS call is tracked, assigned, and responded to efficiently.

## 🏗 Architecture

The platform consists of three main components:

```mermaid
graph TD;
    A[Mobile App - React Native] <-->|Socket.io / REST| B(Backend Server - Node.js);
    C[Dispatcher Web - React] <-->|Socket.io / REST| B;
    B <--> D[(MongoDB)];
```

| Component | Description | Technologies |
| :--- | :--- | :--- |
| **Backend** | Central API and WebSocket server | Node.js, Express, MongoDB, Socket.io |
| **Dispatcher Web** | Control room interface for managing SOS and units | React, Vite, Leaflet.js |
| **Mobile App** | Unified app for responders, community volunteers, and citizens | React Native, Expo |

## ✨ Features

- **🔐 Secure Authentication**: OTP-based login with automatic demo fallback and 30-day JWT sessions.
- **🚨 Instant SOS Reporting**: Hold-to-SOS functionality with GPS location and customizable status tags.
- **🗺 Live Tracking & Dispatch**: Real-time vehicle location tracking (every 3s) and map visualization utilizing CartoDB dark tiles.
- **🚧 Smart Routing**: AI-powered rerouting via OpenRouteService (ORS) to avoid user-reported traffic blocks.
- **🎙 Voice Broadcasting**: Control room can broadcast voice messages to all field responders instantly.
- **🔔 Community Proximity Alerts**: Nearby community members get 5x vibration and full-screen alerts for incidents within a 500m radius.
- **📶 Offline Resilience**: AsyncStorage queueing with auto-sync when online, paired with a native SMS fallback system when data connectivity is completely lost.
- **🔋 Device Optimization**: Integrated keep-awake mechanisms for drivers during active dispatches.

## 🛠 Tech Stack

- **Backend**: Node.js, Express, MongoDB, Socket.io, JWT, Multer
- **Frontend (Web)**: React, Vite, TailwindCSS, Zustand, Socket.io-client, Leaflet.js
- **Mobile (App)**: React Native, Expo, React Navigation, React Native Maps, Zustand, Expo-AV, Expo-Keep-Awake
- **Mapping & Routing**: CartoDB dark tiles, OSRM routing, OpenRouteService rerouting

---

## 🚀 Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- [MongoDB](https://www.mongodb.com/) (Local or Atlas)
- [Expo Go](https://expo.dev/client) app installed on your mobile device (for Android/iOS testing)

### Installation & Setup

#### 1. Backend

```bash
cd backend

# Copy environment variables template
cp .env.example .env

# Install dependencies
npm install

# Seed the database with demo users
npm run seed

# Start the development server (runs on port 5000)
npm run dev
```

#### 2. Dispatcher Web App

```bash
cd dispatcher-web

# Install dependencies
npm install

# Start the development server
npm run dev
```
> The web app will be available at `http://localhost:5173`.  
> Login with phone `+919000000001` and OTP `1234`.

#### 3. Mobile App

```bash
cd mobile

# Install dependencies
npm install

# Start the Expo development server
npx expo start
```
> Scan the generated QR code using the Expo Go app on your Android/iOS device.  
> Login using any of the demo phone numbers and OTP `1234`.

---

## 🔑 Demo Credentials

When `DEMO_MODE=true` is set in the backend `.env`, the OTP for all the following accounts is hardcoded to `1234`.

| Role | Phone Number | Name / Description |
| :--- | :--- | :--- |
| **Dispatcher** | `+919000000001` | Control Room — Kozhikode |
| **Ambulance Driver** | `+919000000002` | Arun Kumar |
| **Fire Rescue Driver** | `+919000000003` | Suresh Nair |
| **Rescue Driver** | `+919000000004` | Biju Thomas |
| **Police Driver** | `+919000000005` | Rajan Pillai |
| **Community Volunteer** | `+919000000006` | Arjun — Mavoor Road |
| **Citizen** | `+919000000007` | Meera — Flood Victim |

---

## ⚙️ Environment Variables

Create a `.env` file in the `backend/` directory using the `.env.example` as a reference.

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | The port on which the backend server runs | `5000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/resqnet` |
| `JWT_SECRET` | Secret key for signing JSON Web Tokens | `your_secret` |
| `DEMO_MODE` | Enables hardcoded OTPs for demo accounts | `true` |
| `ORS_API_KEY` | *(Optional)* OpenRouteService key for AI rerouting | `null` |

---

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

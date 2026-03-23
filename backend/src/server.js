require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Import routes
const authRoutes = require('./routes/auth');
const sosRoutes = require('./routes/sos');
const vehicleRoutes = require('./routes/vehicles');
const dispatchRoutes = require('./routes/dispatch');
const trafficRoutes = require('./routes/traffic');
const broadcastRoutes = require('./routes/broadcast');
const adminRoutes = require('./routes/admin');
const routeRoutes = require('./routes/route');
const { router: disasterRouter, setIo: setDisasterIo } = require('./routes/disaster');

// Import middleware
const errorHandler = require('./middleware/errorHandler');

// Import socket handlers
const { registerSocketHandlers } = require('./socket/handlers');

const app = express();
const server = http.createServer(app);

// Socket.io setup with CORS
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE']
  }
});

// Make io accessible to routes via req.app.get('io')
app.set('io', io);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded voice files statically
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// API Routes — match spec exactly
app.use('/api/auth', authRoutes);
app.use('/api/sos', sosRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/dispatch', dispatchRoutes);
app.use('/api/traffic', trafficRoutes);
app.use('/api/broadcast', broadcastRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/route', routeRoutes);
app.use('/api/disaster', disasterRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'ResQNet API is running', timestamp: new Date() });
});

// Error handler (must be last)
app.use(errorHandler);

// Register Socket.io event handlers
registerSocketHandlers(io);

// Give disaster router access to io for broadcasting
setDisasterIo(io);

// MongoDB connection + server start
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/resqnet';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 ResQNet server running on port ${PORT} (all interfaces)`);
      console.log(`📡 Socket.io ready`);
      console.log(`🔧 Demo mode: ${process.env.DEMO_MODE === 'true' ? 'ON (OTP: 1234)' : 'OFF'}`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });

module.exports = { app, server, io };

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const { Ambulance, Request } = require('./models');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ambulance_db')
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.log(err));

// Routes
app.get('/api/ambulances', async (req, res) => {
  try {
    const ambulances = await Ambulance.find();
    res.json(ambulances);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/requests', async (req, res) => {
  const { patientName, pickupLat, pickupLng } = req.body;
  const newRequest = new Request({ patientName, pickupLat, pickupLng });
  try {
    const savedRequest = await newRequest.save();
    res.status(201).json(savedRequest);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.get('/api/requests', async (req, res) => {
  try {
    const requests = await Request.find().populate('ambulanceId');
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

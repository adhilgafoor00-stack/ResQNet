require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/resqnet';

const demoUsers = [
  {
    name: 'Control Room — Kozhikode',
    phone: '+919000000001',
    role: 'dispatcher',
    vehicleType: null,
    vehicleNumber: null,
    location: { lat: 11.2588, lng: 75.7804 },
    isActive: true
  },
  {
    name: 'Arun Kumar',
    phone: '+919000000002',
    role: 'driver',
    vehicleType: 'ambulance',
    vehicleNumber: 'KL-11 A 1234',
    location: { lat: 11.2600, lng: 75.7830 },
    isActive: false
  },
  {
    name: 'Suresh Nair',
    phone: '+919000000003',
    role: 'driver',
    vehicleType: 'fire',
    vehicleNumber: 'KL-11 B 5678',
    location: { lat: 11.2550, lng: 75.7760 },
    isActive: false
  },
  {
    name: 'Biju Thomas',
    phone: '+919000000004',
    role: 'driver',
    vehicleType: 'rescue',
    vehicleNumber: 'NDRF Unit 3',
    location: { lat: 11.2520, lng: 75.7700 },
    isActive: false
  },
  {
    name: 'Rajan Pillai',
    phone: '+919000000005',
    role: 'driver',
    vehicleType: 'police',
    vehicleNumber: 'KL-07 C 9999',
    location: { lat: 11.2650, lng: 75.7850 },
    isActive: false
  },
  {
    name: 'Arjun — Mavoor Road',
    phone: '+919000000006',
    role: 'community',
    vehicleType: null,
    vehicleNumber: null,
    location: { lat: 11.2610, lng: 75.7820 },
    isActive: true
  },
  {
    name: 'Meera — Flood Victim',
    phone: '+919000000007',
    role: 'citizen',
    vehicleType: null,
    vehicleNumber: null,
    location: { lat: 11.2500, lng: 75.7750 },
    isActive: false
  }
];

async function seed() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB connected');

    // Clear existing users
    await User.deleteMany({});
    console.log('🗑️  Cleared existing users');

    // Insert demo users
    const created = await User.insertMany(demoUsers);
    console.log(`✅ Seeded ${created.length} demo users:\n`);

    created.forEach(user => {
      console.log(`  ${user.role.padEnd(12)} | ${user.phone} | ${user.name}${user.vehicleNumber ? ' | ' + user.vehicleNumber : ''}`);
    });

    console.log('\n🔑 OTP for all accounts: 1234');
    console.log('✅ Seed complete!');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error.message);
    process.exit(1);
  }
}

seed();

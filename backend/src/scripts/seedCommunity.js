/**
 * Seed 10 community members along major Kozhikode ambulance corridors.
 * Login: phone number below + OTP 1234 (DEMO_MODE=true)
 *
 * Run with: node src/scripts/seedCommunity.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const MEMBERS = [
  // Corridor 1: Medical College → Baby Memorial (via PTP Nagar / Calicut Univerity Road)
  { name: 'Arjun Nair',       phone: '9400001001', lat: 11.2575, lng: 75.7712 }, // Near Medical College
  { name: 'Divya Menon',      phone: '9400001002', lat: 11.2600, lng: 75.7740 }, // PTP Nagar junction
  { name: 'Sreejith Kumar',   phone: '9400001003', lat: 11.2625, lng: 75.7780 }, // Kovoor Rd
  { name: 'Aishwarya Pillai', phone: '9400001004', lat: 11.2650, lng: 75.7805 }, // Westhill junction
  { name: 'Rahul Varma',      phone: '9400001005', lat: 11.2615, lng: 75.7830 }, // Near Baby Memorial Hospital

  // Corridor 2: Medical College → MIMS (via Mavoor Road / Puthiyara)
  { name: 'Meera Krishnan',   phone: '9400001006', lat: 11.2555, lng: 75.7785 }, // Mananchira
  { name: 'Vishnu Raj',       phone: '9400001007', lat: 11.2590, lng: 75.7810 }, // Mavoor Rd
  { name: 'Anitha Thomas',    phone: '9400001008', lat: 11.2650, lng: 75.7750 }, // Puthiyara Rd
  { name: 'Faiz Mohammed',    phone: '9400001009', lat: 11.2700, lng: 75.7780 }, // Near MIMS
  { name: 'Priya Sharma',     phone: '9400001010', lat: 11.2730, lng: 75.7790 }, // Near ASTER MIMS Kozhikode
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  let created = 0;
  let skipped = 0;

  for (const m of MEMBERS) {
    const existing = await User.findOne({ phone: m.phone });
    if (existing) {
      console.log(`  ⚠️  Skipping ${m.name} (${m.phone}) — already exists`);
      skipped++;
      continue;
    }

    await User.create({
      name: m.name,
      phone: m.phone,
      role: 'community',
      location: { lat: m.lat, lng: m.lng },
      isActive: true,
    });
    console.log(`  ✅ Created ${m.name} at (${m.lat}, ${m.lng})`);
    created++;
  }

  console.log(`\nDone! Created: ${created}, Skipped (already exist): ${skipped}`);
  console.log('\n📱 Login credentials:');
  MEMBERS.forEach(m => console.log(`  ${m.name.padEnd(20)} Phone: ${m.phone}  OTP: 1234`));

  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});

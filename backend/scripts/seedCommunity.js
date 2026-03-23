/**
 * seedCommunity.js — Seeds 20 community members across Kozhikode
 * Run: node scripts/seedCommunity.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/resqnet';

const COMMUNITY_MEMBERS = [
  { name: 'Rahul K M',       phone: '9447001001', area: 'Koduvally Medical College',  lat: 11.3645, lng: 75.9082 },
  { name: 'Sneha Nair',      phone: '9447001002', area: 'Koduvally Town',              lat: 11.3710, lng: 75.9101 },
  { name: 'Arun P V',        phone: '9447001003', area: 'Puthiya Stand Kozhikode',     lat: 11.2489, lng: 75.7720 },
  { name: 'Meera S',         phone: '9447001004', area: 'Puthiya Stand West',          lat: 11.2502, lng: 75.7735 },
  { name: 'Jibran A',        phone: '9447001005', area: 'Kattangal',                   lat: 11.1955, lng: 75.8340 },
  { name: 'Divya R',         phone: '9447001006', area: 'Kattangal North',             lat: 11.1973, lng: 75.8361 },
  { name: 'Mohammed Faiz',   phone: '9447001007', area: 'Kalanthode',                  lat: 11.3120, lng: 75.8645 },
  { name: 'Athira C',        phone: '9447001008', area: 'Kalanthode Main Road',        lat: 11.3145, lng: 75.8672 },
  { name: 'Sreehari N',      phone: '9447001009', area: 'Kulimad Road',                lat: 11.2645, lng: 75.7985 },
  { name: 'Fathima Z',       phone: '9447001010', area: 'Kulimad Road South',          lat: 11.2631, lng: 75.7968 },
  { name: 'Vishnu P',        phone: '9447001011', area: 'Govt Medical College Kzd',    lat: 11.2582, lng: 75.7700 },
  { name: 'Anitha M',        phone: '9447001012', area: 'Medical College Campus',      lat: 11.2595, lng: 75.7715 },
  { name: 'Abin T',          phone: '9447001013', area: 'Chevayur',                    lat: 11.2740, lng: 75.8010 },
  { name: 'Priya V',         phone: '9447001014', area: 'Chevayur Center',             lat: 11.2762, lng: 75.8025 },
  { name: 'Shameer K',       phone: '9447001015', area: 'Feroke',                      lat: 11.2024, lng: 75.8312 },
  { name: 'Lekha R',         phone: '9447001016', area: 'Feroke Main Road',            lat: 11.2041, lng: 75.8327 },
  { name: 'Renjith C',       phone: '9447001017', area: 'Ramanattukara',               lat: 11.1870, lng: 75.8580 },
  { name: 'Swathi A',        phone: '9447001018', area: 'Ramanattukara Bus Stand',     lat: 11.1885, lng: 75.8596 },
  { name: 'Bilal M',         phone: '9447001019', area: 'Beypore',                     lat: 11.1720, lng: 75.8125 },
  { name: 'Anjali S',        phone: '9447001020', area: 'Beypore Harbour',             lat: 11.1738, lng: 75.8148 },
];

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB:', MONGO_URI);

  let created = 0, skipped = 0;

  for (const m of COMMUNITY_MEMBERS) {
    const existing = await User.findOne({ phone: m.phone });
    if (existing) {
      // Update location in case it was null
      await User.updateOne({ phone: m.phone }, { location: { lat: m.lat, lng: m.lng }, isActive: true });
      console.log(`  ✏️  Updated ${m.name} — ${m.area}`);
      skipped++;
      continue;
    }

    await User.create({
      name: m.name,
      phone: m.phone,
      role: 'community',
      isActive: true,
      location: { lat: m.lat, lng: m.lng },
    });
    console.log(`  ➕ ${m.name} — ${m.area} (${m.lat}, ${m.lng})`);
    created++;
  }

  console.log(`\n🎉 Done: ${created} created, ${skipped} already existed/updated`);
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch(e => { console.error('❌ Seed failed:', e.message); process.exit(1); });

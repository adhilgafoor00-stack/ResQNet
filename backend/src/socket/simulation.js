const User = require('../models/User');
const Vehicle = require('../models/Vehicle');

// vehicleId (string) → setInterval ID
const activeSimulations = new Map();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Move (lat,lng) toward (targetLat,targetLng) by distanceKm
function moveToward(lat, lng, targetLat, targetLng, distanceKm) {
  const totalDist = getDistanceKm(lat, lng, targetLat, targetLng);
  if (totalDist <= distanceKm) return { lat: targetLat, lng: targetLng };
  const ratio = distanceKm / totalDist;
  return {
    lat: lat + (targetLat - lat) * ratio,
    lng: lng + (targetLng - lng) * ratio,
  };
}

// ---------------------------------------------------------------------------
// Main simulation
// ---------------------------------------------------------------------------
/**
 * Simulate ambulance movement toward destination.
 *
 * Speed: 1 km / min  →  every 3 s the vehicle moves 0.05 km (50 m)
 *
 * Proximity alerts emitted to ALL clients via io.emit:
 *   alertLevel 'community_alert'  once per user when they enter 10 km radius
 *   alertLevel '5km'              once per user when they enter 5 km radius
 */
async function startVehicleSimulation(io, vehicleId, startLat, startLng, destLat, destLng, vehicleType) {
  stopVehicleSimulation(vehicleId); // cancel any previous run

  let curLat = startLat;
  let curLng = startLng;

  const STEP_KM = 5 / 20;          // 5 km/min ÷ 20 ticks/min  = 0.25 km per tick (fast demo)
  const TICK_MS = 3000;             // tick every 3 seconds

  // Per-simulation sets to track which users already received each alert
  const alerted10km = new Set();
  const alerted5km  = new Set();

  console.log(`[Simulation] ▶ Vehicle ${vehicleId} | ${startLat.toFixed(5)},${startLng.toFixed(5)} → ${destLat.toFixed(5)},${destLng.toFixed(5)}`);

  const interval = setInterval(async () => {
    try {
      // ── 1. Advance position by one step ──────────────────────────────────
      const next = moveToward(curLat, curLng, destLat, destLng, STEP_KM);
      curLat = next.lat;
      curLng = next.lng;

      // ── 2. Persist to DB ─────────────────────────────────────────────────
      await Vehicle.findByIdAndUpdate(vehicleId, {
        location: { lat: curLat, lng: curLng }
      });

      // ── 3. Broadcast live position (dispatcher map + mobile community) ───
      io.emit('vehicle:moved', {
        vehicleId,
        lat: curLat,
        lng: curLng,
        vehicleType,
      });

      // ── 4. Proximity checks against community users ───────────────────────
      const communityUsers = await User.find({
        role: 'community',
        'location.lat': { $exists: true, $ne: null },
        'location.lng': { $exists: true, $ne: null },
      });

      communityUsers.forEach(u => {
        const uid = u._id.toString();
        const dist = getDistanceKm(u.location.lat, u.location.lng, curLat, curLng);

        // 10 km alert — inform, light vibration
        if (dist <= 10 && dist > 5 && !alerted10km.has(uid)) {
          alerted10km.add(uid);
          io.emit('alert:community', {
            vehicleType,
            alertLevel: '10km',
            lat: curLat,
            lng: curLng,
            message: `🚑 Emergency vehicle is 10 km away`,
          });
          console.log(`[Simulation] 📢 10km alert → user ${uid} (dist: ${dist.toFixed(2)} km)`);
        }

        // 5 km alert — ring bells, heavy vibration
        if (dist <= 5 && !alerted5km.has(uid)) {
          alerted5km.add(uid);
          io.emit('alert:community', {
            vehicleType,
            alertLevel: '5km',
            lat: curLat,
            lng: curLng,
            message: `🚨 Emergency vehicle is 5 km away — clear the road!`,
          });
          console.log(`[Simulation] 🔔 5km BELL alert → user ${uid} (dist: ${dist.toFixed(2)} km)`);
        }
      });

      // Also alert non-community / all users without stored location at 10km / 5km
      // by doing a global broadcast checked against threshold crossing for the vehicle
      // (handles users who have NOT registered their position yet)
      const distToDest = getDistanceKm(curLat, curLng, destLat, destLng);
      const distFromStart = getDistanceKm(startLat, startLng, curLat, curLng);

      // Cross the 10 km-from-destination mark → fire a global alert for all untracked users
      if (!activeSimulations.get(vehicleId.toString())?._fired10km && distToDest <= 10 && distToDest > 5) {
        const sim = activeSimulations.get(vehicleId.toString());
        if (sim && !sim._fired10km) {
          sim._fired10km = true;
          io.emit('alert:community', {
            vehicleType,
            alertLevel: '10km',
            lat: curLat,
            lng: curLng,
            message: `🚑 Emergency vehicle is 10 km from destination`,
          });
        }
      }
      if (!activeSimulations.get(vehicleId.toString())?._fired5km && distToDest <= 5) {
        const sim = activeSimulations.get(vehicleId.toString());
        if (sim && !sim._fired5km) {
          sim._fired5km = true;
          io.emit('alert:community', {
            vehicleType,
            alertLevel: '5km',
            lat: curLat,
            lng: curLng,
            message: `🚨 Emergency vehicle is 5 km from destination — clear the road!`,
          });
        }
      }

      // ── 5. Arrival check ─────────────────────────────────────────────────
      if (distToDest < 0.05) { // within 50 m
        await Vehicle.findByIdAndUpdate(vehicleId, {
          status: 'arrived',
          location: { lat: destLat, lng: destLng },
          arrivedAt: new Date(),
        });
        io.emit('vehicle:arrived', { vehicleId, lat: destLat, lng: destLng });
        io.emit('alert:community', {
          vehicleType,
          alertLevel: 'arrived',
          lat: destLat,
          lng: destLng,
          message: `✅ Emergency vehicle has arrived at destination`,
        });
        stopVehicleSimulation(vehicleId);
        console.log(`[Simulation] ✅ Vehicle ${vehicleId} arrived`);
      }
    } catch (err) {
      console.error('[Simulation] Error:', err.message);
    }
  }, TICK_MS);

  // Store handle with metadata flags
  interval._fired10km = false;
  interval._fired5km  = false;
  activeSimulations.set(vehicleId.toString(), interval);
}

function stopVehicleSimulation(vehicleId) {
  const id = vehicleId.toString();
  if (activeSimulations.has(id)) {
    clearInterval(activeSimulations.get(id));
    activeSimulations.delete(id);
    console.log(`[Simulation] ⏹ Stopped for vehicle ${id}`);
  }
}

module.exports = { startVehicleSimulation, stopVehicleSimulation };

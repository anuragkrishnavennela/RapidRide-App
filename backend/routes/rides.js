const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const { findUserByFirebaseAuth } = require('../helpers/user');
const store = require('../data/store');
const fastapi = require('../services/fastapi');
const redis = require('../services/redis');
const { admin, firebaseInitialized } = require('../config/firebase');
const { firebaseAuthMiddleware } = require('../middleware/auth');
const { findUserByFirebaseAuth } = require('../helpers/user');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET must be set in production');
}

// DEBUG: Clear all active rides (Temporary)
router.post('/clear-active', firebaseAuthMiddleware, async (req, res) => {
  try {
    const Ride = require('../models/ride');
    const result = await Ride.updateMany(
      { status: { $in: ['requested', 'accepted', 'arrived', 'started'] } },
      { $set: { status: 'cancelled' } }
    );
    console.log(`🧹 Debug: Cleared ${result.modifiedCount} active rides by ${req.user.email}`);
    res.json({ success: true, count: result.modifiedCount });
  } catch (error) {
    console.error('Failed to clear rides:', error);
    res.status(500).json({ error: 'Failed to clear rides' });
  }
});

// POST /api/rides/estimate - Get fare estimate before booking
router.post('/estimate', [
  firebaseAuthMiddleware,
  body('pickup.lat').isFloat({ min: -90, max: 90 }).withMessage('Invalid pickup latitude'),
  body('pickup.lng').isFloat({ min: -180, max: 180 }).withMessage('Invalid pickup longitude'),
  body('destination.lat').isFloat({ min: -90, max: 90 }).withMessage('Invalid destination latitude'),
  body('destination.lng').isFloat({ min: -180, max: 180 }).withMessage('Invalid destination longitude'),
  body('traffic_level').optional().isFloat({ min: 0.5, max: 3.0 }).withMessage('Traffic level must be between 0.5 and 3.0')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  try {
    const { pickup, destination } = req.body;

    if (!pickup || !destination) {
      return res.status(400).json({ message: 'Pickup and destination required' });
    }

    const traffic = req.body.traffic_level || 1.0;

    // Check Redis cache first
    const cacheKey = redis.estimateKey(pickup, destination, traffic);
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log('✅ Estimate cache hit');
      return res.json(cached);
    }

    // Get fare and ETA from FastAPI
    const [fareData, etaData] = await Promise.all([
      fastapi.calculateFare({
        origin: pickup,
        destination: destination,
        traffic_level: traffic
      }),
      fastapi.predictETA({
        origin: pickup,
        destination: destination,
        traffic_level: traffic
      })
    ]);

    const result = {
      fare: fareData.fare,
      distance_km: fareData.distance_km,
      currency: fareData.currency,
      eta_seconds: etaData.eta_seconds,
      eta_minutes: Math.round(etaData.eta_seconds / 60),
      confidence: etaData.confidence
    };

    // Cache the result
    await redis.set(cacheKey, result, redis.TTL.ESTIMATE);

    res.json(result);
  } catch (error) {
    console.error('Estimate error:', error);
    res.status(500).json({ message: 'Failed to calculate estimate' });
  }
});

// Vehicle type mapping: rider selection -> driver vehicle types
const VEHICLE_TYPE_MAPPING = {
  'bike': ['Bike', 'Scooter'],
  'auto': ['Auto', 'Rickshaw'],
  'car': ['Sedan', 'Hatchback'],
  'suv': ['SUV'],
  'carpool': ['Sedan', 'Hatchback', 'SUV'],
  'shuttle': ['SUV', 'Van', 'Minibus']
};

// POST /api/driver/location - Update driver location
router.post('/location', firebaseAuthMiddleware, async (req, res) => {
  try {
    const User = require('../models/user');
    // Accept both { location: { lat, lng } } and { lat, lng }
    const location = req.body.location || req.body;

    if (!location || !location.lat || !location.lng) {
      return res.status(400).json({ message: 'Location coordinates required' });
    }

    // Find driver - USE FIREBASE UID
    const driver = await findUserByFirebaseAuth(req.user);

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    // Update driver's current location
    driver.currentLocation = {
      lat: location.lat,
      lng: location.lng,
      lastUpdated: new Date()
    };
    // Sanitize createdAt to fix "Cast to date failed"
    if (driver.createdAt && typeof driver.createdAt === 'object' && driver.createdAt.$date) {
      console.log('Fixing corrupted createdAt for driver:', driver._id);
      driver.createdAt = new Date(driver.createdAt.$date);
    }
    await driver.save();

    // Broadcast location update via Socket.IO if needed
    const io = req.app.get('io');
    if (io) {
      io.emit('driver:location-update', {
        driverId: driver._id,
        location: {
          lat: location.lat,
          lng: location.lng
        }
      });
    }

    res.json({ message: 'Location updated successfully' });
  } catch (error) {
    console.error('Location update error:', error);
    res.status(500).json({ message: 'Failed to update location', error: error.message, details: error.errors });
  }
});

// POST /api/rides/request
router.post('/request', firebaseAuthMiddleware, async (req, res) => {
  try {
    const Ride = require('../models/ride');
    const User = require('../models/user');

    const { pickup, destination, payment_method, vehicleType, scheduled, scheduledTime } = req.body;

    if (!pickup || !destination) {
      return res.status(400).json({ message: 'Pickup and destination required' });
    }

    // Get user from database - USE FIREBASE UID
    const user = await findUserByFirebaseAuth(req.user);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Calculate fare and ETA using FastAPI
    const [fareData, etaData] = await Promise.all([
      fastapi.calculateFare({
        origin: pickup,
        destination: destination,
        traffic_level: req.body.traffic_level || 1.0
      }),
      fastapi.predictETA({
        origin: pickup,
        destination: destination,
        traffic_level: req.body.traffic_level || 1.0
      })
    ]);

    // Create ride in MongoDB
    const ride = new Ride({
      riderId: user._id,
      pickup: {
        address: pickup.address || `${pickup.lat}, ${pickup.lng}`,
        lat: pickup.lat,
        lng: pickup.lng
      },
      destination: {
        address: destination.address || `${destination.lat}, ${destination.lng}`,
        lat: destination.lat,
        lng: destination.lng
      },
      vehicleType: vehicleType || 'Car',
      fare: Math.round(fareData.fare),
      distance: fareData.distance_km,
      duration: Math.round(etaData.eta_seconds / 60),
      paymentMethod: payment_method || 'cash',
      scheduled: scheduled || false,
      scheduledTime: scheduledTime || null,
      status: 'requested'
    });

    await ride.save();
    console.log('✅ Ride saved to MongoDB:', ride._id);

    // Store in memory for backward compatibility and quick access
    const rideData = {
      id: ride._id.toString(),
      user: user.email || user.phone,
      status: 'searching',
      driver: null,
      pickup,
      destination,
      fare: ride.fare,
      distance_km: ride.distance,
      estimated_eta: etaData.eta_seconds,
      payment_method: ride.paymentMethod,
      createdAt: (ride.createdAt instanceof Date ? ride.createdAt : new Date()).toISOString()
    };

    store.rides.push(rideData);

    // Broadcast ride request to matching online drivers
    const io = req.app.get('io');
    const onlineDrivers = req.app.get('onlineDrivers');

    if (io && onlineDrivers) {
      const requestedVehicleType = vehicleType || 'Car';
      const matchingDriverTypes = VEHICLE_TYPE_MAPPING[requestedVehicleType.toLowerCase()] || ['Sedan'];

      console.log(`🔍 Broadcasting ride to drivers with: ${matchingDriverTypes.join(', ')}`);

      let broadcastCount = 0;
      for (const [driverId, driverData] of onlineDrivers.entries()) {
        // Check if driver's vehicle type matches
        if (matchingDriverTypes.includes(driverData.vehicleType)) {
          io.to(driverData.socketId).emit('ride:new-request', {
            rideId: ride._id.toString(),
            riderId: user._id.toString(),
            riderName: user.name,
            pickup: {
              address: pickup.address || `${pickup.lat}, ${pickup.lng}`,
              lat: pickup.lat,
              lng: pickup.lng
            },
            destination: {
              address: destination.address || `${destination.lat}, ${destination.lng}`,
              lat: destination.lat,
              lng: destination.lng
            },
            vehicleType: ride.vehicleType,
            fare: ride.fare,
            distance: ride.distance,
            duration: ride.duration,
            createdAt: ride.createdAt
          });
          broadcastCount++;
        }
      }

      console.log(`✅ Broadcasted to ${broadcastCount} matching drivers`);
    }

    res.json({
      success: true,
      ride: rideData,
      rideId: ride._id.toString()
    });
  } catch (error) {
    console.error('Request ride error:', error);
    res.status(500).json({ message: 'Failed to request ride: ' + error.message });
  }
});

// GET /api/rides/current - KEY FIX FOR NAME DISPLAY BUG
router.get('/current', firebaseAuthMiddleware, async (req, res) => {
  try {
    const Ride = require('../models/ride');
    const User = require('../models/user');

    // Find user by Firebase UID (primary) or email (fallback) - THIS FIXES THE BUG
    const user = await findUserByFirebaseAuth(req.user);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Find active ride for the user
    const ride = await Ride.findOne({
      riderId: user._id,
      status: { $in: ['requested', 'accepted', 'arrived', 'started'] }
    }).populate('driverId', 'name email phone vehicle license');

    if (!ride) {
      return res.status(404).json({ message: 'No active ride' });
    }

    // Format response with all needed fields
    const response = {
      _id: ride._id,
      status: ride.status,
      pickup: ride.pickup,
      dropoff: ride.destination, // Map destination to dropoff for frontend
      vehicleType: ride.vehicleType,
      fare: ride.fare,
      distance: ride.distance,
      estimatedTime: ride.duration ? ride.duration * 60 : null, // Convert minutes to seconds
      otp: ride.otp || null,
      driver: null
    };

    // Include driver info if assigned
    if (ride.driverId) {
      console.log('🚗 Driver Info - ID:', ride.driverId._id, 'Name:', ride.driverId.name);
      console.log('👤 Rider Info - ID:', user._id, 'Name:', user.name);

      response.driver = {
        name: ride.driverId.name || 'RapidRide Driver',
        phone: ride.driverId.phone,
        email: ride.driverId.email,
        vehicle: ride.driverId.vehicle,
        currentLocation: ride.driverId.currentLocation || null
      };
    }

    res.json(response);
  } catch (error) {
    console.error('Error fetching current ride:', error);
    res.status(500).json({ message: 'Failed to fetch current ride' });
  }
});

// GET /api/rides/history - Get user ride history (MUST be before /:rideId to avoid route collision)
router.get('/history', firebaseAuthMiddleware, async (req, res) => {
  try {
    const Ride = require('../models/ride');
    const User = require('../models/user');

    const limit = parseInt(req.query.limit) || 10;
    const skip = parseInt(req.query.skip) || 0;

    // Get user from database - USE FIREBASE UID
    const user = await findUserByFirebaseAuth(req.user);

    if (!user) {
      return res.json({ rides: [], total: 0 });
    }

    // Fetch rides with pagination
    const [rides, total] = await Promise.all([
      Ride.find({ riderId: user._id })
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .select('pickup destination fare distance vehicleType status createdAt completedAt rating')
        .lean(),
      Ride.countDocuments({ riderId: user._id })
    ]);

    // Format rides for frontend with safe property access
    const formattedRides = rides.map(ride => ({
      id: ride._id,
      pickup: ride.pickup?.address || ride.pickup?.name || 'Unknown location',
      destination: ride.destination?.address || ride.dropoff?.address || 'Unknown destination',
      fare: ride.fare || 0,
      distance: ride.distance || 0,
      vehicleType: ride.vehicleType || 'Car',
      status: ride.status,
      createdAt: ride.createdAt,
      completedAt: ride.completedAt,
      rating: ride.rating
    }));

    res.json({
      rides: formattedRides,
      total,
      hasMore: skip + rides.length < total
    });
  } catch (error) {
    console.error('History error:', error);
    console.error('Error details:', error.message, error.stack);
    res.status(200).json({ rides: [], total: 0 });
  }
});

// GET /api/rides/:rideId - Get specific ride by ID
router.get('/:rideId', firebaseAuthMiddleware, async (req, res) => {
  try {
    const Ride = require('../models/ride');
    const User = require('../models/user');
    const { rideId } = req.params;

    // Find user - USE FIREBASE UID
    const user = await findUserByFirebaseAuth(req.user);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Find ride by ID and ensure it belongs to the user (Rider OR Driver)
    const ride = await Ride.findOne({
      _id: rideId,
      $or: [
        { riderId: user._id },
        { driverId: user._id }
      ]
    }).populate('driverId', 'name email phone vehicle license currentLocation')
      .populate('riderId', 'name phone email');

    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }

    // Format response with all needed fields
    const response = {
      _id: ride._id,
      status: ride.status,
      pickup: ride.pickup,
      dropoff: ride.destination,
      vehicleType: ride.vehicleType,
      fare: ride.fare,
      distance: ride.distance,
      estimatedTime: ride.duration ? ride.duration * 60 : null,
      otp: ride.otp || null,
      driver: null,
      riderName: ride.riderId ? (ride.riderId.name || 'Rider') : 'Rider',
      riderPhone: ride.riderId ? ride.riderId.phone : null
    };

    // Include driver info if assigned
    if (ride.driverId) {
      response.driver = {
        name: ride.driverId.name || 'RapidRide Driver',
        phone: ride.driverId.phone,
        email: ride.driverId.email,
        vehicle: ride.driverId.vehicle,
        currentLocation: ride.driverId.currentLocation || null
      };
    }

    res.json(response);
  } catch (error) {
    console.error('Error fetching ride:', error);
    res.status(500).json({ message: 'Failed to fetch ride' });
  }
});

// GET /api/rides/status
router.get('/status', firebaseAuthMiddleware, (req, res) => {
  const r = store.rides.find(x => x.user === req.user.email);
  if (!r) return res.json({ status: 'searching' });
  res.json({ status: r.status, driver: r.driver });
});

// POST /api/rides/geocode - Reverse geocode coordinates
router.post('/geocode', firebaseAuthMiddleware, async (req, res) => {
  try {
    const { lat, lon } = req.body;

    if (!lat || !lon) {
      return res.status(400).json({ message: 'Latitude and longitude required' });
    }

    const addressData = await fastapi.reverseGeocode(lat, lon);
    res.json(addressData);
  } catch (error) {
    console.error('Geocode error:', error);
    res.status(500).json({ message: 'Failed to geocode' });
  }
});

// GET /api/rides/stats - Get user ride statistics
router.get('/stats', firebaseAuthMiddleware, async (req, res) => {
  try {
    const Ride = require('../models/ride');
    const User = require('../models/user');

    // Get user from database - USE FIREBASE UID
    const user = await findUserByFirebaseAuth(req.user);

    if (!user) {
      return res.json({ totalRides: 0, totalSpent: 0, rating: null });
    }

    // Aggregate ride statistics
    const stats = await Ride.aggregate([
      {
        $match: {
          riderId: user._id,
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          totalRides: { $sum: 1 },
          totalSpent: { $sum: '$fare' },
          avgRating: { $avg: '$rating' }
        }
      }
    ]);

    if (stats.length === 0) {
      return res.json({ totalRides: 0, totalSpent: 0, rating: null });
    }

    res.json({
      totalRides: stats[0].totalRides,
      totalSpent: Math.round(stats[0].totalSpent),
      rating: stats[0].avgRating ? stats[0].avgRating.toFixed(1) : null
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.json({ totalRides: 0, totalSpent: 0, rating: null });
  }
});

// POST /api/rides/:rideId/cancel - Cancel a ride
router.post('/:rideId/cancel', firebaseAuthMiddleware, async (req, res) => {
  try {
    const Ride = require('../models/ride');
    const User = require('../models/user');
    const { rideId } = req.params;

    // Find user - USE FIREBASE UID
    const user = await findUserByFirebaseAuth(req.user);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Find ride
    const ride = await Ride.findOne({
      _id: rideId,
      riderId: user._id
    });

    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }

    // Check if ride can be cancelled
    if (ride.status === 'completed' || ride.status === 'cancelled') {
      return res.status(400).json({ message: 'Ride cannot be cancelled' });
    }

    // Update ride status
    ride.status = 'cancelled';
    await ride.save();

    const io = req.app.get('io');

    // Notify assigned driver if ride was accepted
    if (ride.driverId && io) {
      io.emit('ride:cancelled', {
        rideId: ride._id,
        riderId: user._id,
        driverId: ride.driverId
      });
    }

    // Notify all drivers about status change (for pending requests)
    if (io) {
      io.emit('ride:status-update', {
        rideId: ride._id,
        status: 'cancelled'
      });
    }

    res.json({
      message: 'Ride cancelled successfully',
      ride: {
        _id: ride._id,
        status: ride.status
      }
    });
  } catch (error) {
    console.error('Error cancelling ride:', error);
    res.status(500).json({ message: 'Failed to cancel ride' });
  }
});

// POST /api/rides/:rideId/accept - Driver accepts a ride
router.post('/:rideId/accept', firebaseAuthMiddleware, async (req, res) => {
  try {
    const Ride = require('../models/ride');
    const User = require('../models/user');
    const { rideId } = req.params;

    // Find driver - USE FIREBASE UID
    const driver = await findUserByFirebaseAuth(req.user);

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    // Check if driver already has an active ride
    const activeRide = await Ride.findOne({
      driverId: driver._id,
      status: { $in: ['accepted', 'arrived', 'started'] }
    });

    if (activeRide) {
      return res.status(400).json({
        message: 'You already have an active ride. Complete it before accepting another.',
        activeRideId: activeRide._id
      });
    }

    // Find ride
    const ride = await Ride.findOne({
      _id: rideId,
      status: 'requested'
    });

    if (!ride) {
      return res.status(404).json({ message: 'Ride not found or already accepted' });
    }

    // Populate rider details
    await ride.populate('riderId', 'name phone email');

    // Generate 4-digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    // Update ride with driver and OTP
    console.log('🔧 Assigning driver to ride:');
    console.log('  Driver ID:', driver._id);
    console.log('  Driver Name:', driver.name);
    console.log('  Driver Phone:', driver.phone);
    console.log('  Ride ID:', ride._id);

    ride.driverId = driver._id;
    ride.status = 'accepted';
    ride.otp = otp;
    ride.acceptedAt = new Date();
    await ride.save();

    console.log('✅ Ride saved with driverId:', ride.driverId);

    // Notify rider via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.emit('ride:accepted', {
        rideId: ride._id,
        riderId: ride.riderId._id,
        driver: {
          name: driver.name || 'RapidRide Driver',
          phone: driver.phone,
          vehicle: driver.vehicle,
          currentLocation: driver.currentLocation || null
        },
        otp
      });
    }

    res.json({
      message: 'Ride accepted successfully',
      ride: {
        _id: ride._id,
        status: ride.status,
        otp,
        pickup: ride.pickup,
        destination: ride.destination,
        fare: ride.fare,
        distance: ride.distance,
        duration: ride.duration,
        riderName: ride.riderId.name,
        riderPhone: ride.riderId.phone
      }
    });
  } catch (error) {
    console.error('Error accepting ride:', error);
    res.status(500).json({ message: 'Failed to accept ride' });
  }
});

// POST /api/rides/:rideId/start - Driver starts a ride with OTP verification
router.post('/:rideId/start', firebaseAuthMiddleware, async (req, res) => {
  try {
    const Ride = require('../models/ride');
    const User = require('../models/user');
    const { rideId } = req.params;
    const { otp } = req.body;

    // Find driver - USE FIREBASE UID
    const driver = await findUserByFirebaseAuth(req.user);

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    // Find ride
    const ride = await Ride.findOne({
      _id: rideId,
      driverId: driver._id,
      status: { $in: ['accepted', 'arrived'] }
    });

    if (!ride) {
      return res.status(404).json({ message: 'Ride not found or not in correct state' });
    }

    // Verify OTP
    if (ride.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    // Start ride
    ride.status = 'started';
    ride.startedAt = new Date();
    await ride.save();

    // Notify rider via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.emit('ride:started', {
        rideId: ride._id,
        riderId: ride.riderId
      });
    }

    res.json({
      message: 'Ride started successfully',
      ride: {
        _id: ride._id,
        status: ride.status
      }
    });
  } catch (error) {
    console.error('Error starting ride:', error);
    res.status(500).json({ message: 'Failed to start ride' });
  }
});

// POST /api/rides/:rideId/arrived - Driver marks arrival at pickup
router.post('/:rideId/arrived', firebaseAuthMiddleware, async (req, res) => {
  try {
    const Ride = require('../models/ride');
    const User = require('../models/user');
    const { rideId } = req.params;

    // Find driver - USE FIREBASE UID
    const driver = await findUserByFirebaseAuth(req.user);

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    // Find ride
    const ride = await Ride.findOne({
      _id: rideId,
      driverId: driver._id,
      status: 'accepted'
    });

    if (!ride) {
      return res.status(404).json({ message: 'Ride not found or not in correct state' });
    }

    // Update status
    ride.status = 'arrived';
    await ride.save();

    // Notify rider via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.emit('ride:arrived', {
        rideId: ride._id,
        riderId: ride.riderId
      });
    }

    res.json({
      message: 'Arrival marked successfully',
      ride: {
        _id: ride._id,
        status: ride.status
      }
    });
  } catch (error) {
    console.error('Error marking arrival:', error);
    res.status(500).json({ message: 'Failed to mark arrival' });
  }
});

// POST /api/rides/:rideId/complete - Driver completes a ride
router.post('/:rideId/complete', firebaseAuthMiddleware, async (req, res) => {
  try {
    const Ride = require('../models/ride');
    const User = require('../models/user');
    const { rideId } = req.params;

    // Find driver - USE FIREBASE UID
    const driver = await findUserByFirebaseAuth(req.user);

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    // Find ride
    const ride = await Ride.findOne({
      _id: rideId,
      driverId: driver._id,
      status: 'started'
    });

    if (!ride) {
      return res.status(404).json({ message: 'Ride not found or not in correct state' });
    }

    // Complete ride
    ride.status = 'completed';
    ride.completedAt = new Date();
    await ride.save();

    // Update driver statistics
    if (!driver.stats) {
      driver.stats = {
        totalRides: 0,
        completedRides: 0,
        cancelledRides: 0,
        totalEarnings: 0,
        totalDistance: 0,
        rating: 0,
        totalRatings: 0
      };
    }
    driver.stats.totalRides = (driver.stats.totalRides || 0) + 1;
    driver.stats.completedRides = (driver.stats.completedRides || 0) + 1;
    driver.stats.totalEarnings = (driver.stats.totalEarnings || 0) + (ride.fare || 0);
    driver.stats.totalDistance = (driver.stats.totalDistance || 0) + (ride.distance || 0);
    await driver.save();

    // Update rider statistics
    const rider = await User.findById(ride.riderId);
    if (rider) {
      if (!rider.stats) {
        rider.stats = {
          totalRides: 0,
          completedRides: 0,
          cancelledRides: 0,
          totalEarnings: 0,
          totalDistance: 0,
          rating: 0,
          totalRatings: 0
        };
      }
      rider.stats.totalRides = (rider.stats.totalRides || 0) + 1;
      rider.stats.completedRides = (rider.stats.completedRides || 0) + 1;
      rider.stats.totalEarnings = (rider.stats.totalEarnings || 0) + (ride.fare || 0); // For riders, this represents money spent
      rider.stats.totalDistance = (rider.stats.totalDistance || 0) + (ride.distance || 0);
      await rider.save();
    }

    // Notify rider via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.emit('ride:completed', {
        rideId: ride._id,
        riderId: ride.riderId
      });
    }

    res.json({
      message: 'Ride completed successfully',
      ride: {
        _id: ride._id,
        status: ride.status,
        completedAt: ride.completedAt
      },
      stats: {
        driver: {
          totalRides: driver.stats.totalRides,
          completedRides: driver.stats.completedRides,
          totalEarnings: driver.stats.totalEarnings
        },
        rider: rider ? {
          totalRides: rider.stats.totalRides,
          completedRides: rider.stats.completedRides
        } : null
      }
    });
  } catch (error) {
    console.error('Error completing ride:', error);
    res.status(500).json({ message: 'Failed to complete ride', error: error.message });
  }
});

// POST /api/rides/:rideId/rate - Rate a completed ride
router.post('/:rideId/rate', firebaseAuthMiddleware, async (req, res) => {
  try {
    const Ride = require('../models/ride');
    const User = require('../models/user');
    const { rideId } = req.params;
    const { rating, feedback } = req.body;

    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }

    // Find user - USE FIREBASE UID
    const user = await findUserByFirebaseAuth(req.user);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Find ride and verify it belongs to the rider
    const ride = await Ride.findOne({
      _id: rideId,
      riderId: user._id,
      status: 'completed'
    }).populate('driverId');

    if (!ride) {
      return res.status(404).json({ message: 'Ride not found or not completed' });
    }

    if (ride.rating) {
      return res.status(400).json({ message: 'Ride already rated' });
    }

    // Update ride with rating
    ride.rating = rating;
    ride.feedback = feedback || '';
    await ride.save();

    // Update driver's rating stats
    if (ride.driverId) {
      const driver = await User.findById(ride.driverId);
      if (driver) {
        if (!driver.stats) {
          driver.stats = {
            totalRides: 0,
            completedRides: 0,
            cancelledRides: 0,
            totalEarnings: 0,
            totalDistance: 0,
            rating: 0,
            totalRatings: 0
          };
        }

        // Calculate new average rating
        const currentTotal = driver.stats.rating * driver.stats.totalRatings;
        driver.stats.totalRatings = (driver.stats.totalRatings || 0) + 1;
        driver.stats.rating = (currentTotal + rating) / driver.stats.totalRatings;

        await driver.save();
      }
    }

    res.json({
      message: 'Rating submitted successfully',
      rating: ride.rating,
      feedback: ride.feedback,
      driverRating: ride.driverId ? ride.driverId.stats?.rating : null
    });
  } catch (error) {
    console.error('Error rating ride:', error);
    res.status(500).json({ message: 'Failed to submit rating' });
  }
});

// GET /api/rides/admin/active - Get active rides count for admin dashboard
router.get('/admin/active', firebaseAuthMiddleware, async (req, res) => {
  try {
    const Ride = require('../models/ride');

    // Count rides with active statuses
    const count = await Ride.countDocuments({
      status: { $in: ['requested', 'accepted', 'arrived', 'started'] }
    });

    res.json({
      success: true,
      count,
      statuses: {
        requested: await Ride.countDocuments({ status: 'requested' }),
        accepted: await Ride.countDocuments({ status: 'accepted' }),
        arrived: await Ride.countDocuments({ status: 'arrived' }),
        started: await Ride.countDocuments({ status: 'started' })
      }
    });
  } catch (error) {
    console.error('Error fetching active rides count:', error);
    res.status(500).json({ message: 'Failed to fetch active rides count' });
  }
});

// GET /api/rides/admin/all - Get all rides for admin dashboard
router.get('/admin/all', firebaseAuthMiddleware, async (req, res) => {
  try {
    const Ride = require('../models/ride');
    const User = require('../models/user');

    // Fetch all rides with driver and rider details
    const rides = await Ride.find()
      .sort({ createdAt: -1 })
      .limit(1000)
      .lean();

    // Populate driver and rider details
    const ridesWithDetails = await Promise.all(rides.map(async (ride) => {
      let driver = null;
      let rider = null;

      if (ride.driverId) {
        driver = await User.findById(ride.driverId).select('name email phone vehicle').lean();
      }

      if (ride.riderId) {
        rider = await User.findById(ride.riderId).select('name email phone').lean();
      }

      return {
        ...ride,
        driver,
        rider
      };
    }));

    res.json({
      success: true,
      rides: ridesWithDetails,
      count: ridesWithDetails.length
    });
  } catch (error) {
    console.error('Error fetching all rides:', error);
    res.status(500).json({ message: 'Failed to fetch rides' });
  }
});

// GET /api/rides/admin/count - Get total rides count for admin dashboard
router.get('/admin/count', firebaseAuthMiddleware, async (req, res) => {
  try {
    const Ride = require('../models/ride');

    const totalCount = await Ride.countDocuments();

    res.json({
      success: true,
      count: totalCount
    });
  } catch (error) {
    console.error('Error fetching total rides count:', error);
    res.status(500).json({ message: 'Failed to fetch total rides count' });
  }
});

module.exports = router;

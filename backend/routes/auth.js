const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const { admin, firebaseInitialized } = require('../config/firebase');
const { firebaseAuthMiddleware } = require('../middleware/auth');
const fetch = require('node-fetch');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable must be set');
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
  console.warn('DEV MODE: Using temporary secret (DO NOT USE IN PRODUCTION)');
}

// In-memory user storage (fallback when MongoDB is not available)
const inMemoryUsers = new Map();

// ============================================================
// FIREBASE AUTHENTICATION ONLY
// ============================================================

// JWT Authentication Middleware (for non-Firebase routes)
const authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token provided' });

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.error('JWT auth error:', err);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// ============================================================
// FIREBASE EMAIL AUTHENTICATION (Email Link)
// ============================================================

router.post('/firebase-email', async (req, res) => {
  try {
    const { email, idToken, uid: bodyUid } = req.body;

    if (!idToken) {
      return res.status(401).json({ error: 'No token provided' });
    }

    let uid, verifiedEmail;

    // Try Firebase Admin SDK first (if enabled)
    if (firebaseInitialized) {
      try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        uid = decodedToken.uid;
        verifiedEmail = decodedToken.email || email;
      } catch (err) {
        console.log('Firebase Admin SDK verification failed:', err.message);
      }
    }

    // Try Firebase REST API verification
    if (!uid) {
      try {
        const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY || 'AIzaSyDs52r7Beg9ba-pSuZap_Z7O3D2iJ6cKh0';
        const verifyResponse = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken })
          }
        );
        const verifyData = await verifyResponse.json();
        if (verifyData.users && verifyData.users[0]) {
          uid = verifyData.users[0].localId;
          verifiedEmail = verifyData.users[0].email || email;
        }
      } catch (err) {
        console.log('Firebase REST API verification failed:', err.message);
      }
    }

    // Last resort: use UID from body
    if (!uid) {
      uid = bodyUid;
      verifiedEmail = email;
    }

    if (!uid) {
      return res.status(401).json({ error: 'Invalid authentication token' });
    }

    let user;
    try {
      // Try MongoDB first - check by firebaseUid first, then by email
      user = await User.findOne({ firebaseUid: uid });

      if (!user) {
        // Check if user exists by email (for admin accounts created via terminal)
        user = await User.findOne({ email: verifiedEmail });

        if (user) {
          // Link Firebase UID to existing user
          user.firebaseUid = uid;
          user.emailVerified = true;
          await user.save();
          console.log('✅ Linked Firebase UID to existing user:', verifiedEmail);
        } else {
          // Create new user with email
          user = new User({
            email: verifiedEmail,
            firebaseUid: uid,
            emailVerified: true,
            phoneVerified: false
          });
          await user.save();
        }
      } else {
        // Update existing user
        if (verifiedEmail && user.email !== verifiedEmail) {
          user.email = verifiedEmail;
        }
        user.emailVerified = true;
        await user.save();
      }
    } catch (dbError) {
      // MongoDB not available - use in-memory storage
      console.warn('⚠️ MongoDB not available, using in-memory storage');

      user = inMemoryUsers.get(uid);

      if (!user) {
        user = {
          _id: uid,
          email: verifiedEmail,
          firebaseUid: uid,
          emailVerified: true,
          phoneVerified: false,
          name: null,
          phone: null,
          role: null,
          avatar: null
        };
        inMemoryUsers.set(uid, user);
      } else {
        user.email = email;
        user.emailVerified = true;
      }
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        avatar: user.avatar,
        emailVerified: user.emailVerified
      },
      isNewUser: !user.name || !user.role,
      message: 'Email verified successfully!'
    });
  } catch (err) {
    console.error('Firebase email auth error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ============================================================
// FIREBASE PHONE AUTHENTICATION
// ============================================================

router.post('/firebase-phone', async (req, res) => {
  try {
    const { phoneNumber, uid: bodyUid, firebaseUid } = req.body;
    const authHeader = req.headers.authorization;

    // Get Firebase ID token from header
    const idToken = authHeader ? authHeader.split(' ')[1] : null;

    let uid, phone;

    // Try to verify token if Firebase Admin SDK is available
    if (firebaseInitialized && idToken) {
      try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        uid = decodedToken.uid;
        phone = decodedToken.phone_number || phoneNumber;
      } catch (err) {
        console.log('Firebase token verification failed:', err.message);
        // Fall through to use body data
      }
    }

    // If Firebase Admin SDK not available or token verification failed,
    // verify the token using Firebase REST API
    if (!uid && idToken) {
      try {
        const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY || 'AIzaSyDs52r7Beg9ba-pSuZap_Z7O3D2iJ6cKh0';
        const verifyResponse = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken })
          }
        );
        const verifyData = await verifyResponse.json();
        if (verifyData.users && verifyData.users[0]) {
          uid = verifyData.users[0].localId;
          phone = verifyData.users[0].phoneNumber || phoneNumber;
        }
      } catch (err) {
        console.log('Firebase REST API verification failed:', err.message);
      }
    }

    // Last resort: use UID from body (less secure but works)
    if (!uid) {
      uid = bodyUid || firebaseUid;
      phone = phoneNumber;
    }

    if (!uid) {
      return res.status(401).json({ message: 'Invalid authentication token' });
    }

    console.log('📞 Phone auth request for:', phone);

    let user;

    // Check by firebaseUid first, then by phone
    user = await User.findOne({ firebaseUid: uid });

    if (!user) {
      // Check if user exists by phone
      user = await User.findOne({ phone: phone });

      if (user) {
        // Link Firebase UID to existing user
        user.firebaseUid = uid;
        user.phoneVerified = true;
        await user.save();
        console.log('✅ Linked Firebase UID to existing user:', phone);
      } else {
        // Create new user with phone
        console.log('📝 Creating new user in MongoDB...');
        user = new User({
          phone: phone,
          firebaseUid: uid,
          emailVerified: false,
          phoneVerified: true
        });
        await user.save();
        console.log('✅ New user created in MongoDB:', user._id);
      }
    } else {
      // Update existing user
      console.log('📝 Updating existing user in MongoDB...');
      user.phone = phone;
      user.phoneVerified = true;

      // Fix corrupted createdAt if it exists
      if (user.createdAt && typeof user.createdAt === 'object' && user.createdAt.$date) {
        user.createdAt = new Date(user.createdAt.$date);
      }

      await user.save();
      console.log('✅ User updated in MongoDB:', user._id);
    }

    // No JWT token - client will use Firebase ID token

    res.json({
      success: true,
      message: 'Use your Firebase ID token for authentication',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        avatar: user.avatar,
        phoneVerified: user.phoneVerified
      },
      isNewUser: !user.name || !user.role,
      message: 'Phone verified successfully!'
    });
  } catch (err) {
    console.error('Firebase phone auth error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================================
// COMPLETE PROFILE (after Firebase auth)
// ============================================================

router.post('/complete-profile', firebaseAuthMiddleware, async (req, res) => {
  try {
    const { name, phone, role, gender, avatar, vehicle, license } = req.body;
    const uid = req.firebaseUser.uid;

    console.log('Complete profile request for UID:', uid);

    // Find user in MongoDB
    let user = await User.findOne({ firebaseUid: uid });

    if (!user) {
      return res.status(404).json({ message: 'User not found. Please sign in again.' });
    }

    // Update user profile
    user.name = name;
    if (phone) user.phone = phone;
    user.role = role;
    user.gender = gender;
    user.avatar = avatar;
    user.vehicle = vehicle;
    user.license = license;

    await user.save();
    console.log('✅ User profile saved to MongoDB:', user._id);

    // No JWT token - client uses Firebase ID token
    res.json({
      success: true,
      message: 'Use your Firebase ID token for authentication',
      user: {
        id: user._id || user.email,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        avatar: user.avatar,
        emailVerified: user.emailVerified || true,
        phoneVerified: user.phoneVerified || true
      },
      message: 'Profile completed successfully!'
    });
  } catch (err) {
    console.error('Complete profile error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// ============================================================
// GET CURRENT USER (fetch from database)
// ============================================================

router.get('/me', firebaseAuthMiddleware, async (req, res) => {
  try {
    const uid = req.firebaseUser.uid;

    // Find user in MongoDB
    const user = await User.findOne({ firebaseUid: uid });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    console.log('✅ Returning user:', user.name, user.role);
    res.json({
      success: true,
      user: {
        id: user._id || user.email,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        gender: user.gender,
        avatar: user.avatar,
        vehicle: user.vehicle,
        license: user.license,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
        createdAt: user.createdAt
      }
    });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// ============================================================
// USER STATISTICS
// ============================================================

// Get user statistics
router.get('/stats', firebaseAuthMiddleware, async (req, res) => {
  try {
    const uid = req.firebaseUser.uid;

    // Get user from MongoDB
    const user = await User.findOne({ firebaseUid: uid });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Initialize stats if not present
    const stats = user.stats || {
      totalRides: 0,
      completedRides: 0,
      cancelledRides: 0,
      totalEarnings: 0,
      totalDistance: 0,
      rating: 0,
      totalRatings: 0
    };

    res.json({
      stats,
      role: user.role
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Get today's statistics
router.get('/stats/today', firebaseAuthMiddleware, async (req, res) => {
  try {
    const Ride = require('../models/ride');
    const user = await User.findOne({ firebaseUid: req.firebaseUser.uid });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get start of today (midnight)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Query rides based on user role
    const query = {
      createdAt: { $gte: today }
    };

    if (user.role === 'driver' || user.role === 'captain') {
      query.driverId = user._id;
    } else {
      query.riderId = user._id;
    }

    const rides = await Ride.find(query);

    // Calculate today's stats
    const todayStats = {
      totalRides: rides.length,
      completedRides: rides.filter(r => r.status === 'completed').length,
      cancelledRides: rides.filter(r => r.status === 'cancelled').length,
      earnings: rides
        .filter(r => r.status === 'completed')
        .reduce((sum, r) => sum + (r.fare || 0), 0),
      distance: rides
        .filter(r => r.status === 'completed')
        .reduce((sum, r) => sum + (r.distance || 0), 0)
    };

    res.json({ todayStats });
  } catch (error) {
    console.error('Error fetching today stats:', error);
    res.status(500).json({ error: 'Failed to fetch today statistics' });
  }
});

// ============================================================
// SAVED PLACES
// ============================================================

// Get saved places
router.get('/places', firebaseAuthMiddleware, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.firebaseUser.uid });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ savedPlaces: user.savedPlaces || [] });
  } catch (error) {
    console.error('Error fetching saved places:', error);
    res.status(500).json({ error: 'Failed to fetch saved places' });
  }
});

// Add saved place
router.post('/places', firebaseAuthMiddleware, async (req, res) => {
  try {
    console.log('📍 Save place request:', req.body);
    const { name, address, lat, lon } = req.body;

    if (!name || lat === undefined || lon === undefined) {
      console.log('❌ Missing required fields');
      return res.status(400).json({ error: 'Name, lat, and lon are required' });
    }

    console.log('🔍 Looking for user:', req.firebaseUser.uid);
    const user = await User.findOne({ firebaseUid: req.firebaseUser.uid });
    if (!user) {
      console.log('❌ User not found');
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('✅ User found:', user.email);

    // Check if place already exists
    const exists = user.savedPlaces && user.savedPlaces.some(p =>
      Math.abs(p.lat - lat) < 0.0001 && Math.abs(p.lon - lon) < 0.0001
    );

    if (exists) {
      console.log('⚠️ Place already saved');
      return res.status(200).json({ success: true, savedPlaces: user.savedPlaces, message: 'Already saved' });
    }

    if (!user.savedPlaces) {
      user.savedPlaces = [];
    }

    user.savedPlaces.unshift({ name, address, lat, lon });

    // Keep only 50 most recent
    if (user.savedPlaces.length > 50) {
      user.savedPlaces = user.savedPlaces.slice(0, 50);
    }

    await user.save();
    console.log('✅ Place saved successfully, total places:', user.savedPlaces.length);

    res.json({ success: true, savedPlaces: user.savedPlaces });
  } catch (error) {
    console.error('❌ Error saving place:', error);
    res.status(500).json({ error: 'Failed to save place', details: error.message });
  }
});

// Delete saved place
router.delete('/places', firebaseAuthMiddleware, async (req, res) => {
  try {
    const { lat, lon, index } = req.body;

    const user = await User.findOne({ firebaseUid: req.firebaseUser.uid });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (index !== undefined) {
      // Delete by index
      user.savedPlaces.splice(index, 1);
    } else if (lat !== undefined && lon !== undefined) {
      // Delete by coordinates
      user.savedPlaces = user.savedPlaces.filter(p =>
        !(Math.abs(p.lat - lat) < 0.0001 && Math.abs(p.lon - lon) < 0.0001)
      );
    } else {
      return res.status(400).json({ error: 'Either index or coordinates required' });
    }

    await user.save();

    res.json({ success: true, savedPlaces: user.savedPlaces });
  } catch (error) {
    console.error('Error deleting place:', error);
    res.status(500).json({ error: 'Failed to delete place' });
  }
});

// ============================================================
// UPDATE AVATAR
// ============================================================

router.put('/avatar', authenticateToken, async (req, res) => {
  try {
    const { avatar } = req.body;

    if (!avatar) {
      return res.status(400).json({ error: 'Avatar is required' });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.avatar = avatar;
    await user.save();

    res.json({ success: true, avatar: user.avatar });
  } catch (error) {
    console.error('Error updating avatar:', error);
    res.status(500).json({ error: 'Failed to update avatar' });
  }
});

// ============================================================
// UPDATE PROFILE
// ============================================================

router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { name, gender, avatar, vehicle, license } = req.body;

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (name) user.name = name;
    if (gender) user.gender = gender;
    if (avatar) user.avatar = avatar;
    if (vehicle) user.vehicle = vehicle;
    if (license) user.license = license;

    await user.save();

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        gender: user.gender,
        avatar: user.avatar,
        vehicle: user.vehicle,
        license: user.license,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ============================================================
// ADMIN - GET ALL USERS
// ============================================================

router.get('/admin/users', firebaseAuthMiddleware, async (req, res) => {
  try {
    // Check if user is admin
    const adminUser = await User.findOne({ firebaseUid: req.firebaseUser.uid });
    if (!adminUser || adminUser.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin only.' });
    }

    // Get all users
    const users = await User.find({})
      .select('name email phone role emailVerified phoneVerified createdAt')
      .sort({ createdAt: -1 })
      .lean();

    // Separate by role
    const riders = users.filter(u => u.role === 'rider');
    const captains = users.filter(u => u.role === 'captain');

    res.json({
      success: true,
      riders: riders.map(u => ({
        id: u._id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        emailVerified: u.emailVerified,
        phoneVerified: u.phoneVerified,
        joinedDate: u.createdAt
      })),
      captains: captains.map(u => ({
        id: u._id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        emailVerified: u.emailVerified,
        phoneVerified: u.phoneVerified,
        joinedDate: u.createdAt
      }))
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ============================================================
// LINK PHONE NUMBER TO EMAIL ACCOUNT
// ============================================================

router.post('/link-phone', authenticateToken, async (req, res) => {
  try {
    const { phoneNumber, phoneIdToken } = req.body;

    if (!phoneIdToken) {
      return res.status(401).json({ error: 'Phone verification token required' });
    }

    let phoneUid;
    if (firebaseInitialized) {
      // Verify Firebase phone token
      const decodedToken = await admin.auth().verifyIdToken(phoneIdToken);
      phoneUid = decodedToken.uid;

      if (!decodedToken.phone_number) {
        return res.status(400).json({ error: 'Token is not from phone authentication' });
      }
    } else {
      return res.status(500).json({ error: 'Firebase not initialized' });
    }

    // Get user from JWT token (from email sign-in)
    const userId = req.user.id || req.user.uid;

    let user;
    try {
      user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Link phone to account
      user.phone = phoneNumber;
      user.phoneVerified = true;

      // Optionally update firebaseUid to phone UID if preferred
      if (!user.firebaseUid) {
        user.firebaseUid = phoneUid;
      }

      await user.save();
      console.log('✅ Phone linked to email account:', user.email, '->', phoneNumber);

    } catch (dbError) {
      console.warn('⚠️ MongoDB not available, using in-memory storage');

      user = inMemoryUsers.get(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      user.phone = phoneNumber;
      user.phoneVerified = true;
      inMemoryUsers.set(userId, user);
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified
      }
    });

  } catch (error) {
    console.error('Error linking phone:', error);
    res.status(500).json({ error: 'Failed to link phone number' });
  }
});

// ============================================================
// BACKEND EMAIL/PASSWORD AUTH (Bypass Firebase Client SDK)
// ============================================================

const bcrypt = require('bcryptjs');

// Backend Sign Up (creates user in MongoDB)
router.post('/signup', async (req, res) => {
  try {
    const { email, password, name, phone, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    // Check if user exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    user = new User({
      email,
      password: hashedPassword,
      name: name || null,
      phone: phone || null,
      role: role || null,
      emailVerified: true, // Auto-verify for backend auth
      phoneVerified: false
    });

    await user.save();
    console.log('✅ User created via backend auth:', email);

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified
      }
    });
  } catch (error) {
    console.error('Backend signup error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Backend Sign In (email/password)
router.post('/signin', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check if user has password (might be Firebase-only user)
    if (!user.password) {
      return res.status(401).json({ message: 'This account uses Firebase authentication. Please wait for Firebase to be reinstated.' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    console.log('✅ User signed in via backend auth:', email);

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        avatar: user.avatar,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified
      }
    });
  } catch (error) {
    console.error('Backend signin error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// ============================================================
// LOGOUT
// ============================================================

router.post('/logout', (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

// FIX DB DATES - Temporary endpoint
router.post('/fix-db-date', firebaseAuthMiddleware, async (req, res) => {
  try {
    const User = require('../models/user');
    // Find user by Firebase UID OR Email (to be sure we catch them)
    // Note: req.user from firebase middleware only has uid/email from token
    const query = {
      $or: [
        { firebaseUid: req.user.uid },
        { email: req.user.email }
      ]
    };

    console.log('🔧 Fixing date for query:', JSON.stringify(query));

    // Use native collection update to bypass Mongoose validation
    const result = await User.collection.updateOne(
      query,
      {
        $set: { createdAt: new Date() }
      }
    );

    console.log('🔧 Fix result:', result);

    res.json({ success: true, message: 'Date fixed', result: { matched: result.matchedCount, modified: result.modifiedCount } });
  } catch (error) {
    console.error('Fix date error:', error);
    res.status(500).json({ message: 'Failed to fix date', error: error.message });
  }
});

module.exports = router;

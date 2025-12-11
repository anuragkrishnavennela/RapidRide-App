// Load environment variables FIRST
// Force Railway redeploy - 2025-12-10
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const http = require('http');
const https = require('https');
const fs = require('fs');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');

// Prevent process from exiting on unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('⚠️ Uncaught Exception:', error);
});

const authRoutes = require('./routes/auth');
const ridesRoutes = require('./routes/rides');
const supportRoutes = require('./routes/support');
const fastapi = require('./services/fastapi');
const redis = require('./services/redis');
const { register: metricsRegister, metricsMiddleware, socketConnectionsGauge } = require('./services/metrics');
const logger = require('./services/logger');

const app = express();
// Trust proxy for Railway/production deployment
app.set('trust proxy', true);
const PORT = process.env.PORT || 3000;
const MONGO = process.env.MONGO_URI || 'mongodb://localhost:27017/rapidride';

// Enable CORS for deployed frontend and local network access
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    // Allow localhost, 127.0.0.1, and local network IPs with HTTP or HTTPS
    const allowedOrigins = [
      /^https?:\/\/localhost:\d+$/,
      /^https?:\/\/127\.0\.0\.1:\d+$/,
      /^https?:\/\/192\.168\.\d+\.\d+:\d+$/,
      /^https?:\/\/10\.\d+\.\d+\.\d+:\d+$/,
      'https://rapidrideonline.web.app',
      'https://rapidrideonline.firebaseapp.com',
      'https://rapidride-app-production.up.railway.app'
    ];

    const isAllowed = allowedOrigins.some(pattern =>
      typeof pattern === 'string' ? pattern === origin : pattern.test(origin)
    );

    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());

// Security headers (disabled COOP warnings for local network access)
app.use(helmet({
  contentSecurityPolicy: false, // Disable for now to allow inline scripts
  crossOriginOpenerPolicy: false, // Disable to remove COOP warnings on local network
  crossOriginResourcePolicy: false // Disable to remove CORP warnings
}));

// Allow geolocation on HTTP for local network testing
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'geolocation=(self)');
  next();
});

// Rate limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many authentication attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for general API
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

// Prometheus metrics middleware
app.use(metricsMiddleware);

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', metricsRegister.contentType);
    const metrics = await metricsRegister.metrics();
    res.end(metrics);
  } catch (error) {
    res.status(500).end(error);
  }
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// Apply rate limiters
app.use('/api/auth/signin', authLimiter);
app.use('/api/auth/phone-signin', authLimiter);
app.use('/api/auth/verify-otp', authLimiter);
app.use('/api/auth/firebase-phone', authLimiter);
app.use('/api/auth/firebase-email', authLimiter);
app.use('/api', apiLimiter);

// Debug logging for API requests
app.use('/api', (req, res, next) => {
  console.log(`📝 ${req.method} ${req.originalUrl}`);
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/rides', ridesRoutes);
app.use('/api/driver', ridesRoutes); // Driver location endpoint accessible via /api/driver
app.use('/api/support', supportRoutes);

app.get('/api/health', async (req, res) => {
  const [fastapiHealth, redisHealth] = await Promise.all([
    fastapi.healthCheck(),
    redis.healthCheck()
  ]);
  res.json({
    ok: true,
    uptime: process.uptime(),
    time: new Date().toISOString(),
    fastapi: fastapiHealth,
    redis: redisHealth
  });
});

// MongoDB Connection with proper error handling
mongoose.connect(MONGO, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
  .then(() => {
    console.log("✅ Connected to MongoDB at", MONGO);
  })
  .catch(err => {
    console.error("❌ MongoDB Connection Failed:", err.message);
    if (process.env.NODE_ENV === 'production') {
      console.error('FATAL: Cannot start without database in production');
      process.exit(1);
    }
    console.log("⚠️ DEV MODE: Continuing with in-memory storage...");
    console.log("💡 To fix: Make sure MongoDB is running and accessible at:", MONGO);
  });

// Handle MongoDB connection events
mongoose.connection.on('error', err => {
  console.error('❌ MongoDB error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ MongoDB disconnected');
});

mongoose.connection.on('connected', () => {
  console.log('✅ Mongoose connected to MongoDB');
});

// Initialize Redis connection
redis.connect().catch(() => {
  console.warn("⚠️ Redis not available - caching disabled");
});

// Check if SSL certificates exist
const keyPath = path.join(__dirname, 'certs', 'server.key');
const certPath = path.join(__dirname, 'certs', 'server.crt');
const useHTTPS = fs.existsSync(keyPath) && fs.existsSync(certPath);

// CORS configuration for Socket.IO
const socketCorsConfig = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      /^https?:\/\/localhost:\d+$/,
      /^https?:\/\/127\.0\.0\.1:\d+$/,
      /^https?:\/\/192\.168\.\d+\.\d+:\d+$/,
      /^https?:\/\/10\.\d+\.\d+\.\d+:\d+$/,
      'https://rapidrideonline.web.app',
      'https://rapidrideonline.firebaseapp.com',
      'https://rapidride-app-production.up.railway.app'
    ];

    const isAllowed = allowedOrigins.some(pattern =>
      typeof pattern === 'string' ? pattern === origin : pattern.test(origin)
    );

    callback(null, isAllowed);
  },
  credentials: true
};

// Create HTTP server (always available)
const httpServer = http.createServer(app);
const httpIO = new Server(httpServer, { cors: socketCorsConfig });

// Create HTTPS server if certificates exist
let httpsServer, httpsIO;
if (useHTTPS) {
  const httpsOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
  };
  httpsServer = https.createServer(httpsOptions, app);
  httpsIO = new Server(httpsServer, { cors: socketCorsConfig });
  console.log('🔒 HTTPS enabled with SSL certificate');
}

// Store online drivers with their vehicle types
const onlineDrivers = new Map(); // userId -> { socketId, vehicleType, location }

// WebSocket authentication middleware (shared by both HTTP and HTTPS)
const socketAuthMiddleware = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    // Use Firebase Admin SDK to verify token
    const { admin, firebaseInitialized } = require('./config/firebase');

    if (!firebaseInitialized) {
      console.warn('Firebase not initialized, skipping WebSocket auth');
      socket.userId = 'dev-user';
      socket.role = 'driver';
      return next();
    }

    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      socket.userId = decodedToken.uid;
      socket.email = decodedToken.email;

      console.log(`🔍 Socket token decoded - UID: ${decodedToken.uid}, Email: ${decodedToken.email}`);

      // Get user role from database - use firebaseUid as primary lookup
      const User = require('./models/user');
      const user = await User.findOne({ firebaseUid: decodedToken.uid });

      console.log(`👤 Found user in DB: ${user?.name}, Role: ${user?.role}, UID: ${user?.firebaseUid}`);

      socket.role = user?.role || 'rider';
      socket.userName = user?.name || decodedToken.name || 'User';

      console.log(`✅ Socket authenticated: ${socket.userName} (${socket.role})`);
      next();
    } catch (firebaseError) {
      console.error('Firebase token verification failed:', firebaseError.message);
      next(new Error('Invalid Firebase token'));
    }
  } catch (err) {
    console.error('WebSocket auth error:', err.message);
    next(new Error('Authentication failed'));
  }
};

// Apply auth middleware to both HTTP and HTTPS Socket.IO servers
httpIO.use(socketAuthMiddleware);
if (useHTTPS && httpsIO) {
  httpsIO.use(socketAuthMiddleware);
}

// Socket.IO connection handler
// Socket connection handler will be moved below to handleSocketConnection function

// Make io and onlineDrivers available to routes (use httpIO as primary)
app.set('io', httpIO);
app.set('httpsIO', httpsIO);
app.set('onlineDrivers', onlineDrivers);

// Cleanup inactive drivers every 5 minutes
setInterval(() => {
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;
  let removedCount = 0;

  for (const [userId, driverData] of onlineDrivers.entries()) {
    const inactiveTime = now - driverData.lastActivity;

    if (inactiveTime >= ONE_HOUR) {
      onlineDrivers.delete(userId);
      removedCount++;
      console.log(`⏰ Driver ${userId} removed due to 1 hour inactivity`);
    }
  }

  if (removedCount > 0) {
    console.log(`🧹 Cleaned up ${removedCount} inactive driver(s)`);
    console.log(`📈 Active online drivers: ${onlineDrivers.size}`);
  }
}, 5 * 60 * 1000); // Check every 5 minutes

// Start server on all network interfaces for multi-device access
const os = require('os');
const networkInterfaces = os.networkInterfaces();
let localIP = 'localhost';

// Find the local network IP
for (const name of Object.keys(networkInterfaces)) {
  for (const net of networkInterfaces[name]) {
    // Skip internal and non-IPv4 addresses
    if (net.family === 'IPv4' && !net.internal) {
      localIP = net.address;
      break;
    }
  }
}

// Start HTTP server (port 3000)
const HTTP_PORT = 3000;
const HTTPS_PORT = 3001;

httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`✅ RapidRide Backend Running`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`📍 HTTP  Local:    http://localhost:${HTTP_PORT}`);
  console.log(`📱 HTTP  Network:  http://${localIP}:${HTTP_PORT}`);

  if (useHTTPS) {
    console.log(`🔒 HTTPS Local:    https://localhost:${HTTPS_PORT}`);
    console.log(`🔒 HTTPS Network:  https://${localIP}:${HTTPS_PORT}`);
  }

  console.log(`${'═'.repeat(60)}`);
  console.log(`\n🚀 Multi-Device Access:`);
  console.log(`   Desktop (HTTP):  http://${localIP}:${HTTP_PORT}/rider/rider_home.html`);

  if (useHTTPS) {
    console.log(`   Mobile (HTTPS):  https://${localIP}:${HTTPS_PORT}/rider/rider_home.html`);
    console.log(`\n⚠️  HTTPS with self-signed certificate:`);
    console.log(`   On mobile devices, click "Advanced" → "Proceed to site"`);
  }

  console.log(`\n⚠️  Make sure devices are on the SAME WiFi network\n`);
});

// Also attach Socket.IO to HTTP server for bidirectional support
httpIO.on('connection', handleSocketConnection);

// If HTTPS is enabled, start HTTPS server on port 3001
if (useHTTPS && httpsServer) {
  httpsServer.listen(HTTPS_PORT, '0.0.0.0');
  httpsIO.on('connection', handleSocketConnection);
}

// Socket connection handler (shared between HTTP and HTTPS)
function handleSocketConnection(socket) {
  console.log('🔌 Client connected:', socket.id, '| User:', socket.userId, '| Role:', socket.role);
  socketConnectionsGauge.inc();

  // Driver goes online
  socket.on('driver:online', (data) => {
    // Use authenticated userId from socket, not client data
    const userId = socket.userId;
    const { vehicleType, location } = data;

    // Only drivers can go online
    if (socket.role !== 'driver') {
      return socket.emit('error', { message: 'Only drivers can go online' });
    }

    onlineDrivers.set(userId, {
      socketId: socket.id,
      vehicleType: vehicleType || 'Sedan',
      location: location || null,
      lastActivity: Date.now()
    });
    console.log(`✅ Driver ${userId} is now ONLINE with ${vehicleType}`);
    console.log(`📡 Driver will receive ride requests for: ${vehicleType}`);
    console.log(`⏰ Will auto-offline after 1 hour of inactivity`);
    console.log(`📈 Total online drivers: ${onlineDrivers.size}`);
    socket.join('drivers');
  });

  // Driver goes offline
  socket.on('driver:offline', (data) => {
    const { userId } = data;
    const wasOnline = onlineDrivers.has(userId);
    onlineDrivers.delete(userId);
    if (wasOnline) {
      console.log(`❌ Driver ${userId} is now OFFLINE (will NOT receive ride requests)`);
      console.log(`📉 Total online drivers: ${onlineDrivers.size}`);
    }
    socket.leave('drivers');
  });

  // Driver location update
  socket.on('driver:location', (data) => {
    const { userId, location } = data;
    const driver = onlineDrivers.get(userId);
    if (driver) {
      driver.location = location;
      driver.lastActivity = Date.now();
      driver.socketId = socket.id; // Update socket ID in case of reconnection
      onlineDrivers.set(userId, driver);
    }
  });

  // Disconnect handler
  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
    socketConnectionsGauge.dec();
    // Mark socket as disconnected but keep driver online
    // Driver will remain online until manual offline or 1 hour inactivity
    for (const [userId, driverData] of onlineDrivers.entries()) {
      if (driverData.socketId === socket.id) {
        console.log(`🔌 Driver ${userId} socket disconnected - keeping online (reconnection possible)`);
        console.log(`⏰ Will auto-remove after 1 hour of inactivity`);
        // Keep driver in online list for reconnection
        break;
      }
    }
  });
}

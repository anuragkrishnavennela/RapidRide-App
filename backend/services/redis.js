/**
 * Redis client service for RapidRide Node.js backend.
 * Provides caching functionality with connection management.
 */

const { createClient } = require('redis');

// Redis configuration
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const KEY_PREFIX = 'rr:';

// Debug: Check what URL is being used
console.log(`🔌 Redis Config: URL is ${REDIS_URL.includes('localhost') ? 'LOCALHOST (Default)' : 'SET (External)'}`);
if (!process.env.REDIS_URL) console.warn('⚠️ WARNING: REDIS_URL env var is MISSING. Defaulting to localhost.');


// TTL values (in seconds)
const TTL = {
    RIDE: 120,        // 2 minutes for ride data
    ESTIMATE: 300,    // 5 minutes for estimates
    USER: 3600,       // 1 hour for user sessions
};

// Global Redis client
let client = null;
let isConnected = false;

// Cache statistics
const cacheStats = {
    hits: 0,
    misses: 0,
    errors: 0
};

/**
 * Initialize Redis client connection
 */
async function connect() {
    if (client && isConnected) {
        return client;
    }

    try {
        client = createClient({
            url: REDIS_URL,
            socket: {
                connectTimeout: 2000,
                reconnectStrategy: (retries) => {
                    if (retries > 3) {
                        console.warn('⚠️ Redis: Max reconnection attempts reached');
                        return false;
                    }
                    return Math.min(retries * 100, 1000);
                }
            }
        });

        client.on('error', (err) => {
            console.warn('⚠️ Redis error:', err.message);
            isConnected = false;
        });

        client.on('connect', () => {
            console.log('✅ Redis connected');
            isConnected = true;
        });

        client.on('disconnect', () => {
            console.log('⚠️ Redis disconnected');
            isConnected = false;
        });

        await client.connect();
        return client;
    } catch (error) {
        console.warn('⚠️ Redis connection failed:', error.message);
        isConnected = false;
        return null;
    }
}

/**
 * Get value from cache
 * @param {string} key - Cache key (without prefix)
 * @returns {Promise<any>} Cached value or null
 */
async function get(key) {
    try {
        if (!client || !isConnected) await connect();
        if (!client || !isConnected) return null;

        const fullKey = `${KEY_PREFIX}${key}`;
        const data = await client.get(fullKey);

        if (data) {
            console.log(`Cache HIT: ${fullKey}`);
            return JSON.parse(data);
        }
        return null;
    } catch (error) {
        console.warn('Cache get error:', error.message);
        return null;
    }
}

/**
 * Set value in cache with TTL
 * @param {string} key - Cache key (without prefix)
 * @param {any} value - Value to cache
 * @param {number} ttl - Time-to-live in seconds
 * @returns {Promise<boolean>} Success status
 */
async function set(key, value, ttl = TTL.ESTIMATE) {
    try {
        if (!client || !isConnected) await connect();
        if (!client || !isConnected) return false;

        const fullKey = `${KEY_PREFIX}${key}`;
        await client.setEx(fullKey, ttl, JSON.stringify(value));
        console.log(`Cache SET: ${fullKey} (TTL: ${ttl}s)`);
        return true;
    } catch (error) {
        console.warn('Cache set error:', error.message);
        return false;
    }
}

/**
 * Delete value from cache
 * @param {string} key - Cache key (without prefix)
 * @returns {Promise<boolean>} Success status
 */
async function del(key) {
    try {
        if (!client || !isConnected) await connect();
        if (!client || !isConnected) return false;

        const fullKey = `${KEY_PREFIX}${key}`;
        await client.del(fullKey);
        return true;
    } catch (error) {
        console.warn('Cache delete error:', error.message);
        return false;
    }
}

/**
 * Check Redis connection health
 * @returns {Promise<boolean>} Connection status
 */
async function healthCheck() {
    try {
        if (!client || !isConnected) await connect();
        if (!client || !isConnected) return false;

        await client.ping();
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Generate cache key for ride estimates
 */
function estimateKey(pickup, destination, traffic = 1.0) {
    return `estimate:${pickup.lat.toFixed(4)}:${pickup.lng.toFixed(4)}:${destination.lat.toFixed(4)}:${destination.lng.toFixed(4)}:${traffic.toFixed(1)}`;
}

/**
 * Generate cache key for ride data
 */
function rideKey(rideId) {
    return `ride:${rideId}`;
}

module.exports = {
    connect,
    get,
    set,
    del,
    healthCheck,
    estimateKey,
    rideKey,
    TTL,
    getStats: () => ({
        ...cacheStats,
        hitRate: cacheStats.hits / (cacheStats.hits + cacheStats.misses) || 0
    })
};

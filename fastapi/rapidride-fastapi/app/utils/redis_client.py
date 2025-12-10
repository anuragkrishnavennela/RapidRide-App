"""
Redis client utility for RapidRide FastAPI services.
Provides caching functionality with connection pooling and health checks.
"""
import redis
import json
from typing import Optional, Any
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# Global Redis client
_redis_client: Optional[redis.Redis] = None

# Key prefix for all RapidRide keys
KEY_PREFIX = "rapidride:"

# Default TTL values (in seconds)
TTL_FARE = 300       # 5 minutes for fare cache
TTL_ETA = 120        # 2 minutes for ETA cache
TTL_GEO = 86400      # 24 hours for geocoding cache


def get_redis() -> Optional[redis.Redis]:
    """
    Get Redis client instance with lazy initialization.
    Returns None if Redis is not available.
    """
    global _redis_client
    
    if _redis_client is None:
        try:
            _redis_client = redis.from_url(
                settings.redis_url,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2
            )
            # Test connection
            _redis_client.ping()
            logger.info(f"✅ Redis connected: {settings.redis_url}")
        except Exception as e:
            logger.warning(f"⚠️ Redis connection failed: {e}")
            _redis_client = None
    
    return _redis_client


def check_redis_connection() -> bool:
    """Check if Redis is connected and responsive."""
    try:
        client = get_redis()
        if client:
            client.ping()
            return True
    except Exception as e:
        logger.warning(f"Redis health check failed: {e}")
    return False


def cache_get(key: str) -> Optional[Any]:
    """
    Get value from cache.
    
    Args:
        key: Cache key (without prefix)
    
    Returns:
        Cached value or None if not found/error
    """
    try:
        client = get_redis()
        if client:
            full_key = f"{KEY_PREFIX}{key}"
            data = client.get(full_key)
            if data:
                logger.debug(f"Cache HIT: {full_key}")
                return json.loads(data)
            logger.debug(f"Cache MISS: {full_key}")
    except Exception as e:
        logger.warning(f"Cache get error: {e}")
    return None


def cache_set(key: str, value: Any, ttl: int = TTL_FARE) -> bool:
    """
    Set value in cache with TTL.
    
    Args:
        key: Cache key (without prefix)
        value: Value to cache (will be JSON serialized)
        ttl: Time-to-live in seconds
    
    Returns:
        True if cached successfully, False otherwise
    """
    try:
        client = get_redis()
        if client:
            full_key = f"{KEY_PREFIX}{key}"
            client.setex(full_key, ttl, json.dumps(value))
            logger.debug(f"Cache SET: {full_key} (TTL: {ttl}s)")
            return True
    except Exception as e:
        logger.warning(f"Cache set error: {e}")
    return False


def cache_delete(key: str) -> bool:
    """Delete a key from cache."""
    try:
        client = get_redis()
        if client:
            full_key = f"{KEY_PREFIX}{key}"
            client.delete(full_key)
            return True
    except Exception as e:
        logger.warning(f"Cache delete error: {e}")
    return False


def generate_fare_key(origin: dict, destination: dict, traffic: float) -> str:
    """Generate cache key for fare calculations."""
    return f"fare:{origin['lat']:.4f}:{origin['lng']:.4f}:{destination['lat']:.4f}:{destination['lng']:.4f}:{traffic:.1f}"


def generate_eta_key(origin: dict, destination: dict, traffic: float) -> str:
    """Generate cache key for ETA predictions."""
    return f"eta:{origin['lat']:.4f}:{origin['lng']:.4f}:{destination['lat']:.4f}:{destination['lng']:.4f}:{traffic:.1f}"


def generate_geo_key(lat: float, lng: float) -> str:
    """Generate cache key for geocoding (rounded to 4 decimals)."""
    return f"geo:{lat:.4f}:{lng:.4f}"

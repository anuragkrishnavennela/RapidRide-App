from typing import Dict, Any
from app.schemas.response import FareResponse
from app.utils.geo_utils import haversine_km
from app.utils.redis_client import cache_get, cache_set, generate_fare_key, TTL_FARE
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def compute_fare(payload: Dict[str, Any]) -> FareResponse:
    """
    Calculate fare based on distance and traffic conditions.
    Uses Redis caching for improved performance.
    
    Args:
        payload: Request payload containing origin, destination, and traffic_level
    
    Returns:
        FareResponse with calculated fare and distance
    """
    try:
        origin = payload["origin"]
        destination = payload["destination"]
        traffic_level = payload.get("traffic_level", 1.0)
        
        # Check cache first
        cache_key = generate_fare_key(origin, destination, traffic_level)
        cached = cache_get(cache_key)
        if cached:
            logger.info(f"Cache HIT for fare: {cache_key}")
            return FareResponse(**cached)
        
        # Calculate distance using Haversine formula
        distance_km = haversine_km(origin, destination)
        
        # Base fare calculation
        base_fare = settings.base_fare
        per_km_rate = settings.per_km_rate
        fare = base_fare + (per_km_rate * distance_km)
        
        # Apply traffic multiplier if present
        traffic_level = payload.get("traffic_level", 1.0)
        if traffic_level:
            fare = fare * traffic_level
        
        # Round fare to 2 decimal places
        fare = round(fare, 2)
        
        logger.info(
            f"Calculated fare: {fare} {settings.currency} for distance {distance_km} km "
            f"(traffic: {traffic_level})"
        )
        
        result = FareResponse(
            fare=fare,
            distance_km=distance_km,
            currency=settings.currency
        )
        
        # Cache the result
        cache_set(cache_key, result.model_dump(), TTL_FARE)
        
        return result
        
    except Exception as e:
        logger.error(f"Error computing fare: {str(e)}")
        raise

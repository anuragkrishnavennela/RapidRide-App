from typing import Optional
from app.schemas.response import ReverseGeoResponse
from app.utils.redis_client import cache_get, cache_set, generate_geo_key, TTL_GEO
from app.core.logging import get_logger
import aiohttp

logger = get_logger(__name__)


async def reverse_geocode(lat: float, lon: float) -> ReverseGeoResponse:
    """
    Perform reverse geocoding to get location details from coordinates.
    Uses Nominatim (OpenStreetMap) API with Redis caching.
    
    Args:
        lat: Latitude
        lon: Longitude
    
    Returns:
        ReverseGeoResponse with location details
    """
    try:
        # Check cache first (geocoding results rarely change)
        cache_key = generate_geo_key(lat, lon)
        cached = cache_get(cache_key)
        if cached:
            logger.info(f"Cache HIT for geocode: {cache_key}")
            return ReverseGeoResponse(**cached)
        
        # Use Nominatim API (free, for demonstration)
        url = "https://nominatim.openstreetmap.org/reverse"
        params = {
            "lat": lat,
            "lon": lon,
            "format": "json",
            "addressdetails": 1
        }
        headers = {
            "User-Agent": "RapidRide/1.0"
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url, params=params, headers=headers) as response:
                if response.status == 200:
                    data = await response.json()
                    address = data.get("address", {})
                    
                    result = ReverseGeoResponse(
                        city=address.get("city") or address.get("town") or address.get("village"),
                        locality=address.get("suburb") or address.get("neighbourhood") or address.get("locality"),
                        state=address.get("state"),
                        country=address.get("country"),
                        postal_code=address.get("postcode"),
                        formatted_address=data.get("display_name")
                    )
                    
                    # Cache the result (24 hours - addresses rarely change)
                    cache_set(cache_key, result.model_dump(), TTL_GEO)
                    
                    return result
                else:
                    logger.warning(f"Reverse geocoding failed with status {response.status}")
                    return ReverseGeoResponse(formatted_address=f"Location: {lat}, {lon}")
                    
    except Exception as e:
        logger.error(f"Error in reverse geocoding: {str(e)}")
        # Return minimal response with coordinates
        return ReverseGeoResponse(formatted_address=f"Location: {lat}, {lon}")


def reverse_geocode_sync(lat: float, lon: float) -> ReverseGeoResponse:
    """
    Synchronous version of reverse geocoding (simplified).
    Returns basic location information.
    
    Args:
        lat: Latitude
        lon: Longitude
    
    Returns:
        ReverseGeoResponse with basic location info
    """
    # Check cache first
    cache_key = generate_geo_key(lat, lon)
    cached = cache_get(cache_key)
    if cached:
        logger.info(f"Cache HIT for geocode (sync): {cache_key}")
        return ReverseGeoResponse(**cached)
    
    # For synchronous calls, return a simplified response
    # In production, you might want to use a local geocoding database
    return ReverseGeoResponse(
        formatted_address=f"Location: {lat}, {lon}",
        city="Unknown",
        country="Unknown"
    )

from fastapi import APIRouter, Query, HTTPException
from app.schemas.response import ReverseGeoResponse
from app.services.geo_service import reverse_geocode
from app.core.logging import get_logger

router = APIRouter(prefix="/geo", tags=["Geocoding"])
logger = get_logger(__name__)


@router.get("/reverse", response_model=ReverseGeoResponse)
async def reverse_geocode_endpoint(
    lat: float = Query(..., ge=-90, le=90, description="Latitude"),
    lon: float = Query(..., ge=-180, le=180, description="Longitude")
):
    """
    Reverse geocode coordinates to get location details.
    
    - **lat**: Latitude coordinate
    - **lon**: Longitude coordinate
    
    Returns structured location information including city, locality, state, country, and postal code.
    """
    try:
        result = await reverse_geocode(lat, lon)
        return result
    except Exception as e:
        logger.error(f"Reverse geocoding error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Reverse geocoding failed: {str(e)}")

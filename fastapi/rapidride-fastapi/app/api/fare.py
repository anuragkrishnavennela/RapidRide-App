from fastapi import APIRouter, HTTPException
from app.schemas.request import FareRequest
from app.schemas.response import FareResponse
from app.services.fare_service import compute_fare
from app.core.logging import get_logger

router = APIRouter(prefix="/fare", tags=["Fare"])
logger = get_logger(__name__)


@router.post("/calc", response_model=FareResponse)
async def calculate_fare(request: FareRequest):
    """
    Calculate fare for a ride.
    
    - **origin**: Starting location coordinates
    - **destination**: Ending location coordinates
    - **timestamp**: ISO-8601 timestamp of ride request
    - **traffic_level**: Optional traffic multiplier (1.0 = normal, >1 = heavy traffic)
    """
    try:
        result = compute_fare(request.dict())
        return result
    except Exception as e:
        logger.error(f"Fare calculation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Fare calculation failed: {str(e)}")

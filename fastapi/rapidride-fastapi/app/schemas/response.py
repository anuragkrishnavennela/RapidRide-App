from pydantic import BaseModel, Field
from typing import Optional


class FareResponse(BaseModel):
    """Response schema for fare calculation"""
    fare: float = Field(..., description="Total fare amount")
    distance_km: float = Field(..., description="Distance in kilometers")
    currency: str = Field(default="INR", description="Currency code")

    class Config:
        json_schema_extra = {
            "example": {
                "fare": 145.50,
                "distance_km": 7.134,
                "currency": "INR"
            }
        }


class ETAResponse(BaseModel):
    """Response schema for ETA prediction"""
    eta_seconds: int = Field(..., description="Estimated time of arrival in seconds")
    confidence: float = Field(..., ge=0, le=1, description="Prediction confidence score")

    class Config:
        json_schema_extra = {
            "example": {
                "eta_seconds": 630,
                "confidence": 0.86
            }
        }


class ReverseGeoResponse(BaseModel):
    """Response schema for reverse geocoding"""
    city: Optional[str] = None
    locality: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    postal_code: Optional[str] = None
    formatted_address: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "city": "Bangalore",
                "locality": "Koramangala",
                "state": "Karnataka",
                "country": "India",
                "postal_code": "560034",
                "formatted_address": "Koramangala, Bangalore, Karnataka 560034, India"
            }
        }


class HealthResponse(BaseModel):
    """Response schema for health check"""
    status: str
    model_loaded: bool = False
    queue_connected: bool = False
    redis_connected: bool = False
    version: str = "1.0.0"


class AsyncJobResponse(BaseModel):
    """Response schema for async job submission"""
    job_id: str
    status: str = "pending"
    message: str = "Job queued successfully"


class AsyncJobStatusResponse(BaseModel):
    """Response schema for async job status"""
    job_id: str
    status: str  # pending, processing, completed, failed
    result: Optional[ETAResponse] = None
    error: Optional[str] = None

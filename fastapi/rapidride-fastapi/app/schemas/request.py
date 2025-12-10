from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class LatLng(BaseModel):
    """Geographic coordinate pair"""
    lat: float = Field(..., ge=-90, le=90, description="Latitude")
    lng: float = Field(..., ge=-180, le=180, description="Longitude")


class FareRequest(BaseModel):
    """Request schema for fare calculation"""
    origin: LatLng
    destination: LatLng
    timestamp: str = Field(..., description="ISO-8601 timestamp")
    traffic_level: Optional[float] = Field(None, ge=0.5, le=3.0, description="Traffic multiplier (1.0 = normal)")
    user_id: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "origin": {"lat": 12.9716, "lng": 77.5946},
                "destination": {"lat": 12.9352, "lng": 77.6245},
                "timestamp": "2025-11-28T10:21:00+05:30",
                "traffic_level": 1.2,
                "user_id": "user_12345"
            }
        }


class ETARequest(BaseModel):
    """Request schema for ETA prediction"""
    origin: LatLng
    destination: LatLng
    timestamp: str = Field(..., description="ISO-8601 timestamp")
    traffic_level: Optional[float] = Field(None, ge=0.5, le=3.0, description="Traffic multiplier")
    historical_mean_eta: Optional[float] = Field(None, description="Historical average ETA in seconds")
    user_id: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "origin": {"lat": 12.9716, "lng": 77.5946},
                "destination": {"lat": 12.9352, "lng": 77.6245},
                "timestamp": "2025-11-28T10:21:00+05:30",
                "traffic_level": 1.2
            }
        }


class ReverseGeoRequest(BaseModel):
    """Request schema for reverse geocoding"""
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)


class AsyncJobRequest(BaseModel):
    """Request schema for async ETA prediction"""
    origin: LatLng
    destination: LatLng
    timestamp: str
    traffic_level: Optional[float] = None
    user_id: Optional[str] = None

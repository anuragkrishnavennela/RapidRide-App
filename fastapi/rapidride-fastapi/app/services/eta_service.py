from typing import Dict, Any, Optional
from app.schemas.response import ETAResponse
from app.utils.geo_utils import haversine_km
from app.utils.features import build_features_for_prediction
from app.utils.redis_client import cache_get, cache_set, generate_eta_key, TTL_ETA
from app.core.config import settings
from app.core.logging import get_logger
import os

logger = get_logger(__name__)

# Global model cache
_model = None
_model_loaded = False


def get_model():
    """Load and cache the ML model"""
    global _model, _model_loaded
    
    if _model is None:
        try:
            from app.models.infer import load_model
            model_path = settings.model_path
            
            if os.path.exists(model_path):
                _model = load_model(model_path)
                _model_loaded = True
                logger.info(f"Model loaded successfully from {model_path}")
            else:
                logger.warning(f"Model file not found at {model_path}, using baseline prediction")
                _model_loaded = False
        except Exception as e:
            logger.error(f"Failed to load model: {str(e)}")
            _model_loaded = False
    
    return _model


def is_model_loaded() -> bool:
    """Check if model is loaded"""
    return _model_loaded


def predict_eta_baseline(distance_km: float, traffic_level: float = 1.0) -> tuple[int, float]:
    """
    Baseline ETA prediction using simple heuristic.
    
    Args:
        distance_km: Distance in kilometers
        traffic_level: Traffic multiplier
    
    Returns:
        Tuple of (eta_seconds, confidence)
    """
    # Use average speed adjusted by traffic
    avg_speed = settings.avg_speed_kmh / traffic_level
    
    # Calculate time in hours, then convert to seconds
    time_hours = distance_km / avg_speed
    eta_seconds = int(time_hours * 3600)
    
    # Baseline has lower confidence
    confidence = 0.70
    
    return eta_seconds, confidence


def predict_eta(payload: Dict[str, Any]) -> ETAResponse:
    """
    Predict ETA using ML model or baseline heuristic.
    Uses Redis caching for improved performance.
    
    Args:
        payload: Request payload with origin, destination, timestamp, traffic_level
    
    Returns:
        ETAResponse with predicted ETA and confidence
    """
    try:
        origin = payload["origin"]
        destination = payload["destination"]
        timestamp = payload["timestamp"]
        traffic_level = payload.get("traffic_level", 1.0)
        historical_mean_eta = payload.get("historical_mean_eta")
        
        # Check cache first
        cache_key = generate_eta_key(origin, destination, traffic_level)
        cached = cache_get(cache_key)
        if cached:
            logger.info(f"Cache HIT for ETA: {cache_key}")
            return ETAResponse(**cached)
        
        # Calculate distance
        distance_km = haversine_km(origin, destination)
        
        # Try to use ML model first
        model = get_model()
        
        if model is not None and _model_loaded:
            # Use ML model for prediction
            from app.models.infer import predict
            
            features = build_features_for_prediction(
                origin=origin,
                destination=destination,
                distance_km=distance_km,
                timestamp=timestamp,
                traffic_level=traffic_level,
                historical_mean_eta=historical_mean_eta
            )
            
            eta_seconds, confidence = predict(model, features)
            logger.info(f"ML model prediction: {eta_seconds}s (confidence: {confidence})")
        else:
            # Fall back to baseline prediction
            eta_seconds, confidence = predict_eta_baseline(distance_km, traffic_level)
            logger.info(f"Baseline prediction: {eta_seconds}s (confidence: {confidence})")
        
        result = ETAResponse(
            eta_seconds=int(eta_seconds),
            confidence=round(confidence, 2)
        )
        
        # Cache the result
        cache_set(cache_key, result.model_dump(), TTL_ETA)
        
        return result
        
    except Exception as e:
        logger.error(f"Error predicting ETA: {str(e)}")
        raise

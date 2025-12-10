from datetime import datetime
from typing import Dict, Any
import math


def extract_time_features(timestamp_str: str) -> Dict[str, Any]:
    """
    Extract time-based features from ISO-8601 timestamp.
    
    Args:
        timestamp_str: ISO-8601 formatted timestamp string
    
    Returns:
        Dictionary with extracted time features
    """
    try:
        # Parse ISO-8601 timestamp
        dt = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
        
        return {
            'hour': dt.hour,
            'day_of_week': dt.weekday(),  # 0 = Monday, 6 = Sunday
            'is_weekend': 1 if dt.weekday() >= 5 else 0,
            'is_rush_hour': 1 if (7 <= dt.hour <= 10) or (17 <= dt.hour <= 20) else 0,
            'month': dt.month,
            'day': dt.day,
        }
    except Exception:
        # Return default values if parsing fails
        return {
            'hour': 12,
            'day_of_week': 2,
            'is_weekend': 0,
            'is_rush_hour': 0,
            'month': 1,
            'day': 1,
        }


def compute_zone_features(coord: Dict[str, float]) -> Dict[str, Any]:
    """
    Compute zone-based features from coordinates.
    Simple grid-based zoning for demonstration.
    
    Args:
        coord: Dictionary with 'lat' and 'lng' keys
    
    Returns:
        Dictionary with zone features
    """
    # Simple grid-based zoning (0.1 degree cells)
    zone_lat = math.floor(coord['lat'] / 0.1)
    zone_lng = math.floor(coord['lng'] / 0.1)
    
    return {
        'zone_id': f"{zone_lat}_{zone_lng}",
        'zone_lat': zone_lat,
        'zone_lng': zone_lng,
    }


def build_features_for_prediction(
    origin: Dict[str, float],
    destination: Dict[str, float],
    distance_km: float,
    timestamp: str,
    traffic_level: float = 1.0,
    historical_mean_eta: float = None
) -> Dict[str, Any]:
    """
    Build feature dictionary for ETA prediction model.
    
    Args:
        origin: Origin coordinates
        destination: Destination coordinates
        distance_km: Distance in kilometers
        timestamp: ISO-8601 timestamp
        traffic_level: Traffic multiplier
        historical_mean_eta: Historical average ETA (optional)
    
    Returns:
        Feature dictionary ready for model input
    """
    time_features = extract_time_features(timestamp)
    origin_zone = compute_zone_features(origin)
    dest_zone = compute_zone_features(destination)
    
    features = {
        'distance_km': distance_km,
        'traffic_level': traffic_level,
        **time_features,
        'origin_zone_lat': origin_zone['zone_lat'],
        'origin_zone_lng': origin_zone['zone_lng'],
        'dest_zone_lat': dest_zone['zone_lat'],
        'dest_zone_lng': dest_zone['zone_lng'],
    }
    
    if historical_mean_eta is not None:
        features['historical_mean_eta'] = historical_mean_eta
    
    return features

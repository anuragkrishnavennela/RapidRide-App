import math
from typing import Dict


def haversine_km(coord1: Dict[str, float], coord2: Dict[str, float]) -> float:
    """
    Calculate the great circle distance between two points on Earth
    using the Haversine formula.
    
    Args:
        coord1: Dictionary with 'lat' and 'lng' keys
        coord2: Dictionary with 'lat' and 'lng' keys
    
    Returns:
        Distance in kilometers (rounded to 3 decimals)
    """
    # Earth's radius in kilometers
    R = 6371.0
    
    # Convert latitude and longitude from degrees to radians
    lat1 = math.radians(coord1['lat'])
    lon1 = math.radians(coord1['lng'])
    lat2 = math.radians(coord2['lat'])
    lon2 = math.radians(coord2['lng'])
    
    # Haversine formula
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    
    a = math.sin(dlat / 2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    distance = R * c
    
    # Round to 3 decimal places
    return round(distance, 3)


def calculate_bearing(coord1: Dict[str, float], coord2: Dict[str, float]) -> float:
    """
    Calculate the bearing (direction) from coord1 to coord2.
    
    Args:
        coord1: Dictionary with 'lat' and 'lng' keys
        coord2: Dictionary with 'lat' and 'lng' keys
    
    Returns:
        Bearing in degrees (0-360)
    """
    lat1 = math.radians(coord1['lat'])
    lon1 = math.radians(coord1['lng'])
    lat2 = math.radians(coord2['lat'])
    lon2 = math.radians(coord2['lng'])
    
    dlon = lon2 - lon1
    
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    
    bearing = math.atan2(x, y)
    bearing = math.degrees(bearing)
    bearing = (bearing + 360) % 360
    
    return round(bearing, 2)


def is_valid_coordinate(lat: float, lng: float) -> bool:
    """
    Validate latitude and longitude values.
    
    Args:
        lat: Latitude value
        lng: Longitude value
    
    Returns:
        True if coordinates are valid, False otherwise
    """
    return -90 <= lat <= 90 and -180 <= lng <= 180

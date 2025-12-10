import pytest


@pytest.fixture
def sample_fare_request():
    """Sample fare calculation request"""
    return {
        "origin": {"lat": 12.9716, "lng": 77.5946},
        "destination": {"lat": 12.9352, "lng": 77.6245},
        "timestamp": "2025-11-28T10:21:00+05:30",
        "traffic_level": 1.0
    }


@pytest.fixture
def sample_eta_request():
    """Sample ETA prediction request"""
    return {
        "origin": {"lat": 12.9716, "lng": 77.5946},
        "destination": {"lat": 12.9352, "lng": 77.6245},
        "timestamp": "2025-11-28T10:21:00+05:30",
        "traffic_level": 1.0
    }

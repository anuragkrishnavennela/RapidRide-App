import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_calculate_fare_basic():
    """Test basic fare calculation"""
    payload = {
        "origin": {"lat": 12.9716, "lng": 77.5946},
        "destination": {"lat": 12.9352, "lng": 77.6245},
        "timestamp": "2025-11-28T10:21:00+05:30",
        "traffic_level": 1.0
    }
    
    response = client.post("/fare/calc", json=payload)
    
    assert response.status_code == 200
    data = response.json()
    
    # Check response structure
    assert "fare" in data
    assert "distance_km" in data
    assert "currency" in data
    
    # Check data types
    assert isinstance(data["fare"], (int, float))
    assert isinstance(data["distance_km"], (int, float))
    assert isinstance(data["currency"], str)
    
    # Check reasonable values
    assert data["fare"] > 0
    assert data["distance_km"] > 0
    assert data["currency"] == "INR"


def test_calculate_fare_with_traffic():
    """Test fare calculation with traffic multiplier"""
    payload = {
        "origin": {"lat": 12.9716, "lng": 77.5946},
        "destination": {"lat": 12.9352, "lng": 77.6245},
        "timestamp": "2025-11-28T10:21:00+05:30",
        "traffic_level": 1.5
    }
    
    response = client.post("/fare/calc", json=payload)
    assert response.status_code == 200
    
    data = response.json()
    
    # Fare with traffic should be higher
    # Compare with base traffic (1.0)
    base_payload = {**payload, "traffic_level": 1.0}
    base_response = client.post("/fare/calc", json=base_payload)
    base_data = base_response.json()
    
    assert data["fare"] > base_data["fare"]


def test_calculate_fare_invalid_coordinates():
    """Test fare calculation with invalid coordinates"""
    payload = {
        "origin": {"lat": 200, "lng": 77.5946},  # Invalid latitude
        "destination": {"lat": 12.9352, "lng": 77.6245},
        "timestamp": "2025-11-28T10:21:00+05:30"
    }
    
    response = client.post("/fare/calc", json=payload)
    assert response.status_code == 422  # Validation error


def test_calculate_fare_missing_fields():
    """Test fare calculation with missing required fields"""
    payload = {
        "origin": {"lat": 12.9716, "lng": 77.5946},
        # Missing destination
        "timestamp": "2025-11-28T10:21:00+05:30"
    }
    
    response = client.post("/fare/calc", json=payload)
    assert response.status_code == 422  # Validation error


def test_fare_response_contract():
    """Test that fare response follows the contract"""
    payload = {
        "origin": {"lat": 12.9716, "lng": 77.5946},
        "destination": {"lat": 12.9352, "lng": 77.6245},
        "timestamp": "2025-11-28T10:21:00+05:30"
    }
    
    response = client.post("/fare/calc", json=payload)
    data = response.json()
    
    # Verify contract: { "fare": float, "distance_km": float, "currency": str }
    assert set(data.keys()) == {"fare", "distance_km", "currency"}
    assert isinstance(data["fare"], (int, float))
    assert isinstance(data["distance_km"], (int, float))
    assert isinstance(data["currency"], str)

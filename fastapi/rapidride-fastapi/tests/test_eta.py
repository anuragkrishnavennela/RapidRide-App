import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_predict_eta_basic():
    """Test basic ETA prediction"""
    payload = {
        "origin": {"lat": 12.9716, "lng": 77.5946},
        "destination": {"lat": 12.9352, "lng": 77.6245},
        "timestamp": "2025-11-28T10:21:00+05:30",
        "traffic_level": 1.0
    }
    
    response = client.post("/predict/eta", json=payload)
    
    assert response.status_code == 200
    data = response.json()
    
    # Check response structure
    assert "eta_seconds" in data
    assert "confidence" in data
    
    # Check data types
    assert isinstance(data["eta_seconds"], int)
    assert isinstance(data["confidence"], (int, float))
    
    # Check reasonable values
    assert data["eta_seconds"] > 0
    assert 0 <= data["confidence"] <= 1


def test_predict_eta_with_traffic():
    """Test ETA prediction with different traffic levels"""
    base_payload = {
        "origin": {"lat": 12.9716, "lng": 77.5946},
        "destination": {"lat": 12.9352, "lng": 77.6245},
        "timestamp": "2025-11-28T10:21:00+05:30",
        "traffic_level": 1.0
    }
    
    heavy_traffic_payload = {**base_payload, "traffic_level": 2.0}
    
    base_response = client.post("/predict/eta", json=base_payload)
    heavy_response = client.post("/predict/eta", json=heavy_traffic_payload)
    
    assert base_response.status_code == 200
    assert heavy_response.status_code == 200
    
    base_data = base_response.json()
    heavy_data = heavy_response.json()
    
    # ETA with heavy traffic should be longer
    assert heavy_data["eta_seconds"] > base_data["eta_seconds"]


def test_predict_eta_with_historical():
    """Test ETA prediction with historical mean"""
    payload = {
        "origin": {"lat": 12.9716, "lng": 77.5946},
        "destination": {"lat": 12.9352, "lng": 77.6245},
        "timestamp": "2025-11-28T10:21:00+05:30",
        "traffic_level": 1.0,
        "historical_mean_eta": 600.0
    }
    
    response = client.post("/predict/eta", json=payload)
    assert response.status_code == 200
    
    data = response.json()
    assert data["eta_seconds"] > 0


def test_predict_eta_invalid_coordinates():
    """Test ETA prediction with invalid coordinates"""
    payload = {
        "origin": {"lat": -100, "lng": 77.5946},  # Invalid latitude
        "destination": {"lat": 12.9352, "lng": 77.6245},
        "timestamp": "2025-11-28T10:21:00+05:30"
    }
    
    response = client.post("/predict/eta", json=payload)
    assert response.status_code == 422


def test_eta_response_contract():
    """Test that ETA response follows the contract"""
    payload = {
        "origin": {"lat": 12.9716, "lng": 77.5946},
        "destination": {"lat": 12.9352, "lng": 77.6245},
        "timestamp": "2025-11-28T10:21:00+05:30"
    }
    
    response = client.post("/predict/eta", json=payload)
    data = response.json()
    
    # Verify contract: { "eta_seconds": int, "confidence": float }
    assert set(data.keys()) == {"eta_seconds", "confidence"}
    assert isinstance(data["eta_seconds"], int)
    assert isinstance(data["confidence"], (int, float))
    assert 0 <= data["confidence"] <= 1

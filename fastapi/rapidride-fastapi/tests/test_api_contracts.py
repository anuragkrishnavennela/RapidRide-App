import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


class TestAPIContracts:
    """Test suite to verify API responses follow integration contracts"""
    
    def test_health_endpoint(self):
        """Test health endpoint contract"""
        response = client.get("/health")
        assert response.status_code == 200
        
        data = response.json()
        
        # Required fields
        assert "status" in data
        assert "model_loaded" in data
        assert "queue_connected" in data
        assert "version" in data
        
        # Type checks
        assert isinstance(data["status"], str)
        assert isinstance(data["model_loaded"], bool)
        assert isinstance(data["queue_connected"], bool)
        assert isinstance(data["version"], str)
    
    def test_fare_calc_contract(self):
        """Test /fare/calc endpoint contract"""
        payload = {
            "origin": {"lat": 12.9716, "lng": 77.5946},
            "destination": {"lat": 12.9352, "lng": 77.6245},
            "timestamp": "2025-11-28T10:21:00+05:30",
            "traffic_level": 1.2
        }
        
        response = client.post("/fare/calc", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        
        # Contract: { "fare": float, "distance_km": float, "currency": str }
        required_fields = {"fare", "distance_km", "currency"}
        assert set(data.keys()) == required_fields
        
        # Type validation
        assert isinstance(data["fare"], (int, float))
        assert isinstance(data["distance_km"], (int, float))
        assert isinstance(data["currency"], str)
        
        # Value validation
        assert data["fare"] > 0
        assert data["distance_km"] > 0
        assert len(data["currency"]) == 3  # Currency code (INR, USD, etc.)
    
    def test_predict_eta_contract(self):
        """Test /predict/eta endpoint contract"""
        payload = {
            "origin": {"lat": 12.9716, "lng": 77.5946},
            "destination": {"lat": 12.9352, "lng": 77.6245},
            "timestamp": "2025-11-28T10:21:00+05:30",
            "traffic_level": 1.2
        }
        
        response = client.post("/predict/eta", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        
        # Contract: { "eta_seconds": int, "confidence": float }
        required_fields = {"eta_seconds", "confidence"}
        assert set(data.keys()) == required_fields
        
        # Type validation
        assert isinstance(data["eta_seconds"], int)
        assert isinstance(data["confidence"], (int, float))
        
        # Value validation
        assert data["eta_seconds"] > 0
        assert 0 <= data["confidence"] <= 1
    
    def test_reverse_geo_contract(self):
        """Test /geo/reverse endpoint contract"""
        response = client.get("/geo/reverse?lat=12.9716&lon=77.5946")
        assert response.status_code == 200
        
        data = response.json()
        
        # All fields should be present (even if None)
        expected_fields = {"city", "locality", "state", "country", "postal_code", "formatted_address"}
        assert set(data.keys()) == expected_fields
        
        # All values should be strings or None
        for key, value in data.items():
            assert value is None or isinstance(value, str)
    
    def test_timestamp_iso8601_format(self):
        """Test that ISO-8601 timestamps are accepted"""
        valid_timestamps = [
            "2025-11-28T10:21:00+05:30",
            "2025-11-28T10:21:00Z",
            "2025-11-28T10:21:00.123+05:30",
        ]
        
        for timestamp in valid_timestamps:
            payload = {
                "origin": {"lat": 12.9716, "lng": 77.5946},
                "destination": {"lat": 12.9352, "lng": 77.6245},
                "timestamp": timestamp
            }
            
            response = client.post("/fare/calc", json=payload)
            assert response.status_code == 200, f"Failed for timestamp: {timestamp}"
    
    def test_coordinate_validation(self):
        """Test coordinate validation"""
        invalid_coords = [
            {"lat": 91, "lng": 77.5946},   # lat > 90
            {"lat": -91, "lng": 77.5946},  # lat < -90
            {"lat": 12.9716, "lng": 181},  # lng > 180
            {"lat": 12.9716, "lng": -181}, # lng < -180
        ]
        
        for coord in invalid_coords:
            payload = {
                "origin": coord,
                "destination": {"lat": 12.9352, "lng": 77.6245},
                "timestamp": "2025-11-28T10:21:00+05:30"
            }
            
            response = client.post("/fare/calc", json=payload)
            assert response.status_code == 422  # Validation error
    
    def test_root_endpoint(self):
        """Test root endpoint"""
        response = client.get("/")
        assert response.status_code == 200
        
        data = response.json()
        assert "message" in data
        assert "version" in data
        assert "docs" in data
        assert "health" in data

# Example API Requests

## Using cURL

### Health Check
```bash
curl -X GET "http://localhost:8001/health"
```

### Fare Calculation
```bash
curl -X POST "http://localhost:8001/fare/calc" \
  -H "Content-Type: application/json" \
  -d '{
    "origin": {"lat": 12.9716, "lng": 77.5946},
    "destination": {"lat": 12.9352, "lng": 77.6245},
    "timestamp": "2025-11-28T10:21:00+05:30",
    "traffic_level": 1.2
  }'
```

### ETA Prediction
```bash
curl -X POST "http://localhost:8001/predict/eta" \
  -H "Content-Type: application/json" \
  -d '{
    "origin": {"lat": 12.9716, "lng": 77.5946},
    "destination": {"lat": 12.9352, "lng": 77.6245},
    "timestamp": "2025-11-28T10:21:00+05:30",
    "traffic_level": 1.2
  }'
```

### Reverse Geocoding
```bash
curl -X GET "http://localhost:8001/geo/reverse?lat=12.9716&lon=77.5946"
```

### Async ETA Prediction
```bash
# Submit job
curl -X POST "http://localhost:8001/predict/eta/async" \
  -H "Content-Type: application/json" \
  -d '{
    "origin": {"lat": 12.9716, "lng": 77.5946},
    "destination": {"lat": 12.9352, "lng": 77.6245},
    "timestamp": "2025-11-28T10:21:00+05:30"
  }'

# Check status (replace {job_id} with actual job ID)
curl -X GET "http://localhost:8001/predict/eta/status/{job_id}"
```

## Using PowerShell

### Health Check
```powershell
Invoke-RestMethod -Uri "http://localhost:8001/health" -Method Get
```

### Fare Calculation
```powershell
$body = @{
    origin = @{lat = 12.9716; lng = 77.5946}
    destination = @{lat = 12.9352; lng = 77.6245}
    timestamp = "2025-11-28T10:21:00+05:30"
    traffic_level = 1.2
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8001/fare/calc" `
    -Method Post `
    -Body $body `
    -ContentType "application/json"
```

### ETA Prediction
```powershell
$body = @{
    origin = @{lat = 12.9716; lng = 77.5946}
    destination = @{lat = 12.9352; lng = 77.6245}
    timestamp = "2025-11-28T10:21:00+05:30"
    traffic_level = 1.2
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8001/predict/eta" `
    -Method Post `
    -Body $body `
    -ContentType "application/json"
```

## Using Python

```python
import requests
from datetime import datetime

# Base URL
BASE_URL = "http://localhost:8001"

# Health check
response = requests.get(f"{BASE_URL}/health")
print(response.json())

# Fare calculation
fare_request = {
    "origin": {"lat": 12.9716, "lng": 77.5946},
    "destination": {"lat": 12.9352, "lng": 77.6245},
    "timestamp": datetime.now().isoformat(),
    "traffic_level": 1.2
}

response = requests.post(f"{BASE_URL}/fare/calc", json=fare_request)
print(f"Fare: {response.json()}")

# ETA prediction
eta_request = {
    "origin": {"lat": 12.9716, "lng": 77.5946},
    "destination": {"lat": 12.9352, "lng": 77.6245},
    "timestamp": datetime.now().isoformat(),
    "traffic_level": 1.2
}

response = requests.post(f"{BASE_URL}/predict/eta", json=eta_request)
print(f"ETA: {response.json()}")
```

## Using JavaScript/Node.js

```javascript
const BASE_URL = 'http://localhost:8001';

// Fare calculation
async function calculateFare() {
  const response = await fetch(`${BASE_URL}/fare/calc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin: { lat: 12.9716, lng: 77.5946 },
      destination: { lat: 12.9352, lng: 77.6245 },
      timestamp: new Date().toISOString(),
      traffic_level: 1.2
    })
  });
  
  const data = await response.json();
  console.log('Fare:', data);
}

// ETA prediction
async function predictETA() {
  const response = await fetch(`${BASE_URL}/predict/eta`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin: { lat: 12.9716, lng: 77.5946 },
      destination: { lat: 12.9352, lng: 77.6245 },
      timestamp: new Date().toISOString(),
      traffic_level: 1.2
    })
  });
  
  const data = await response.json();
  console.log('ETA:', data);
}

calculateFare();
predictETA();
```

## Expected Responses

### Fare Response
```json
{
  "fare": 145.50,
  "distance_km": 7.134,
  "currency": "INR"
}
```

### ETA Response
```json
{
  "eta_seconds": 630,
  "confidence": 0.86
}
```

### Reverse Geocoding Response
```json
{
  "city": "Bangalore",
  "locality": "Koramangala",
  "state": "Karnataka",
  "country": "India",
  "postal_code": "560034",
  "formatted_address": "Koramangala, Bangalore, Karnataka 560034, India"
}
```

### Health Response
```json
{
  "status": "ok",
  "model_loaded": true,
  "queue_connected": true,
  "version": "1.0.0"
}
```

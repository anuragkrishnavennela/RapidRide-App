# RapidRide FastAPI - Quick Start Guide

## Prerequisites Check

1. **Python 3.11+**
```powershell
python --version
```

2. **Docker** (optional, for RabbitMQ/Redis)
```powershell
docker --version
```

## Quick Setup (5 minutes)

### Step 1: Navigate to Project
```powershell
cd "c:\Users\Anurag Krishna\Downloads\PS - 1\PS - 1\rapidride-fastapi"
```

### Step 2: Create Virtual Environment
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

### Step 3: Install Dependencies
```powershell
pip install -r requirements.txt
```

### Step 4: Setup Environment
```powershell
cp .env.example .env
```

### Step 5: Start Infrastructure (Docker)
```powershell
# Start RabbitMQ and Redis
docker run -d -p 5672:5672 -p 15672:15672 --name rabbitmq rabbitmq:3.12-management
docker run -d -p 6379:6379 --name redis redis:7-alpine
```

**OR** use docker-compose:
```powershell
cd docker
docker-compose up -d rabbitmq redis
cd ..
```

### Step 6: Generate Sample Data (Optional)
```powershell
python data/generate_sample_data.py
```

### Step 7: Train Model (Optional)
```powershell
python -c "from app.models.trainer import train_model; train_model('data/processed/training_data.csv')"
```

### Step 8: Start FastAPI Server
```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

### Step 9: Start Celery Worker (Optional, in new terminal)
```powershell
cd "c:\Users\Anurag Krishna\Downloads\PS - 1\PS - 1\rapidride-fastapi"
.\venv\Scripts\Activate.ps1
celery -A app.tasks.celery_app.app worker --loglevel=info -Q rapidride
```

## Verify Installation

1. **Health Check**
```powershell
Invoke-RestMethod -Uri "http://localhost:8001/health"
```

2. **API Documentation**
- Open browser: http://localhost:8001/docs

3. **Test Fare Calculation**
```powershell
$body = @{
    origin = @{lat = 12.9716; lng = 77.5946}
    destination = @{lat = 12.9352; lng = 77.6245}
    timestamp = (Get-Date).ToString("o")
    traffic_level = 1.2
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8001/fare/calc" -Method Post -Body $body -ContentType "application/json"
```

## Quick Test Commands

```powershell
# Health
Invoke-RestMethod -Uri "http://localhost:8001/health"

# Fare (replace with actual coordinates)
Invoke-RestMethod -Uri "http://localhost:8001/fare/calc" -Method Post -Body '{"origin":{"lat":12.9716,"lng":77.5946},"destination":{"lat":12.9352,"lng":77.6245},"timestamp":"2025-11-28T10:21:00+05:30","traffic_level":1.2}' -ContentType "application/json"

# ETA
Invoke-RestMethod -Uri "http://localhost:8001/predict/eta" -Method Post -Body '{"origin":{"lat":12.9716,"lng":77.5946},"destination":{"lat":12.9352,"lng":77.6245},"timestamp":"2025-11-28T10:21:00+05:30"}' -ContentType "application/json"

# Geocoding
Invoke-RestMethod -Uri "http://localhost:8001/geo/reverse?lat=12.9716&lon=77.5946"
```

## Docker Deployment (Alternative)

If you prefer full Docker setup:

```powershell
cd docker
docker-compose up -d
```

This starts everything: FastAPI, RabbitMQ, Redis, and Celery worker.

Access: http://localhost:8001/docs

## Troubleshooting

### Port Already in Use
```powershell
# Check what's using port 8001
netstat -ano | findstr :8001

# Kill process (replace PID)
taskkill /PID <PID> /F
```

### RabbitMQ Connection Failed
```powershell
# Check if RabbitMQ is running
docker ps | findstr rabbitmq

# Restart RabbitMQ
docker restart rabbitmq
```

### Import Errors
```powershell
# Ensure virtual environment is activated
.\venv\Scripts\Activate.ps1

# Reinstall dependencies
pip install -r requirements.txt
```

## Next Steps

1. **Integrate with Node Backend**: See `EXAMPLES.md` for integration code
2. **Train Custom Model**: Add your ride data to `data/raw/` and run preprocessing
3. **Configure Production**: Update `.env` with production settings
4. **Add Monitoring**: Enable Elasticsearch/Kibana with `docker-compose --profile full up -d`

## Resources

- API Docs: http://localhost:8001/docs
- RabbitMQ Management: http://localhost:15672 (guest/guest)
- Contract Spec: `API_CONTRACT.json`
- Examples: `EXAMPLES.md`
- Main README: `README.md`

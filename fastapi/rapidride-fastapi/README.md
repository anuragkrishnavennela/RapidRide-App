# RapidRide FastAPI Microservices

FastAPI microservices for RapidRide providing fare calculation, ETA prediction, and reverse geocoding with ML integration, RabbitMQ message queuing, and Celery async task processing.

## 🚀 Features

- **Fare Calculation**: Distance-based fare computation with traffic adjustments
- **ETA Prediction**: ML-powered ETA estimation with baseline fallback
- **Reverse Geocoding**: Convert coordinates to location details
- **Async Job Processing**: Celery tasks for heavy operations (model training, bulk predictions)
- **Message Queue Integration**: RabbitMQ for event-driven architecture
- **Docker Support**: Complete containerization with docker-compose
- **API Documentation**: Auto-generated Swagger/OpenAPI docs
- **Unit Tests**: Comprehensive test coverage with contract validation

## 📋 Prerequisites

- Python 3.11+
- Docker & Docker Compose (optional, for containerized deployment)
- RabbitMQ (for message queuing)
- Redis (for Celery backend)

## 🛠️ Installation

### Local Development Setup

1. **Clone the repository**
```powershell
cd "c:\Users\Anurag Krishna\Downloads\PS - 1\PS - 1\rapidride-fastapi"
```

2. **Create virtual environment**
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

3. **Install dependencies**
```powershell
pip install -r requirements.txt
```

4. **Configure environment**
```powershell
cp .env.example .env
# Edit .env with your configuration
```

5. **Start RabbitMQ and Redis** (if not using Docker)
```powershell
# Using Docker for RabbitMQ and Redis only
docker run -d -p 5672:5672 -p 15672:15672 --name rabbitmq rabbitmq:3.12-management
docker run -d -p 6379:6379 --name redis redis:7-alpine
```

6. **Run the FastAPI server**
```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

7. **Start Celery worker** (in a separate terminal)
```powershell
celery -A app.tasks.celery_app.app worker --loglevel=info -Q rapidride
```

### Docker Deployment

```powershell
cd docker
docker-compose up -d
```

This starts:
- FastAPI service (port 8001)
- RabbitMQ (ports 5672, 15672)
- Redis (port 6379)
- Celery worker

For full deployment with Elasticsearch and Kibana:
```powershell
docker-compose --profile full up -d
```

## 📚 API Documentation

Once the server is running, access:
- **Swagger UI**: http://localhost:8001/docs
- **ReDoc**: http://localhost:8001/redoc
- **OpenAPI JSON**: http://localhost:8001/openapi.json

## 🔌 API Endpoints

### Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "model_loaded": true,
  "queue_connected": true,
  "version": "1.0.0"
}
```

### Fare Calculation
```http
POST /fare/calc
```

**Request:**
```json
{
  "origin": {"lat": 12.9716, "lng": 77.5946},
  "destination": {"lat": 12.9352, "lng": 77.6245},
  "timestamp": "2025-11-28T10:21:00+05:30",
  "traffic_level": 1.2
}
```

**Response:**
```json
{
  "fare": 145.50,
  "distance_km": 7.134,
  "currency": "INR"
}
```

### ETA Prediction
```http
POST /predict/eta
```

**Request:**
```json
{
  "origin": {"lat": 12.9716, "lng": 77.5946},
  "destination": {"lat": 12.9352, "lng": 77.6245},
  "timestamp": "2025-11-28T10:21:00+05:30",
  "traffic_level": 1.2
}
```

**Response:**
```json
{
  "eta_seconds": 630,
  "confidence": 0.86
}
```

### Async ETA Prediction
```http
POST /predict/eta/async
```

**Response:**
```json
{
  "job_id": "abc123-def456",
  "status": "pending",
  "message": "ETA prediction job queued successfully"
}
```

Check status:
```http
GET /predict/eta/status/{job_id}
```

### Reverse Geocoding
```http
GET /geo/reverse?lat=12.9716&lon=77.5946
```

**Response:**
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

## 🧪 Testing

Run all tests:
```powershell
pytest
```

Run with coverage:
```powershell
pytest --cov=app --cov-report=html
```

Run specific test file:
```powershell
pytest tests/test_fare.py -v
```

## 🤖 Machine Learning

### Training the Model

1. **Prepare training data** (CSV format):
```csv
distance_km,traffic_level,hour,day_of_week,is_weekend,is_rush_hour,origin_zone_lat,origin_zone_lng,dest_zone_lat,dest_zone_lng,eta_seconds
7.134,1.2,10,2,0,1,129,775,129,776,630
```

2. **Train model**:
```python
from app.models.trainer import train_model

train_model("data/processed/training_data.csv", "app/models/model.pkl")
```

Or use Celery task:
```python
from app.tasks.tasks import train_model_task

task = train_model_task.delay("data/processed/training_data.csv")
```

### Model Features

The ETA prediction model uses:
- Distance (km)
- Traffic level
- Time of day (hour)
- Day of week
- Weekend indicator
- Rush hour indicator
- Origin/destination zones

## 📦 Project Structure

```
rapidride-fastapi/
├── app/
│   ├── main.py              # FastAPI app entry point
│   ├── api/                 # API route handlers
│   │   ├── fare.py
│   │   ├── eta.py
│   │   └── geo.py
│   ├── core/                # Core configuration
│   │   ├── config.py
│   │   └── logging.py
│   ├── services/            # Business logic
│   │   ├── fare_service.py
│   │   ├── eta_service.py
│   │   └── geo_service.py
│   ├── models/              # ML models
│   │   ├── trainer.py
│   │   └── infer.py
│   ├── tasks/               # Celery tasks
│   │   ├── celery_app.py
│   │   └── tasks.py
│   ├── schemas/             # Pydantic models
│   │   ├── request.py
│   │   └── response.py
│   └── utils/               # Utilities
│       ├── geo_utils.py
│       ├── features.py
│       └── rmq.py
├── data/
│   ├── raw/                 # Raw data
│   └── processed/           # Processed data
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
├── tests/                   # Unit tests
├── requirements.txt
├── .env.example
└── README.md
```

## ⚙️ Configuration

Environment variables (`.env`):

```env
# FastAPI
FASTAPI_HOST=0.0.0.0
FASTAPI_PORT=8001
LOG_LEVEL=INFO

# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672//

# Celery
CELERY_BROKER_URL=amqp://guest:guest@localhost:5672//
CELERY_RESULT_BACKEND=rpc://

# Redis
REDIS_URL=redis://localhost:6379/0

# Model
MODEL_PATH=app/models/model.pkl

# Service Config
CURRENCY=INR
BASE_FARE=20.0
PER_KM_RATE=8.0
AVG_SPEED_KMH=30.0
```

## 🔄 RabbitMQ Integration

### Publishing Events

```python
from app.utils.rmq import publish_event

publish_event(
    queue="ride_events",
    payload={
        "event_type": "ride_completed",
        "ride_id": "12345",
        "fare": 145.50,
        "eta_seconds": 630
    }
)
```

### Consuming Events

```python
from app.utils.rmq import create_consumer

def callback(ch, method, properties, body):
    data = json.loads(body)
    print(f"Received: {data}")
    ch.basic_ack(delivery_tag=method.delivery_tag)

create_consumer("ride_events", callback)
```

## 📊 Performance

Target response times (dev machine):
- `/fare/calc`: < 50ms
- `/predict/eta`: < 200ms (baseline) / < 400ms (ML model)
- `/geo/reverse`: < 500ms (depends on external API)

## 🔗 Integration with Node Backend

The Node.js backend can call these endpoints:

```javascript
// Fare calculation
const fareResponse = await fetch('http://localhost:8001/fare/calc', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    origin: { lat: 12.9716, lng: 77.5946 },
    destination: { lat: 12.9352, lng: 77.6245 },
    timestamp: new Date().toISOString(),
    traffic_level: 1.2
  })
});

const fareData = await fareResponse.json();
// { fare: 145.50, distance_km: 7.134, currency: "INR" }
```

## 🐛 Troubleshooting

### Model not loading
- Check `MODEL_PATH` in `.env`
- Ensure model file exists: `app/models/model.pkl`
- Train a new model if needed

### RabbitMQ connection failed
- Verify RabbitMQ is running: `docker ps`
- Check `RABBITMQ_URL` in `.env`
- RabbitMQ management UI: http://localhost:15672 (guest/guest)

### Celery worker not processing tasks
- Ensure RabbitMQ is running
- Check worker logs: `celery -A app.tasks.celery_app.app worker --loglevel=debug`
- Verify queue name matches: `rapidride`

## 📝 License

MIT License - See LICENSE file for details

## 👤 Author

Anurag Krishna

## 🙏 Acknowledgments

- FastAPI framework
- Celery for distributed task processing
- RabbitMQ for message queuing
- Scikit-learn for ML capabilities

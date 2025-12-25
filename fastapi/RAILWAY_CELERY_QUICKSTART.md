# Railway Celery Quick Start

## TL;DR - 5 Steps to Deploy Celery on Railway

### 1. Set Up Message Broker (5 minutes)
- Go to [CloudAMQP](https://www.cloudamqp.com/)
- Create free "Little Lemur" instance
- Copy the AMQP URL

### 2. Add Environment Variables to Railway
In your **existing FastAPI service**, add:
```
CELERY_BROKER_URL=amqp://user:pass@host.cloudamqp.com/vhost
RABBITMQ_URL=amqp://user:pass@host.cloudamqp.com/vhost
CELERY_RESULT_BACKEND=rpc://
```

### 3. Create Celery Worker Service
In Railway dashboard:
1. Click "New Service" → "GitHub Repo"
2. Select your repository
3. Name: `rapidride-celery-worker`
4. Root Directory: `fastapi`
5. Start Command: 
   ```bash
   celery -A app.tasks.celery_app.app worker --loglevel=info -Q rapidride
   ```
6. Copy all environment variables from FastAPI service
7. Deploy

### 4. Verify Deployment
Check Celery worker logs for:
```
[INFO] Connected to amqp://...
[INFO] celery@hostname ready.
```

### 5. Test Background Tasks
```bash
# Trigger model training
curl -X POST https://your-api.railway.app/tasks/train-model \
  -H "Content-Type: application/json" \
  -d '{"dataset_path": "data/training_rides.csv"}'

# Check status
curl https://your-api.railway.app/tasks/{task_id}
```

## Available Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/tasks/train-model` | POST | Trigger background model training |
| `/tasks/{task_id}` | GET | Check task status |
| `/tasks/{task_id}` | DELETE | Cancel running task |
| `/tasks/` | GET | List all active tasks |

## Cost
**$0/month** - Everything runs on free tiers:
- Railway: 500 hrs/month per service (2 services = 1000 hrs)
- CloudAMQP: Free "Little Lemur" plan

## Common Issues

**Worker not starting:**
- Check start command is exactly: `celery -A app.tasks.celery_app.app worker --loglevel=info -Q rapidride`
- Verify `CELERY_BROKER_URL` is set

**Tasks not executing:**
- Ensure both services have same `CELERY_BROKER_URL`
- Check worker logs for connection errors

**Model file not found:**
- Commit `model.pkl` to git, OR
- Run training task after deployment

## Full Documentation
See [`railway-celery-setup.md`](file:///C:/Users/Anurag%20Krishna/.gemini/antigravity/brain/04b61794-0fec-4022-b812-107a39af4ea0/railway-celery-setup.md) for detailed setup guide.

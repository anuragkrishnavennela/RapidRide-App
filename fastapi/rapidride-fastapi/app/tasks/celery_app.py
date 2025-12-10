from celery import Celery
import os
from app.core.config import settings

# Create Celery app
app = Celery(
    "rapidride_tasks",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend
)

# Configure Celery
app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    task_routes={
        'app.tasks.tasks.*': {'queue': 'rapidride'}
    },
    task_track_started=True,
    task_time_limit=3600,  # 1 hour max
    task_soft_time_limit=3000,  # 50 minutes soft limit
)

# Auto-discover tasks
app.autodiscover_tasks(['app.tasks'])

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.tasks.tasks import train_model_task, async_eta_prediction_task, bulk_eta_prediction_task
from app.tasks.celery_app import app as celery_app
from app.core.logging import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/tasks", tags=["Background Tasks"])


class TrainModelRequest(BaseModel):
    """Request model for training"""
    dataset_path: str = "data/training_rides.csv"
    model_path: str = "app/models/model.pkl"


class TaskResponse(BaseModel):
    """Response model for task submission"""
    task_id: str
    status: str
    message: str


class TaskStatusResponse(BaseModel):
    """Response model for task status"""
    task_id: str
    status: str
    result: Optional[dict] = None
    error: Optional[str] = None


@router.post("/train-model", response_model=TaskResponse)
async def trigger_model_training(request: TrainModelRequest):
    """
    Trigger async model training task.
    
    This will retrain the ETA prediction model in the background.
    Use the returned task_id to check progress.
    """
    try:
        task = train_model_task.delay(request.dataset_path, request.model_path)
        logger.info(f"Model training task started: {task.id}")
        
        return TaskResponse(
            task_id=task.id,
            status="started",
            message="Model training task submitted successfully"
        )
    except Exception as e:
        logger.error(f"Failed to start training task: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{task_id}", response_model=TaskStatusResponse)
async def get_task_status(task_id: str):
    """
    Get the status of a background task.
    
    Returns:
    - PENDING: Task is waiting to be executed
    - STARTED: Task has been started
    - PROGRESS: Task is in progress
    - SUCCESS: Task completed successfully
    - FAILURE: Task failed
    """
    try:
        task = celery_app.AsyncResult(task_id)
        
        response = TaskStatusResponse(
            task_id=task_id,
            status=task.status,
            result=None,
            error=None
        )
        
        if task.ready():
            if task.successful():
                response.result = task.result
            else:
                response.error = str(task.info)
        elif task.status == 'PROGRESS':
            response.result = task.info
        
        return response
        
    except Exception as e:
        logger.error(f"Failed to get task status: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{task_id}")
async def cancel_task(task_id: str):
    """
    Cancel a running task.
    
    Note: This will attempt to revoke the task, but success depends on
    the task's current state and the broker configuration.
    """
    try:
        celery_app.control.revoke(task_id, terminate=True)
        logger.info(f"Task {task_id} revoked")
        
        return {
            "task_id": task_id,
            "status": "revoked",
            "message": "Task cancellation requested"
        }
    except Exception as e:
        logger.error(f"Failed to cancel task: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/")
async def list_active_tasks():
    """
    List all active tasks in the queue.
    
    Returns information about tasks that are currently running or scheduled.
    """
    try:
        # Get active tasks from all workers
        inspect = celery_app.control.inspect()
        active = inspect.active()
        scheduled = inspect.scheduled()
        reserved = inspect.reserved()
        
        return {
            "active": active or {},
            "scheduled": scheduled or {},
            "reserved": reserved or {}
        }
    except Exception as e:
        logger.error(f"Failed to list tasks: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

from fastapi import APIRouter, HTTPException
from app.schemas.request import ETARequest, AsyncJobRequest
from app.schemas.response import ETAResponse, AsyncJobResponse, AsyncJobStatusResponse
from app.services.eta_service import predict_eta
from app.tasks.tasks import async_eta_prediction_task
from app.core.logging import get_logger

router = APIRouter(prefix="/predict", tags=["ETA Prediction"])
logger = get_logger(__name__)


@router.post("/eta", response_model=ETAResponse)
async def predict_eta_endpoint(request: ETARequest):
    """
    Predict estimated time of arrival (ETA) for a ride.
    
    - **origin**: Starting location coordinates
    - **destination**: Ending location coordinates
    - **timestamp**: ISO-8601 timestamp of ride request
    - **traffic_level**: Optional traffic multiplier (1.0 = normal)
    - **historical_mean_eta**: Optional historical average ETA in seconds
    
    Returns ETA in seconds and confidence score.
    """
    try:
        result = predict_eta(request.dict())
        return result
    except Exception as e:
        logger.error(f"ETA prediction error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"ETA prediction failed: {str(e)}")


@router.post("/eta/async", response_model=AsyncJobResponse)
async def predict_eta_async(request: AsyncJobRequest):
    """
    Queue an async ETA prediction job.
    
    Returns a job ID that can be used to poll for results.
    """
    try:
        # Submit async task to Celery
        task = async_eta_prediction_task.delay(request.dict())
        
        return AsyncJobResponse(
            job_id=task.id,
            status="pending",
            message="ETA prediction job queued successfully"
        )
    except Exception as e:
        logger.error(f"Async ETA job submission error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Job submission failed: {str(e)}")


@router.get("/eta/status/{job_id}", response_model=AsyncJobStatusResponse)
async def get_eta_job_status(job_id: str):
    """
    Get status of an async ETA prediction job.
    
    - **job_id**: Job ID returned from /predict/eta/async
    """
    try:
        from app.tasks.celery_app import app as celery_app
        
        task = celery_app.AsyncResult(job_id)
        
        if task.state == 'PENDING':
            return AsyncJobStatusResponse(job_id=job_id, status="pending")
        elif task.state == 'PROGRESS':
            return AsyncJobStatusResponse(job_id=job_id, status="processing")
        elif task.state == 'SUCCESS':
            result = task.result
            if result.get('status') == 'completed':
                return AsyncJobStatusResponse(
                    job_id=job_id,
                    status="completed",
                    result=ETAResponse(
                        eta_seconds=result['eta_seconds'],
                        confidence=result['confidence']
                    )
                )
            else:
                return AsyncJobStatusResponse(
                    job_id=job_id,
                    status="failed",
                    error=result.get('error', 'Unknown error')
                )
        elif task.state == 'FAILURE':
            return AsyncJobStatusResponse(
                job_id=job_id,
                status="failed",
                error=str(task.info)
            )
        else:
            return AsyncJobStatusResponse(job_id=job_id, status=task.state.lower())
            
    except Exception as e:
        logger.error(f"Job status check error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Status check failed: {str(e)}")

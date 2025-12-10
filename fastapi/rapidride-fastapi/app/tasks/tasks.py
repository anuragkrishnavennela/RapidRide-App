from app.tasks.celery_app import app
from app.models.trainer import train_model as train_model_func
from app.core.logging import get_logger
import pandas as pd
import os

logger = get_logger(__name__)


@app.task(name="tasks.train_model", bind=True)
def train_model_task(self, dataset_path: str, model_path: str = "app/models/model.pkl"):
    """
    Celery task for training ETA prediction model.
    
    Args:
        dataset_path: Path to training dataset CSV
        model_path: Path to save trained model
    
    Returns:
        Dictionary with model path and training metrics
    """
    try:
        logger.info(f"Starting model training task with dataset: {dataset_path}")
        
        # Update task state
        self.update_state(state='PROGRESS', meta={'status': 'Loading data'})
        
        # Train model
        result_path = train_model_func(dataset_path, model_path)
        
        logger.info(f"Model training completed: {result_path}")
        
        return {
            'status': 'completed',
            'model_path': result_path,
            'message': 'Model trained successfully'
        }
        
    except Exception as e:
        logger.error(f"Model training failed: {str(e)}")
        return {
            'status': 'failed',
            'error': str(e)
        }


@app.task(name="tasks.preprocess_data", bind=True)
def preprocess_data_task(self, raw_data_path: str, output_path: str):
    """
    Celery task for preprocessing raw ride data.
    
    Args:
        raw_data_path: Path to raw data CSV
        output_path: Path to save processed data
    
    Returns:
        Dictionary with preprocessing results
    """
    try:
        logger.info(f"Starting data preprocessing task: {raw_data_path}")
        
        self.update_state(state='PROGRESS', meta={'status': 'Reading raw data'})
        
        # Load raw data
        df = pd.read_csv(raw_data_path)
        logger.info(f"Loaded {len(df)} records")
        
        self.update_state(state='PROGRESS', meta={'status': 'Cleaning data'})
        
        # Basic data cleaning
        df = df.dropna()
        df = df[df['eta_seconds'] > 0]
        df = df[df['distance_km'] > 0]
        
        # Ensure required columns exist
        required_cols = ['distance_km', 'traffic_level', 'hour', 'day_of_week',
                        'is_weekend', 'is_rush_hour', 'eta_seconds']
        
        for col in required_cols:
            if col not in df.columns:
                logger.warning(f"Missing column: {col}, adding default values")
                df[col] = 0
        
        # Save processed data
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        df.to_csv(output_path, index=False)
        
        logger.info(f"Preprocessing completed: {len(df)} records saved to {output_path}")
        
        return {
            'status': 'completed',
            'output_path': output_path,
            'records_processed': len(df),
            'message': 'Data preprocessing completed successfully'
        }
        
    except Exception as e:
        logger.error(f"Data preprocessing failed: {str(e)}")
        return {
            'status': 'failed',
            'error': str(e)
        }


@app.task(name="tasks.bulk_eta_prediction", bind=True)
def bulk_eta_prediction_task(self, requests_data: list):
    """
    Celery task for bulk ETA predictions.
    
    Args:
        requests_data: List of request dictionaries
    
    Returns:
        Dictionary with prediction results
    """
    try:
        logger.info(f"Starting bulk ETA prediction for {len(requests_data)} requests")
        
        from app.services.eta_service import predict_eta
        
        results = []
        for idx, request in enumerate(requests_data):
            self.update_state(
                state='PROGRESS',
                meta={'status': f'Processing {idx+1}/{len(requests_data)}'}
            )
            
            result = predict_eta(request)
            results.append({
                'request_id': request.get('id', idx),
                'eta_seconds': result.eta_seconds,
                'confidence': result.confidence
            })
        
        logger.info(f"Bulk prediction completed: {len(results)} results")
        
        return {
            'status': 'completed',
            'results': results,
            'total_processed': len(results)
        }
        
    except Exception as e:
        logger.error(f"Bulk prediction failed: {str(e)}")
        return {
            'status': 'failed',
            'error': str(e)
        }


@app.task(name="tasks.async_eta_prediction")
def async_eta_prediction_task(request_data: dict):
    """
    Celery task for async single ETA prediction.
    
    Args:
        request_data: Request dictionary
    
    Returns:
        ETA prediction result
    """
    try:
        from app.services.eta_service import predict_eta
        
        result = predict_eta(request_data)
        
        return {
            'status': 'completed',
            'eta_seconds': result.eta_seconds,
            'confidence': result.confidence
        }
        
    except Exception as e:
        logger.error(f"Async ETA prediction failed: {str(e)}")
        return {
            'status': 'failed',
            'error': str(e)
        }

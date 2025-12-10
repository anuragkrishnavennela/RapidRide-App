import joblib
import numpy as np
from typing import Dict, Any, Tuple
from app.core.logging import get_logger

logger = get_logger(__name__)


def load_model(model_path: str):
    """
    Load trained model from disk.
    
    Args:
        model_path: Path to model file
    
    Returns:
        Model artifacts dictionary
    """
    try:
        model_artifacts = joblib.load(model_path)
        logger.info(f"Model loaded from {model_path}")
        return model_artifacts
    except Exception as e:
        logger.error(f"Failed to load model from {model_path}: {str(e)}")
        raise


def predict(model_artifacts: Dict[str, Any], features: Dict[str, Any]) -> Tuple[float, float]:
    """
    Make ETA prediction using trained model.
    
    Args:
        model_artifacts: Dictionary containing model, scaler, and feature_names
        features: Feature dictionary
    
    Returns:
        Tuple of (eta_seconds, confidence)
    """
    try:
        model = model_artifacts['model']
        scaler = model_artifacts['scaler']
        feature_names = model_artifacts['feature_names']
        
        # Extract features in correct order
        feature_values = []
        for name in feature_names:
            value = features.get(name, 0)  # Default to 0 if missing
            feature_values.append(value)
        
        # Convert to numpy array and reshape
        X = np.array([feature_values])
        
        # Scale features
        X_scaled = scaler.transform(X)
        
        # Make prediction
        eta_seconds = model.predict(X_scaled)[0]
        
        # Calculate confidence (simple heuristic based on prediction)
        # In production, you might use prediction intervals or ensemble variance
        base_confidence = 0.85
        
        # Adjust confidence based on feature quality
        if 'historical_mean_eta' in features and features['historical_mean_eta'] is not None:
            confidence = min(0.95, base_confidence + 0.05)
        else:
            confidence = base_confidence
        
        # Ensure eta_seconds is positive
        eta_seconds = max(0, eta_seconds)
        
        return float(eta_seconds), float(confidence)
        
    except Exception as e:
        logger.error(f"Prediction error: {str(e)}")
        raise


def batch_predict(model_artifacts: Dict[str, Any], features_list: list) -> list:
    """
    Make batch predictions.
    
    Args:
        model_artifacts: Dictionary containing model, scaler, and feature_names
        features_list: List of feature dictionaries
    
    Returns:
        List of (eta_seconds, confidence) tuples
    """
    results = []
    for features in features_list:
        result = predict(model_artifacts, features)
        results.append(result)
    return results

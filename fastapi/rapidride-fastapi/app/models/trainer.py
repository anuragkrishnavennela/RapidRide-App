import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import joblib
import os
from app.core.logging import get_logger

logger = get_logger(__name__)


class ETAModelTrainer:
    """Trainer for ETA prediction model"""
    
    def __init__(self, model_path: str = "app/models/model.pkl"):
        self.model_path = model_path
        self.model = None
        self.scaler = StandardScaler()
        self.feature_names = None
        
    def load_data(self, data_path: str) -> pd.DataFrame:
        """
        Load training data from CSV file.
        
        Args:
            data_path: Path to CSV file
        
        Returns:
            DataFrame with training data
        """
        logger.info(f"Loading data from {data_path}")
        df = pd.read_csv(data_path)
        return df
    
    def prepare_features(self, df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
        """
        Prepare features and target from DataFrame.
        
        Expected columns:
        - distance_km
        - traffic_level
        - hour
        - day_of_week
        - is_weekend
        - is_rush_hour
        - origin_zone_lat
        - origin_zone_lng
        - dest_zone_lat
        - dest_zone_lng
        - eta_seconds (target)
        
        Args:
            df: Input DataFrame
        
        Returns:
            Tuple of (features, target)
        """
        # Define feature columns
        self.feature_names = [
            'distance_km', 'traffic_level', 'hour', 'day_of_week',
            'is_weekend', 'is_rush_hour', 'origin_zone_lat', 'origin_zone_lng',
            'dest_zone_lat', 'dest_zone_lng'
        ]
        
        # Optional: add historical_mean_eta if available
        if 'historical_mean_eta' in df.columns:
            self.feature_names.append('historical_mean_eta')
        
        X = df[self.feature_names].values
        y = df['eta_seconds'].values
        
        return X, y
    
    def train(self, data_path: str, test_size: float = 0.2, random_state: int = 42):
        """
        Train the ETA prediction model.
        
        Args:
            data_path: Path to training data CSV
            test_size: Proportion of data for testing
            random_state: Random seed for reproducibility
        """
        # Load data
        df = self.load_data(data_path)
        X, y = self.prepare_features(df)
        
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, random_state=random_state
        )
        
        logger.info(f"Training set size: {len(X_train)}, Test set size: {len(X_test)}")
        
        # Scale features
        X_train_scaled = self.scaler.fit_transform(X_train)
        X_test_scaled = self.scaler.transform(X_test)
        
        # Train model
        logger.info("Training GradientBoostingRegressor...")
        self.model = GradientBoostingRegressor(
            n_estimators=100,
            learning_rate=0.1,
            max_depth=5,
            random_state=random_state,
            verbose=0
        )
        
        self.model.fit(X_train_scaled, y_train)
        
        # Evaluate
        y_pred = self.model.predict(X_test_scaled)
        
        mae = mean_absolute_error(y_test, y_pred)
        rmse = np.sqrt(mean_squared_error(y_test, y_pred))
        r2 = r2_score(y_test, y_pred)
        
        logger.info(f"Model Performance:")
        logger.info(f"  MAE: {mae:.2f} seconds ({mae/60:.2f} minutes)")
        logger.info(f"  RMSE: {rmse:.2f} seconds ({rmse/60:.2f} minutes)")
        logger.info(f"  R²: {r2:.4f}")
        
        # Save model
        self.save_model()
        
        return {
            'mae': mae,
            'rmse': rmse,
            'r2': r2
        }
    
    def save_model(self):
        """Save trained model and scaler to disk"""
        os.makedirs(os.path.dirname(self.model_path), exist_ok=True)
        
        model_artifacts = {
            'model': self.model,
            'scaler': self.scaler,
            'feature_names': self.feature_names
        }
        
        joblib.dump(model_artifacts, self.model_path)
        logger.info(f"Model saved to {self.model_path}")


def train_model(dataset_path: str, model_path: str = "app/models/model.pkl") -> str:
    """
    Train ETA prediction model.
    
    Args:
        dataset_path: Path to training data CSV
        model_path: Path to save trained model
    
    Returns:
        Path to saved model
    """
    trainer = ETAModelTrainer(model_path=model_path)
    trainer.train(dataset_path)
    return model_path


if __name__ == "__main__":
    # Example usage
    train_model("data/processed/training_data.csv")

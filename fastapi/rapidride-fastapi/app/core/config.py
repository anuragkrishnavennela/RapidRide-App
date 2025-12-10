from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    """Application configuration settings"""
    
    # FastAPI Configuration
    fastapi_host: str = "0.0.0.0"
    fastapi_port: int = 8001
    log_level: str = "INFO"
    
    # RabbitMQ Configuration
    rabbitmq_url: str = "amqp://guest:guest@localhost:5672//"
    
    # Celery Configuration
    celery_broker_url: str = "amqp://guest:guest@localhost:5672//"
    celery_result_backend: str = "rpc://"
    
    # Redis Configuration
    redis_url: str = "redis://localhost:6379/0"
    
    # Elasticsearch Configuration (optional)
    es_url: Optional[str] = "http://localhost:9200"
    
    # Model Configuration
    model_path: str = "app/models/model.pkl"
    
    # Service Configuration
    currency: str = "INR"
    base_fare: float = 20.0
    per_km_rate: float = 8.0
    avg_speed_kmh: float = 30.0
    
    # API Configuration
    api_title: str = "RapidRide FastAPI Services"
    api_version: str = "1.0.0"
    api_description: str = "FastAPI microservices for fare calculation, ETA prediction, and reverse geocoding"
    
    class Config:
        env_file = ".env"
        case_sensitive = False


# Global settings instance
settings = Settings()


def get_settings() -> Settings:
    """Get application settings"""
    return settings

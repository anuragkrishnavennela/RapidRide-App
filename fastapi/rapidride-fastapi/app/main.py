from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import fare, eta, geo
from app.schemas.response import HealthResponse
from app.services.eta_service import is_model_loaded
from app.utils.rmq import check_rabbitmq_connection
from app.utils.redis_client import check_redis_connection
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# Create FastAPI app
app = FastAPI(
    title=settings.api_title,
    version=settings.api_version,
    description=settings.api_description,
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS middleware
allowed_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://rapidrideonline.web.app",
    "https://rapidrideonline.firebaseapp.com"
]

# Allow wildcard only in development
if settings.environment == "development":
    allowed_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(fare.router)
app.include_router(eta.router)
app.include_router(geo.router)


@app.get("/", tags=["Root"])
async def root():
    """Root endpoint"""
    return {
        "message": "RapidRide FastAPI Services",
        "version": settings.api_version,
        "docs": "/docs",
        "health": "/health"
    }


@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """
    Health check endpoint.
    
    Returns service status, model loading status, and queue connectivity.
    """
    # Check if model is loaded
    model_status = is_model_loaded()
    
    # Check RabbitMQ connection
    queue_status = check_rabbitmq_connection(settings.rabbitmq_url)
    
    # Check Redis connection
    redis_status = check_redis_connection()
    
    return HealthResponse(
        status="ok",
        model_loaded=model_status,
        queue_connected=queue_status,
        redis_connected=redis_status,
        version=settings.api_version
    )


@app.on_event("startup")
async def startup_event():
    """Run on application startup"""
    logger.info(f"Starting {settings.api_title} v{settings.api_version}")
    logger.info(f"Documentation available at http://{settings.fastapi_host}:{settings.fastapi_port}/docs")


@app.on_event("shutdown")
async def shutdown_event():
    """Run on application shutdown"""
    logger.info("Shutting down FastAPI application")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.fastapi_host,
        port=settings.fastapi_port,
        reload=True,
        log_level=settings.log_level.lower()
    )

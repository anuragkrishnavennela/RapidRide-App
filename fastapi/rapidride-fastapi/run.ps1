# PowerShell script to run RapidRide FastAPI server

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  RapidRide FastAPI Microservices Launcher" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# Check if virtual environment exists
if (-not (Test-Path "venv\Scripts\Activate.ps1")) {
    Write-Host "Virtual environment not found. Creating..." -ForegroundColor Yellow
    python -m venv venv
    
    Write-Host "Activating virtual environment..." -ForegroundColor Yellow
    & .\venv\Scripts\Activate.ps1
    
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    pip install -r requirements.txt
} else {
    Write-Host "Activating virtual environment..." -ForegroundColor Green
    & .\venv\Scripts\Activate.ps1
}

# Check if .env exists
if (-not (Test-Path ".env")) {
    Write-Host ".env file not found. Creating from template..." -ForegroundColor Yellow
    Copy-Item .env.example .env
    Write-Host "Please edit .env file if needed" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Checking infrastructure..." -ForegroundColor Cyan

# Check RabbitMQ
try {
    $rabbitmq = docker ps --filter "name=rabbitmq" --format "{{.Names}}"
    if ($rabbitmq -ne "rabbitmq") {
        Write-Host "Starting RabbitMQ..." -ForegroundColor Yellow
        docker run -d -p 5672:5672 -p 15672:15672 --name rabbitmq rabbitmq:3.12-management
        Start-Sleep -Seconds 5
    } else {
        Write-Host "✓ RabbitMQ is running" -ForegroundColor Green
    }
} catch {
    Write-Host "Docker not available or RabbitMQ not running" -ForegroundColor Yellow
    Write-Host "RabbitMQ features will be limited" -ForegroundColor Yellow
}

# Check Redis
try {
    $redis = docker ps --filter "name=redis" --format "{{.Names}}"
    if ($redis -ne "redis") {
        Write-Host "Starting Redis..." -ForegroundColor Yellow
        docker run -d -p 6379:6379 --name redis redis:7-alpine
        Start-Sleep -Seconds 2
    } else {
        Write-Host "✓ Redis is running" -ForegroundColor Green
    }
} catch {
    Write-Host "Docker not available or Redis not running" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Starting FastAPI server on http://localhost:8001" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "API Documentation: http://localhost:8001/docs" -ForegroundColor Green
Write-Host "Health Check: http://localhost:8001/health" -ForegroundColor Green
Write-Host "RabbitMQ UI: http://localhost:15672 (guest/guest)" -ForegroundColor Green
Write-Host ""
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

# Start the server
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload

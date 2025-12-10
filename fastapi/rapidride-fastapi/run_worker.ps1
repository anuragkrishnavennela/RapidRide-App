# PowerShell script to run Celery worker

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  RapidRide Celery Worker Launcher" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# Check if virtual environment exists
if (-not (Test-Path "venv\Scripts\Activate.ps1")) {
    Write-Host "ERROR: Virtual environment not found!" -ForegroundColor Red
    Write-Host "Please run 'run.ps1' first to set up the environment" -ForegroundColor Yellow
    exit 1
}

Write-Host "Activating virtual environment..." -ForegroundColor Green
& .\venv\Scripts\Activate.ps1

Write-Host ""
Write-Host "Starting Celery worker..." -ForegroundColor Cyan
Write-Host "Queue: rapidride" -ForegroundColor Green
Write-Host ""
Write-Host "Press Ctrl+C to stop the worker" -ForegroundColor Yellow
Write-Host ""

# Start Celery worker
celery -A app.tasks.celery_app.app worker --loglevel=info -Q rapidride --pool=solo

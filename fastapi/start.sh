#!/bin/bash
# Railway startup script that reads PORT environment variable

# Get PORT from environment, default to 8001 if not set
PORT=${PORT:-8001}

echo "Starting uvicorn on port $PORT"
uvicorn app.main:app --host 0.0.0.0 --port $PORT

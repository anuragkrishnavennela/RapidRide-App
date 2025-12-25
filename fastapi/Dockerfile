FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY ./app /app/app
COPY ./data /app/data
COPY ./start.sh /app/start.sh

# Make startup script executable
RUN chmod +x /app/start.sh

# Create directory for models
RUN mkdir -p /app/app/models

# Expose port
EXPOSE 8001

# Run the application using startup script
CMD ["/bin/bash", "/app/start.sh"]

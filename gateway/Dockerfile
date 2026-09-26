# Multi-stage build for FastAPI Gateway
FROM python:3.12-slim AS base

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ app/
COPY alembic/ alembic/
COPY alembic.ini .

# Create non-root user for security
RUN useradd -m -r appuser && chown -R appuser:appuser /app
USER appuser

# Expose the gateway HTTP port
EXPOSE 8000



# Run the FastAPI server via uvicorn (reads PORT from Cloud Run)
CMD exec python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}

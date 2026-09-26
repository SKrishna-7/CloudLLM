# Use an official NVIDIA PyTorch base image suitable for inference
FROM pytorch/pytorch:2.2.1-cuda12.1-cudnn8-runtime

# Set working directory
WORKDIR /app

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy ALL worker application files (including logger.py)
COPY worker.py storage.py logger.py ./

# Create non-root user for security
RUN useradd -m -r appuser && chown -R appuser:appuser /app
USER appuser

# Expose the worker HTTP port
EXPOSE 8002

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8002/health')" || exit 1

# Run the FastAPI server via uvicorn
CMD ["python", "-m", "uvicorn", "worker:app", "--host", "0.0.0.0", "--port", "8002"]

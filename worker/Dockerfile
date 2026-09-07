# Use an official NVIDIA PyTorch base image suitable for inference
FROM pytorch/pytorch:2.2.1-cuda12.1-cudnn8-runtime

# Set working directory
WORKDIR /app

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy worker application files
COPY worker.py storage.py ./

# Default command to run the daemon
CMD ["python", "worker.py"]

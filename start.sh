#!/bin/bash

echo "🚀 Booting up CloudLLM Split-Plane Architecture..."

# Ensure we clean up all background processes if the script is stopped (Ctrl+C)
trap 'echo "🛑 Stopping all services..."; kill 0' SIGINT SIGTERM EXIT

# Fix: Port Cleanup
echo "🧹 Cleaning up old processes..."
pkill -f uvicorn || true
pkill -f "go run" || true
fuser -k 8000/tcp 8001/tcp 8002/tcp 8080/tcp 3000/tcp || true

echo "🐍 Activating global_env..."
# NOTE: Replace with your actual conda path if different
source ~/miniforge3/etc/profile.d/conda.sh || source ~/miniconda3/etc/profile.d/conda.sh || true
conda activate global_env

echo "📦 Installing backend requirements..."
pip install -r requirements.txt

# 1. Start Infrastructure (Postgres & Redis)
echo "📦 Starting Docker containers (Postgres & Redis)..."
docker compose up -d

# Wait a couple seconds for databases to initialize
#sleep 2

echo "Activating env..."
(
    conda activate global_env
) &
sleep 5
# 2. Start Gateway (FastAPI)
echo "🔄 Running DB Migrations..."
(
    source ~/miniforge3/etc/profile.d/conda.sh || source ~/miniconda3/etc/profile.d/conda.sh || true
    conda activate global_env
    cd gateway
    alembic upgrade head
)

echo "🌐 Starting FastAPI Gateway (Port 8000)..."
(
    source ~/miniforge3/etc/profile.d/conda.sh || source ~/miniconda3/etc/profile.d/conda.sh || true
    conda activate global_env
    cd gateway
    # Using python -m uvicorn ensures it uses the activated virtual environment
    python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload 2>&1 | tee ../gateway.log
) &

# 3. Start Scheduler (Go)
echo "⚙️ Starting Go Scheduler..."
(
    cd scheduler
    go run cmd/main.go 2>&1 | tee ../scheduler.log
) &

# 4. Start GPU Worker (Python)
echo "🧠 Starting Python GPU Worker (with auto-restart)..."
(
    source ~/miniforge3/etc/profile.d/conda.sh || source ~/miniconda3/etc/profile.d/conda.sh || true
    conda activate global_env
    cd worker
    while true; do
        python -m uvicorn worker:app --host 0.0.0.0 --port 8002 2>&1 | tee -a ../worker.log
        echo "⚠️ Worker exited. Restarting in 5s..."
        sleep 5
    done
) &

# 5. Start Web Frontend (Next.js)
echo "🎨 Starting Next.js Web UI (Port 3000)..."
(
    cd web
    source ~/.nvm/nvm.sh
    nvm use 20
    npm run dev
) &

echo "✅ All services are booting up!"
echo "Logs from all services will stream below."
echo "Press Ctrl+C at any time to gracefully stop the entire cluster."
echo "--------------------------------------------------------"

# Wait for all background processes to finish (which means forever until Ctrl+C)
wait

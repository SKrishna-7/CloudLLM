#!/bin/bash
set -e

# Load nvm and conda into the shell
source ~/.nvm/nvm.sh || true
source ~/miniforge3/etc/profile.d/conda.sh || true
export WEBHOOK_SECRET="super_secret_webhook_key_for_local_dev"

echo "==========================================="
echo "🚀 Starting CloudLLM Local Environment..."
echo "==========================================="

echo "[1/5] Starting backend infrastructure (Docker)..."
docker compose up -d

echo "[2/5] Starting Gateway API (Port 8000)..."
conda activate global_env
cd gateway
uvicorn app.main:app --host 0.0.0.0 --port 8000 &
GATEWAY_PID=$!
cd ..

echo "[3/5] Starting GPU Worker (Port 8002)..."
# Still using global_env
cd worker
uvicorn worker:app --host 0.0.0.0 --port 8002 &
WORKER_PID=$!
cd ..

echo "[4/5] Starting Go Scheduler..."
cd scheduler
go run cmd/main.go &
SCHEDULER_PID=$!
cd ..

echo "[5/5] Starting Next.js Frontend (Port 3000)..."
cd web
nvm use 22
npm run dev &
WEB_PID=$!
cd ..

echo "==========================================="
echo "✅ All services are booting up!"
echo "   - Frontend: http://localhost:3000"
echo "   - Gateway:  http://localhost:8000"
echo "   - Worker:   http://localhost:8002"
echo ""
echo "⚠️  Keep this terminal open. Press Ctrl+C to cleanly stop everything."
echo "==========================================="

# Cleanly stop everything if the user presses Ctrl+C
cleanup() {
    echo ""
    echo "🛑 Stopping all local services..."
    kill $GATEWAY_PID $WORKER_PID $SCHEDULER_PID $WEB_PID 2>/dev/null
    echo "🛑 Stopping Docker containers..."
    docker compose stop
    echo "✅ Goodbye!"
    exit 0
}

trap cleanup INT TERM

# Wait for background processes to finish (which means wait forever until Ctrl+C)
wait $GATEWAY_PID $WORKER_PID $SCHEDULER_PID $WEB_PID

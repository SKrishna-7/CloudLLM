#!/bin/bash
set -e

echo "Cleaning up any old processes..."
pkill -f "uvicorn worker:app" || true
pkill -f "cloudflared tunnel" || true
sleep 1

echo "Starting GPU Worker on port 8000..."
uvicorn worker:app --host 0.0.0.0 --port 8000 &
UVICORN_PID=$!

if [ ! -f "cloudflared" ]; then
    echo "Downloading cloudflared (Cloudflare Quick Tunnels)..."
    wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O cloudflared
    chmod +x cloudflared
else
    echo "cloudflared binary already exists, skipping download."
fi

echo "Starting Cloudflare Quick Tunnel to expose port 8000..."
./cloudflared tunnel --url http://localhost:8000 > tunnel.log 2>&1 &
TUNNEL_PID=$!

echo "Waiting for tunnel to initialize..."
sleep 5

echo "============================================================"
echo "✅ Your Public GPU Worker URL is:"
grep -o 'https://[-0-9a-z]*\.trycloudflare\.com' tunnel.log | tail -n 1
echo "============================================================"
echo "Set this URL as the WORKER_URL environment variable for your Scheduler!"
echo "Press Ctrl+C to stop both the worker and the tunnel."

trap "kill $UVICORN_PID $TUNNEL_PID; exit" INT TERM
wait $UVICORN_PID

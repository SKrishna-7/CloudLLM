#!/bin/bash
# Install hey if not installed
if ! command -v hey &> /dev/null
then
    echo "hey could not be found, installing..."
    go install github.com/rakyll/hey@latest
    export PATH=$PATH:$(go env GOPATH)/bin
fi

echo "Running Baseline Evaluation on FastAPI Gateway (Health Endpoint)..."
echo "Sending 50 concurrent requests for 10 seconds..."
hey -z 10s -c 50 https://cloudllm-gateway-108781732801.asia-south1.run.app/health

echo "---------------------------------------------------"
echo "To test the authenticated /v1/jobs endpoint, you need to provide a valid JWT Token:"
echo "hey -z 10s -c 50 -H \"Authorization: Bearer YOUR_TOKEN\" https://cloudllm-gateway-108781732801.asia-south1.run.app/v1/jobs"

# CloudLLM

CloudLLM is a high-performance, self-hosted AI image generation SaaS platform built around a robust Split-Plane architecture. 

**I built this as a personal learning project** to challenge myself with distributed systems design. My goal was to learn how to decouple a user-facing API control plane from heavy, long-running GPU inference workloads, ensuring maximum resilience, scalability, and non-blocking performance.

## Architecture Overview

CloudLLM is engineered using a modern, multi-language microservices stack:

- **Web Frontend (Next.js)**: A sleek, dynamic user interface for generating images and managing developer API keys. It handles authentication seamlessly via Clerk.
- **FastAPI Gateway (Python)**: The control plane. It manages rate-limiting, transactional billing (credit deductions), JWT/API key validation, and pushes generation requests into an asynchronous message broker.
- **Scheduler (Go)**: The fast, concurrent orchestrator. It polls the Redis queue for pending jobs and dispatches them to available inference workers via HTTP POST requests, handling dead-letter queuing (DLQ) and firing secure webhook callbacks upon completion.
- **GPU Inference Worker (Python)**: A stateless FastAPI worker running Diffusers (currently utilizing the JuggernautXL model). It features deep memory optimizations—such as sequential CPU offloading and VAE slicing—designed to run massive models efficiently, even on constrained 6GB VRAM GPUs. 
- **Infrastructure**: PostgreSQL for relational state, Redis for the message broker, and MinIO for S3-compatible object storage.

## Core Features

- **Asynchronous Processing**: Jobs are queued and processed asynchronously, keeping the main API lightning fast and responsive.
- **Secure Inter-Service Communication**: Webhooks between the Scheduler and Gateway use HMAC-SHA256 signed payloads to prevent forged job completions or unauthorized credit refunds.
- **Transactional Billing**: Built-in credit management ensures users are billed atomically when jobs are queued, and automatically refunded if the GPU worker encounters an error.
- **OOM Protection**: Strict Pydantic parameter validation limits maximum image dimensions to prevent malicious or accidental Out-Of-Memory crashes on the inference nodes.
- **Deep Observability**: Fully instrumented with OpenTelemetry tracing (Jaeger), Prometheus metrics, and Loki for aggregated logging across all microservices.

## Current Status

CloudLLM is currently running and tested **locally**. We are actively finalizing the infrastructure, containerization, and orchestration patterns for our upcoming **Cloud Deployment**. Stay tuned!

package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.21.0"

	"scheduler/internal/broker"
	"scheduler/internal/logger"
	"scheduler/internal/webhook"
	"scheduler/internal/worker"
)

func initTracer() *sdktrace.TracerProvider {
	exporter, err := otlptracehttp.New(context.Background(),
		otlptracehttp.WithEndpoint("localhost:4318"),
		otlptracehttp.WithInsecure(),
	)
	if err != nil {
		slog.Error("failed to initialize otlp exporter", "error", err)
	}
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(resource.NewWithAttributes(
			semconv.SchemaURL,
			semconv.ServiceName("go-scheduler"),
		)),
	)
	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.TraceContext{})
	return tp
}

func main() {
	logger.Init()

	tp := initTracer()
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := tp.Shutdown(ctx); err != nil {
			slog.Error("failed to shutdown TracerProvider", "error", err)
		}
	}()

	// Start Prometheus metrics server and background metric collector
	jobsQueued := promauto.NewGauge(prometheus.GaugeOpts{
		Name: "cloudllm_jobs_queued",
		Help: "The total number of jobs currently in the image_queue",
	})
	
	activeWorkers := promauto.NewGauge(prometheus.GaugeOpts{
		Name: "cloudllm_active_workers",
		Help: "The total number of active Go scheduler workers",
	})
	
	activeWorkers.Set(5) // Static for now, since we have a fixed pool of 5

	go func() {
		http.Handle("/metrics", promhttp.Handler())
		slog.Info("Starting Prometheus metrics server on :8080")
		if err := http.ListenAndServe(":8080", nil); err != nil {
			slog.Error("Metrics server failed", "error", err)
		}
	}()

	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://localhost:6380/0"
	}
	webhookURL := os.Getenv("WEBHOOK_URL")
	if webhookURL == "" {
		webhookURL = "http://localhost:8000/v1/jobs/webhook"
	}
	workerURL := os.Getenv("WORKER_URL")
	if workerURL == "" {
		workerURL = "http://127.0.0.1:8002/generate"
	}

	consumer, err := broker.NewConsumer(redisURL)
	if err != nil {
		slog.Error("Failed to connect to Redis", "error", err)
		os.Exit(1)
	}
	defer func() {
		slog.Info("Closing Redis connection...")
		if err := consumer.Close(); err != nil {
			slog.Error("Error closing Redis connection", "error", err)
		}
	}()

	slog.Info("Successfully connected to Redis")
	
	// Start background goroutine to update jobs queued metric
	go func() {
		client := consumer.GetClient()
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				length, err := client.LLen(context.Background(), "image_queue").Result()
				if err == nil {
					jobsQueued.Set(float64(length))
				}
			}
		}
	}()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	
	jobChan := consumer.StartPolling(ctx, "image_queue")

	dispatcher := webhook.NewDispatcher()

	slog.Info("Starting worker pool...")
	wp := worker.NewPool(5, dispatcher, consumer)
	wg := wp.StartPool(ctx, jobChan, webhookURL, workerURL)

	slog.Info("Scheduler is running and workers are ready...")

	sig := <-sigChan
	slog.Info("Received termination signal. Initiating graceful shutdown...", "signal", sig)
	
	cancel() 
	
	slog.Info("Waiting for active workers to finish current jobs...")
	wg.Wait()

	slog.Info("All workers finished. Shutdown complete.")
}

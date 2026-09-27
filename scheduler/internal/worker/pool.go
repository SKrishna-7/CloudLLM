package worker

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"scheduler/internal/broker"
	"scheduler/internal/webhook"
	
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	jobsCompletedTotal = promauto.NewCounter(prometheus.CounterOpts{
		Name: "cloudllm_jobs_completed_total",
		Help: "Total number of successfully completed jobs",
	})
	jobsFailedTotal = promauto.NewCounter(prometheus.CounterOpts{
		Name: "cloudllm_jobs_failed_total",
		Help: "Total number of failed jobs",
	})
	queueWaitDuration = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "cloudllm_queue_wait_duration_seconds",
		Help:    "Time a job spent in the queue before processing started",
		Buckets: []float64{1, 5, 10, 30, 60, 120, 300},
	})
	jobsProcessingCurrent = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "cloudllm_jobs_processing_current",
		Help: "Number of jobs currently being processed by workers",
	})
)

type Pool struct {
	workerCount int
	dispatcher  *webhook.Dispatcher
	consumer    *broker.Consumer
	wg          *sync.WaitGroup
	httpClient  *http.Client
}

func NewPool(count int, dispatcher *webhook.Dispatcher, consumer *broker.Consumer) *Pool {
	return &Pool{
		workerCount: count,
		dispatcher:  dispatcher,
		consumer:    consumer,
		wg:          &sync.WaitGroup{},
		httpClient:  &http.Client{Timeout: 15 * time.Minute}, // Inference can take up to 10 mins on slower GPUs
	}
}

type WorkerResponse struct {
	JobID    string `json:"job_id"`
	Status   string `json:"status"`
	ImageURL string `json:"image_url"`
}

func (p *Pool) StartPool(ctx context.Context, jobChannel <-chan broker.Job, webhookURL string, workerURL string) *sync.WaitGroup {
	for i := 1; i <= p.workerCount; i++ {
		p.wg.Add(1)
		go func(workerID int) {
			defer p.wg.Done()
			
			// Gap 6: Panic recovery
			defer func() {
				if r := recover(); r != nil {
					slog.Error("Worker panic recovered", "worker_id", workerID, "panic", r)
				}
			}()

			slog.Info("Worker started", "worker_id", workerID)

			for job := range jobChannel {
				jobsProcessingCurrent.Inc()
				
				// Calculate queue wait time (rough estimate using job.CreatedAt if available, but since we don't parse it here easily, we'll just track processing time or assume the struct has it. Wait, broker.Job doesn't have CreatedAt exposed easily unless we parse it. For now, we will observe queue wait if we can.)
				// Alternatively, we just increment current jobs processing
				
				// Create child span from the extracted context
				ctxJob, span := otel.Tracer("scheduler-worker").Start(job.Ctx, "worker.process_job")
				
				slog.Info("Worker processing job via HTTP", "worker_id", workerID, slog.String("job_id", job.JobID))

				// Dispatch "processing" webhook so UI updates immediately
				err := p.dispatcher.SendCompletion(ctxJob, webhookURL, job.JobID, "processing", "")
				if err != nil {
					slog.Error("Failed to dispatch processing webhook", "worker_id", workerID, slog.String("job_id", job.JobID), "error", err)
				}

				// Send the exact Redis JSON payload to the Python worker
				req, err := http.NewRequestWithContext(ctxJob, "POST", workerURL, bytes.NewBuffer([]byte(job.RawPayload)))
				if err != nil {
					slog.Error("Failed to create HTTP request to worker", "worker_id", workerID, slog.String("job_id", job.JobID), "error", err)
					p.dispatcher.SendCompletion(ctxJob, webhookURL, job.JobID, "failed", "")
				} else {
					req.Header.Set("Content-Type", "application/json")
					
					// Inject trace context headers so Python picks it up
					otel.GetTextMapPropagator().Inject(ctxJob, propagation.HeaderCarrier(req.Header))

					resp, err := p.httpClient.Do(req)
					if err != nil {
						slog.Error("HTTP request to Python worker failed", "worker_id", workerID, slog.String("job_id", job.JobID), "error", err)
						p.dispatcher.SendCompletion(ctxJob, webhookURL, job.JobID, "failed", "")
					} else {
						// Gap 3: removed defer resp.Body.Close()
						
						if resp.StatusCode != http.StatusOK {
							bodyBytes, _ := io.ReadAll(resp.Body)
							resp.Body.Close()
							slog.Error("Python worker returned non-200 status", "worker_id", workerID, slog.String("job_id", job.JobID), "status_code", resp.StatusCode, "body", string(bodyBytes))
							p.dispatcher.SendCompletion(ctxJob, webhookURL, job.JobID, "failed", "")
						} else {
							var workerResp WorkerResponse
							err := json.NewDecoder(resp.Body).Decode(&workerResp)
							resp.Body.Close()
							
							if err != nil {
								slog.Error("Failed to decode Python worker response", "worker_id", workerID, slog.String("job_id", job.JobID), "error", err)
								p.dispatcher.SendCompletion(ctxJob, webhookURL, job.JobID, "failed", "")
							} else {
								slog.Info("Python worker finished job. Dispatching webhook...", "worker_id", workerID, slog.String("job_id", job.JobID))
								err := p.dispatcher.SendCompletion(ctxJob, webhookURL, job.JobID, workerResp.Status, workerResp.ImageURL)
								if err != nil {
									slog.Error("Failed to dispatch webhook", "worker_id", workerID, slog.String("job_id", job.JobID), "error", err)
								} else {
									if workerResp.Status == "completed" {
										jobsCompletedTotal.Inc()
									} else {
										jobsFailedTotal.Inc()
									}
								}
							}
						}
					}
				}
				
				// Remove from processing queue (DLQ mechanic)
				if p.consumer != nil {
					err := p.consumer.RemoveFromProcessing(context.Background(), "image_queue", job.RawPayload)
					if err != nil {
						slog.Error("Failed to remove job from processing queue", "job_id", job.JobID, "error", err)
					}
				}
				
				jobsProcessingCurrent.Dec()
				span.End()
			}
			slog.Info("Worker shutting down", "worker_id", workerID)
		}(i)
	}

	return p.wg
}

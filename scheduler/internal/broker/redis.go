package broker

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/redis/go-redis/v9"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
)

type Job struct {
	JobID        string            `json:"job_id"`
	Prompt       string            `json:"prompt"`
	TraceHeaders map[string]string `json:"trace_headers"`
	Ctx          context.Context   `json:"-"`
	RawPayload   string            `json:"-"`
}

type Consumer struct {
	client *redis.Client
}

func NewConsumer(redisURL string) (*Consumer, error) {
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, err
	}
	client := redis.NewClient(opt)
	return &Consumer{client: client}, nil
}

func (c *Consumer) GetClient() *redis.Client {
	return c.client
}

func (c *Consumer) StartPolling(ctx context.Context, queueName string) <-chan Job {
	jobChan := make(chan Job)

	go func() {
		defer close(jobChan)
		for {
			select {
			case <-ctx.Done():
				slog.Info("Context cancelled, stopping Redis polling.")
				return
			default:
				// Use BRPopLPush to move job from image_queue to processing_queue for DLQ mechanics
				result, err := c.client.BRPopLPush(ctx, queueName, queueName+"_processing", 2*time.Second).Result()
				if err != nil {
					if err == redis.Nil {
						continue
					}
					if ctx.Err() == nil {
						slog.Error("Error pulling from Redis", "error", err)
					}
					continue
				}

				if result != "" {
					payload := result
					var job Job
					if err := json.Unmarshal([]byte(payload), &job); err != nil {
						slog.Error("Failed to unmarshal job payload", "error", err, "payload", payload)
						continue
					}
					job.RawPayload = payload
					
					slog.Info("Dequeued job from Redis", slog.String("job_id", job.JobID))

					// Extract OTel Trace Context from headers
					carrier := propagation.MapCarrier(job.TraceHeaders)
					jobCtx := otel.GetTextMapPropagator().Extract(context.Background(), carrier)
					job.Ctx = jobCtx

					select {
					case jobChan <- job:
					case <-ctx.Done():
						return
					}
				}
			}
		}
	}()

	return jobChan
}

func (c *Consumer) RemoveFromProcessing(ctx context.Context, queueName string, payload string) error {
	return c.client.LRem(ctx, queueName+"_processing", 1, payload).Err()
}

func (c *Consumer) Close() error {
	return c.client.Close()
}

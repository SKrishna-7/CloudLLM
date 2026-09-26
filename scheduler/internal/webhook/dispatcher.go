package webhook

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
)

type Dispatcher struct {
	client *http.Client
	secret string
}

func NewDispatcher() *Dispatcher {
	secret := os.Getenv("WEBHOOK_SECRET")
	if secret == "" {
		slog.Error("WEBHOOK_SECRET env var not set. Refusing to start.")
		os.Exit(1)
	}
	return &Dispatcher{
		client: &http.Client{Timeout: 10 * time.Second},
		secret: secret,
	}
}

func (d *Dispatcher) signPayload(payload []byte) string {
	h := hmac.New(sha256.New, []byte(d.secret))
	h.Write(payload)
	return hex.EncodeToString(h.Sum(nil))
}

func (d *Dispatcher) SendCompletion(ctx context.Context, webhookURL, jobID string, status string, imageURL string) error {
	payload := map[string]string{
		"job_id": jobID,
		"status": status,
	}
	if imageURL != "" {
		payload["image_url"] = imageURL
	}
	body, err := json.Marshal(payload)
	if err != nil {
		slog.Error("Failed to marshal webhook payload", slog.String("job_id", jobID), "error", err)
		return err
	}

	// Add HMAC Signature
	signature := d.signPayload(body)
	
	var lastErr error
	var resp *http.Response
	
	// Exponential backoff retry (Gap 5)
	for attempt := 1; attempt <= 3; attempt++ {
		req, err := http.NewRequestWithContext(ctx, "POST", webhookURL, bytes.NewReader(body))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Webhook-Signature", signature)
		
		otel.GetTextMapPropagator().Inject(ctx, propagation.HeaderCarrier(req.Header))

		resp, err = d.client.Do(req)
		
		// Break if success or a 4xx client error (which shouldn't be retried)
		if err == nil && resp.StatusCode < 500 {
			break
		}
		
		lastErr = err
		statusCode := 0
		if resp != nil {
			statusCode = resp.StatusCode
			resp.Body.Close()
		}
		
		if attempt < 3 {
			slog.Warn("Webhook failed, retrying...", "job_id", jobID, "attempt", attempt, "error", lastErr, "status", statusCode)
			time.Sleep(time.Duration(attempt*attempt) * time.Second) // 1s, 4s
		}
	}

	if lastErr != nil {
		slog.Error("Failed to send webhook request after retries", "job_id", jobID, "error", lastErr)
		return lastErr
	}

	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		slog.Warn("Webhook returned non-200 status", "job_id", jobID, "status_code", resp.StatusCode)
	} else {
		slog.Info("Webhook dispatched successfully", "job_id", jobID, "status_code", resp.StatusCode)
	}

	return nil
}

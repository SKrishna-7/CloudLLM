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
}

func NewDispatcher() *Dispatcher {
	return &Dispatcher{
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

func signPayload(payload []byte) string {
	secret := os.Getenv("WEBHOOK_SECRET")
	if secret == "" {
		secret = "super_secret_webhook_key_for_local_dev"
	}
	h := hmac.New(sha256.New, []byte(secret))
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

	req, err := http.NewRequestWithContext(ctx, "POST", webhookURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	
	// Add HMAC Signature
	signature := signPayload(body)
	req.Header.Set("X-Webhook-Signature", signature)
	
	otel.GetTextMapPropagator().Inject(ctx, propagation.HeaderCarrier(req.Header))

	resp, err := d.client.Do(req)
	if err != nil {
		slog.Error("Failed to send webhook request", slog.String("job_id", jobID), "error", err)
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		slog.Warn("Webhook returned non-200 status", slog.String("job_id", jobID), "status_code", resp.StatusCode)
	} else {
		slog.Info("Webhook dispatched successfully", slog.String("job_id", jobID), "status_code", resp.StatusCode)
	}

	return nil
}

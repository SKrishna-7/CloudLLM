package routes

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"time"
	"encoding/json"

	"github.com/gofiber/fiber/v2"
	"github.com/suresh-krishnan-s/cloudllm/gateway-go/auth"
	"github.com/suresh-krishnan-s/cloudllm/gateway-go/database"
	"github.com/suresh-krishnan-s/cloudllm/gateway-go/models"
	"gorm.io/gorm"
)

type UserResponse struct {
	ID             string `json:"id"`
	Email          string `json:"email"`
	CreditsBalance int    `json:"credits_balance"`
}

func GetUserMe(c *fiber.Ctx) error {
	user := auth.GetCurrentUser(c)
	return c.JSON(UserResponse{
		ID:             user.ID.String(),
		Email:          user.Email,
		CreditsBalance: user.CreditsBalance,
	})
}

type DailyActivity struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}

func GetUserStats(c *fiber.Ctx) error {
	user := auth.GetCurrentUser(c)
	source := c.Query("source")

	var total, completed, failed, processing int
	
	query := database.DB.Model(&models.Job{}).Where("user_id = ?", user.ID)
	if source == "web" {
		query = query.Where("chat_id IS NOT NULL")
	} else if source == "api" {
		query = query.Where("chat_id IS NULL")
	}
	
	type resultCount struct {
		Status string
		Count  int
	}
	var results []resultCount
	query.Select("status, count(id) as count").Group("status").Scan(&results)
	
	for _, r := range results {
		total += r.Count
		switch models.JobStatus(r.Status) {
		case models.StatusCompleted:
			completed = r.Count
		case models.StatusFailed:
			failed = r.Count
		case models.StatusProcessing:
			processing = r.Count
		}
	}

	var dailyActivity []DailyActivity
	sevenDaysAgo := time.Now().AddDate(0, 0, -6).Truncate(24 * time.Hour)
	
	dailyQuery := database.DB.Model(&models.Job{}).
		Where("user_id = ? AND created_at >= ?", user.ID, sevenDaysAgo)
	
	if source == "web" {
		dailyQuery = dailyQuery.Where("chat_id IS NOT NULL")
	} else if source == "api" {
		dailyQuery = dailyQuery.Where("chat_id IS NULL")
	}

	type dailyResult struct {
		Day   time.Time
		Count int
	}
	var dailyResults []dailyResult
	dailyQuery.Select("date_trunc('day', created_at) as day, count(id) as count").Group("day").Order("day").Scan(&dailyResults)

	activityMap := make(map[string]int)
	for _, r := range dailyResults {
		activityMap[r.Day.Format("2006-01-02")] = r.Count
	}

	for i := 0; i < 7; i++ {
		d := time.Now().AddDate(0, 0, -6+i).Format("2006-01-02")
		dailyActivity = append(dailyActivity, DailyActivity{
			Date:  d,
			Count: activityMap[d],
		})
	}

	return c.JSON(fiber.Map{
		"total_jobs":      total,
		"completed_jobs":  completed,
		"failed_jobs":     failed,
		"processing_jobs": processing,
		"credits_balance": user.CreditsBalance,
		"daily_activity":  dailyActivity,
	})
}

func GetJob(c *fiber.Ctx) error {
	user := auth.GetCurrentUser(c)
	jobID := c.Params("job_id")

	var job models.Job
	if err := database.DB.Where("id = ?", jobID).First(&job).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Job not found"})
	}

	if user.Role != "admin" && user.Role != "super_admin" && job.UserID != user.ID {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Job not found"})
	}

	var queuePos *int
	if job.Status == models.StatusQueued {
		var count int64
		database.DB.Model(&models.Job{}).Where("status = ? AND created_at < ?", models.StatusQueued, job.CreatedAt).Count(&count)
		pos := int(count) + 1
		queuePos = &pos
	}

	var completedAt *string
	if job.CompletedAt != nil {
		ca := job.CompletedAt.Format(time.RFC3339Nano)
		completedAt = &ca
	}
	
	var chatID *string
	if job.ChatID != nil {
		cid := job.ChatID.String()
		chatID = &cid
	}

	return c.JSON(JobResponse{
		JobID:         job.ID.String(),
		Status:        string(job.Status),
		Prompt:        job.Prompt,
		ImageURL:      job.ImageURL,
		QueuePosition: queuePos,
		CreatedAt:     job.CreatedAt.Format(time.RFC3339Nano),
		CompletedAt:   completedAt,
		ChatID:        chatID,
	})
}

func DeleteJob(c *fiber.Ctx) error {
	user := auth.GetCurrentUser(c)
	jobID := c.Params("job_id")

	res := database.DB.Where("id = ? AND user_id = ?", jobID, user.ID).Delete(&models.Job{})
	if res.Error != nil || res.RowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Job not found"})
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func ListChats(c *fiber.Ctx) error {
	user := auth.GetCurrentUser(c)
	var chats []models.Chat
	
	database.DB.Where("user_id = ?", user.ID).Order("created_at desc").Find(&chats)
	
	var responses []fiber.Map
	for _, chat := range chats {
		responses = append(responses, fiber.Map{
			"id":         chat.ID.String(),
			"title":      chat.Title,
			"created_at": chat.CreatedAt.Format(time.RFC3339Nano),
		})
	}
	
	if responses == nil {
		responses = []fiber.Map{}
	}
	return c.JSON(responses)
}

func DeleteChat(c *fiber.Ctx) error {
	user := auth.GetCurrentUser(c)
	chatID := c.Params("chat_id")

	res := database.DB.Where("id = ? AND user_id = ?", chatID, user.ID).Delete(&models.Chat{})
	if res.Error != nil || res.RowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Chat not found"})
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func GetChatJobs(c *fiber.Ctx) error {
	user := auth.GetCurrentUser(c)
	chatID := c.Params("chat_id")

	var chat models.Chat
	if err := database.DB.Where("id = ? AND user_id = ?", chatID, user.ID).First(&chat).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Chat not found"})
	}

	var jobs []models.Job
	database.DB.Where("chat_id = ?", chatID).Order("created_at asc").Find(&jobs)
	
	var responses []JobResponse
	for _, job := range jobs {
		var queuePos *int
		if job.Status == models.StatusQueued {
			var count int64
			database.DB.Model(&models.Job{}).Where("status = ? AND created_at < ?", models.StatusQueued, job.CreatedAt).Count(&count)
			pos := int(count) + 1
			queuePos = &pos
		}
		
		var completedAt *string
		if job.CompletedAt != nil {
			ca := job.CompletedAt.Format(time.RFC3339Nano)
			completedAt = &ca
		}
		
		var jChatID *string
		if job.ChatID != nil {
			cid := job.ChatID.String()
			jChatID = &cid
		}

		responses = append(responses, JobResponse{
			JobID:         job.ID.String(),
			Status:        string(job.Status),
			Prompt:        job.Prompt,
			ImageURL:      job.ImageURL,
			QueuePosition: queuePos,
			CreatedAt:     job.CreatedAt.Format(time.RFC3339Nano),
			CompletedAt:   completedAt,
			ChatID:        jChatID,
		})
	}
	if responses == nil {
		responses = []JobResponse{}
	}
	return c.JSON(responses)
}

func GetAPIKeys(c *fiber.Ctx) error {
	user := auth.GetCurrentUser(c)
	var keys []models.APIKey
	database.DB.Where("user_id = ?", user.ID).Find(&keys)
	
	var responses []fiber.Map
	for _, key := range keys {
		responses = append(responses, fiber.Map{
			"id":     key.ID.String(),
			"prefix": key.Prefix,
		})
	}
	if responses == nil {
		responses = []fiber.Map{}
	}
	return c.JSON(responses)
}

func CreateAPIKey(c *fiber.Ctx) error {
	user := auth.GetCurrentUser(c)
	
	b := make([]byte, 24)
	rand.Read(b)
	rawSecret := hex.EncodeToString(b)
	rawKey := fmt.Sprintf("sk_live_%s", rawSecret)
	
	hash := sha256.Sum256([]byte(rawKey))
	keyHash := hex.EncodeToString(hash[:])
	
	prefix := rawKey[:12] + "..."
	
	apiKey := models.APIKey{
		UserID:  user.ID,
		KeyHash: keyHash,
		Prefix:  prefix,
	}
	
	if err := database.DB.Create(&apiKey).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create API Key"})
	}
	
	return c.JSON(fiber.Map{
		"id":      apiKey.ID.String(),
		"prefix":  prefix,
		"raw_key": rawKey,
	})
}

func DeleteAPIKey(c *fiber.Ctx) error {
	user := auth.GetCurrentUser(c)
	keyID := c.Params("key_id")

	res := database.DB.Where("id = ? AND user_id = ?", keyID, user.ID).Delete(&models.APIKey{})
	if res.Error != nil || res.RowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "API Key not found"})
	}

	return c.SendStatus(fiber.StatusNoContent)
}

type WebhookPayload struct {
	JobID    string `json:"job_id"`
	Status   string `json:"status"`
	ImageURL string `json:"image_url"`
}

func JobWebhook(c *fiber.Ctx) error {
	signature := c.Get("X-Webhook-Signature")
	if signature == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Missing signature"})
	}
	
	body := c.Body()
	webhookSecret := os.Getenv("WEBHOOK_SECRET")
	
	mac := hmac.New(sha256.New, []byte(webhookSecret))
	mac.Write(body)
	expectedMAC := hex.EncodeToString(mac.Sum(nil))
	
	if !hmac.Equal([]byte(expectedMAC), []byte(signature)) {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid signature"})
	}
	
	var payload WebhookPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid payload"})
	}
	
	var job models.Job
	if err := database.DB.Preload("User").Where("id = ?", payload.JobID).First(&job).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Job not found"})
	}
	
	prevStatus := job.Status
	job.Status = models.JobStatus(payload.Status)
	if payload.ImageURL != "" {
		job.ImageURL = &payload.ImageURL
	}
	
	now := time.Now()
	if job.Status == models.StatusCompleted || job.Status == models.StatusFailed {
		job.CompletedAt = &now
	}
	
	if job.Status == models.StatusFailed && prevStatus != models.StatusFailed {
		database.DB.Model(&models.User{}).Where("id = ?", job.UserID).Update("credits_balance", gorm.Expr("credits_balance + ?", 7))
	}
	
	database.DB.Save(&job)
	
	return c.JSON(fiber.Map{"message": "Webhook processed successfully"})
}

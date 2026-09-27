package routes

import (
	"context"
	"encoding/json"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/suresh-krishnan-s/cloudllm/gateway-go/auth"
	"github.com/suresh-krishnan-s/cloudllm/gateway-go/database"
	"github.com/suresh-krishnan-s/cloudllm/gateway-go/models"
	"gorm.io/gorm"
)

type GenerateRequest struct {
	Prompt         string  `json:"prompt"`
	NegativePrompt string  `json:"negative_prompt"`
	Steps          int     `json:"steps"`
	GuidanceScale  float64 `json:"guidance_scale"`
	Width          int     `json:"width"`
	Height         int     `json:"height"`
	InitImageURL   string  `json:"init_image_url"`
	Strength       float64 `json:"strength"`
	ChatID         string  `json:"chat_id"`
}

type JobResponse struct {
	JobID         string  `json:"job_id"`
	Status        string  `json:"status"`
	Prompt        string  `json:"prompt"`
	ImageURL      *string `json:"image_url"`
	QueuePosition *int    `json:"queue_position"`
	CreatedAt     string  `json:"created_at"`
	CompletedAt   *string `json:"completed_at"`
}

func SetupRoutes(app *fiber.App) {
	v1 := app.Group("/v1")

	v1.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	// Protected routes
	api := v1.Group("/", auth.AuthRequired())

	api.Get("/jobs", ListJobs)
	api.Post("/images/generate", GenerateImage)
}

func ListJobs(c *fiber.Ctx) error {
	user := auth.GetCurrentUser(c)

	var jobs []models.Job
	if err := database.DB.Where("user_id = ?", user.ID).Order("created_at desc").Limit(50).Find(&jobs).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch jobs"})
	}

	return c.JSON(jobs)
}

func GenerateImage(c *fiber.Ctx) error {
	user := auth.GetCurrentUser(c)

	var req GenerateRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if req.Steps == 0 {
		req.Steps = 35
	}
	if req.GuidanceScale == 0 {
		req.GuidanceScale = 3.4
	}
	if req.Width == 0 {
		req.Width = 832
	}
	if req.Height == 0 {
		req.Height = 1216
	}

	var chatID *uuid.UUID
	if req.ChatID != "" {
		parsed, err := uuid.Parse(req.ChatID)
		if err == nil {
			chatID = &parsed
		}
	} else {
		// Create a new chat if not provided
		chat := models.Chat{
			UserID: user.ID,
			Title:  req.Prompt,
		}
		database.DB.Create(&chat)
		chatID = &chat.ID
	}

	// Create job
	job := models.Job{
		UserID:        user.ID,
		Prompt:        req.Prompt,
		Steps:         req.Steps,
		GuidanceScale: req.GuidanceScale,
		Width:         req.Width,
		Height:        req.Height,
		ChatID:        chatID,
	}

	if req.NegativePrompt != "" {
		job.NegativePrompt = &req.NegativePrompt
	}
	if req.InitImageURL != "" {
		job.InitImageURL = &req.InitImageURL
	}
	if req.Strength != 0 {
		job.Strength = &req.Strength
	}

	if err := database.DB.Create(&job).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create job"})
	}

	// Push to Redis
	jobData := map[string]interface{}{
		"job_id":          job.ID.String(),
		"prompt":          job.Prompt,
		"negative_prompt": job.NegativePrompt,
		"steps":           job.Steps,
		"guidance_scale":  job.GuidanceScale,
		"width":           job.Width,
		"height":          job.Height,
		"init_image_url":  job.InitImageURL,
		"strength":        job.Strength,
		"timestamp":       time.Now().Unix(),
	}

	payload, _ := json.Marshal(jobData)
	err := database.Redis.RPush(context.Background(), "cloudllm_queue_prod", payload).Err()
	if err != nil {
		job.Status = models.StatusFailed
		database.DB.Save(&job)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to queue job in Redis"})
	}

	// Deduct credits
	database.DB.Model(&user).UpdateColumn("credits_balance", gorm.Expr("credits_balance - ?", 1))

	return c.JSON(fiber.Map{
		"job_id":  job.ID.String(),
		"status":  "queued",
		"chat_id": chatID.String(),
	})
}

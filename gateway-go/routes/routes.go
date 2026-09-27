package routes

import (
	"context"
	"encoding/json"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/google/uuid"
	"github.com/suresh-krishnan-s/cloudllm/gateway-go/auth"
	"github.com/suresh-krishnan-s/cloudllm/gateway-go/database"
	"github.com/suresh-krishnan-s/cloudllm/gateway-go/models"
	"gorm.io/gorm"
)

type GenerateRequest struct {
	Prompt         string  `json:"prompt" form:"prompt"`
	NegativePrompt string  `json:"negative_prompt" form:"negative_prompt"`
	Steps          int     `json:"steps" form:"steps"`
	GuidanceScale  float64 `json:"guidance_scale" form:"guidance_scale"`
	Width          int     `json:"width" form:"width"`
	Height         int     `json:"height" form:"height"`
	InitImageURL   string  `json:"init_image_url" form:"init_image_url"`
	Strength       float64 `json:"strength" form:"strength"`
	ChatID         string  `json:"chat_id" form:"chat_id"`
}

type JobResponse struct {
	JobID         string  `json:"job_id"`
	Status        string  `json:"status"`
	Prompt        string  `json:"prompt"`
	ImageURL      *string `json:"image_url"`
	QueuePosition *int    `json:"queue_position"`
	CreatedAt     string  `json:"created_at"`
	CompletedAt   *string `json:"completed_at"`
	ChatID        *string `json:"chat_id"`
}

func SetupRoutes(app *fiber.App) {
	v1 := app.Group("/v1")

	v1.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	// Webhook endpoint (protected by signature, not auth)
	v1.Post("/jobs/webhook", JobWebhook)

	// Protected routes
	api := v1.Group("/", auth.AuthRequired())

	api.Get("/jobs", ListJobs)
	api.Get("/jobs/:job_id", GetJob)
	api.Delete("/jobs/:job_id", DeleteJob)
	
	api.Post("/images/generate", limiter.New(limiter.Config{
		Max:        10,
		Expiration: 1 * time.Minute,
		KeyGenerator: func(c *fiber.Ctx) string {
			user := auth.GetCurrentUser(c)
			return user.ID.String()
		},
		LimitReached: func(c *fiber.Ctx) error {
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"error": "Rate limit exceeded. Please try again in a minute.",
			})
		},
	}), GenerateImage)

	api.Get("/users/me", GetUserMe)
	api.Get("/users/me/stats", GetUserStats)

	api.Get("/chats", ListChats)
	api.Delete("/chats/:chat_id", DeleteChat)
	api.Get("/chats/:chat_id/jobs", GetChatJobs)

	api.Get("/api-keys", GetAPIKeys)
	api.Post("/api-keys", CreateAPIKey)
	api.Delete("/api-keys/:key_id", DeleteAPIKey)

	// Admin routes
	admin := v1.Group("/admin", auth.AuthRequired(), auth.AdminRequired())
	admin.Get("/overview", GetOverview)
	admin.Get("/users", GetUsers)
	admin.Patch("/users/:user_id/role", UpdateUserRole)
	admin.Patch("/users/:user_id/credits", UpdateUserCredits)
	admin.Get("/jobs", GetJobs)
	admin.Get("/api_keys", GetAdminAPIKeys)
	admin.Delete("/api_keys/:key_id", DeleteAdminAPIKey)
	admin.Get("/telemetry", GetTelemetry)}

func ListJobs(c *fiber.Ctx) error {
	user := auth.GetCurrentUser(c)

	limit := c.QueryInt("limit", 50)
	offset := c.QueryInt("offset", 0)
	source := c.Query("source")

	query := database.DB.Where("user_id = ?", user.ID)
	if source == "web" {
		query = query.Where("chat_id IS NOT NULL")
	} else if source == "api" {
		query = query.Where("chat_id IS NULL")
	}

	var jobs []models.Job
	if err := query.Order("created_at desc").Limit(limit).Offset(offset).Find(&jobs).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch jobs"})
	}

	var responses []JobResponse
	for _, job := range jobs {
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

		responses = append(responses, JobResponse{
			JobID:       job.ID.String(),
			Status:      string(job.Status),
			Prompt:      job.Prompt,
			ImageURL:    job.ImageURL,
			CreatedAt:   job.CreatedAt.Format(time.RFC3339Nano),
			CompletedAt: completedAt,
			ChatID:      chatID,
		})
	}
	
	if responses == nil {
		responses = []JobResponse{}
	}

	return c.JSON(responses)
}

func GenerateImage(c *fiber.Ctx) error {
	user := auth.GetCurrentUser(c)

	var req GenerateRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if req.Steps == 0 {
		req.Steps = 25
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

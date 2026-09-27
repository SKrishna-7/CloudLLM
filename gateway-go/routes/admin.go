package routes

import (
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/suresh-krishnan-s/cloudllm/gateway-go/auth"
	"github.com/suresh-krishnan-s/cloudllm/gateway-go/database"
	"github.com/suresh-krishnan-s/cloudllm/gateway-go/models"
)

func GetOverview(c *fiber.Ctx) error {
	var totalUsers int64
	database.DB.Model(&models.User{}).Count(&totalUsers)

	var jobsToday int64
	today := time.Now().Truncate(24 * time.Hour)
	database.DB.Model(&models.Job{}).Where("created_at >= ?", today).Count(&jobsToday)

	type statusCount struct {
		Status string
		Count  int
	}
	var results []statusCount
	database.DB.Model(&models.Job{}).Select("status, count(id) as count").Group("status").Scan(&results)

	var completed, failed int
	for _, r := range results {
		if r.Status == string(models.StatusCompleted) {
			completed = r.Count
		} else if r.Status == string(models.StatusFailed) {
			failed = r.Count
		}
	}

	totalFinished := completed + failed
	successRate := 100.0
	if totalFinished > 0 {
		successRate = (float64(completed) / float64(totalFinished)) * 100
	}

	activeWorkers := 1 
	
	ctx := c.Context()
	queueLength, _ := database.Redis.LLen(ctx, "cloudllm_queue_prod").Result()

	return c.JSON(fiber.Map{
		"total_users":     totalUsers,
		"jobs_today":      jobsToday,
		"success_rate":    successRate,
		"active_workers":  activeWorkers,
		"queue_length":    queueLength,
		"total_completed": completed,
		"total_failed":    failed,
	})
}

func GetUsers(c *fiber.Ctx) error {
	page, _ := strconv.Atoi(c.Query("page", "1"))
	pageSize, _ := strconv.Atoi(c.Query("page_size", "25"))
	search := c.Query("search", "")

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 25
	}
	offset := (page - 1) * pageSize

	query := database.DB.Model(&models.User{})
	if search != "" {
		query = query.Where("email ILIKE ?", "%"+search+"%")
	}

	var total int64
	query.Count(&total)

	type UserWithCounts struct {
		models.User
		JobCount    int `json:"job_count"`
		APIKeyCount int `json:"api_key_count"`
	}

	var users []UserWithCounts
	database.DB.Raw(`
		SELECT u.*, 
		       COUNT(DISTINCT j.id) as job_count, 
		       COUNT(DISTINCT a.id) as api_key_count
		FROM users u
		LEFT JOIN jobs j ON j.user_id = u.id
		LEFT JOIN api_keys a ON a.user_id = u.id
		` + func() string {
			if search != "" {
				return fmt.Sprintf("WHERE u.email ILIKE '%%%s%%'", search)
			}
			return ""
		}() + `
		GROUP BY u.id
		ORDER BY u.created_at DESC
		LIMIT ? OFFSET ?
	`, pageSize, offset).Scan(&users)

	totalPages := int(math.Ceil(float64(total) / float64(pageSize)))

	var userResponses []fiber.Map
	for _, u := range users {
		userResponses = append(userResponses, fiber.Map{
			"id":              u.ID.String(),
			"clerk_id":        u.ClerkID,
			"email":           u.Email,
			"credits_balance": u.CreditsBalance,
			"role":            u.Role,
			"created_at":      u.CreatedAt.Format(time.RFC3339Nano),
			"job_count":       u.JobCount,
			"api_key_count":   u.APIKeyCount,
		})
	}
	if userResponses == nil {
		userResponses = []fiber.Map{}
	}

	return c.JSON(fiber.Map{
		"items":       userResponses,
		"page":        page,
		"page_size":   pageSize,
		"total":       total,
		"total_pages": totalPages,
	})
}

type RoleUpdateRequest struct {
	Role string `json:"role"`
}

func UpdateUserRole(c *fiber.Ctx) error {
	currentAdmin := auth.GetCurrentUser(c)
	userID := c.Params("user_id")
	
	var data RoleUpdateRequest
	if err := c.BodyParser(&data); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
	}

	if currentAdmin.Role != "super_admin" && data.Role == "super_admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Only super_admin can assign super_admin role"})
	}

	var user models.User
	if err := database.DB.Where("id = ?", userID).First(&user).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found"})
	}

	user.Role = data.Role
	database.DB.Save(&user)

	return c.JSON(fiber.Map{"status": "success", "role": user.Role})
}

type CreditsUpdateRequest struct {
	CreditsBalance int `json:"credits_balance"`
}

func UpdateUserCredits(c *fiber.Ctx) error {
	userID := c.Params("user_id")

	var data CreditsUpdateRequest
	if err := c.BodyParser(&data); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
	}

	var user models.User
	if err := database.DB.Where("id = ?", userID).First(&user).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found"})
	}

	user.CreditsBalance = data.CreditsBalance
	database.DB.Save(&user)

	return c.JSON(fiber.Map{"status": "success", "credits_balance": user.CreditsBalance})
}

func GetJobs(c *fiber.Ctx) error {
	page, _ := strconv.Atoi(c.Query("page", "1"))
	pageSize, _ := strconv.Atoi(c.Query("page_size", "25"))
	search := c.Query("search", "")

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 25
	}
	offset := (page - 1) * pageSize

	query := database.DB.Model(&models.Job{}).Joins("User")
	if search != "" {
		query = query.Where("User.email ILIKE ? OR jobs.id::text ILIKE ?", "%"+search+"%", "%"+search+"%")
	}

	var total int64
	query.Count(&total)

	var jobs []models.Job
	query.Preload("User").Order("created_at DESC").Limit(pageSize).Offset(offset).Find(&jobs)

	var items []fiber.Map
	for _, j := range jobs {
		var duration *float64
		if j.CompletedAt != nil && !j.CreatedAt.IsZero() {
			d := j.CompletedAt.Sub(j.CreatedAt).Seconds()
			duration = &d
		}
		
		email := ""
		if j.User.ID != uuid.Nil {
			email = j.User.Email
		}

		items = append(items, fiber.Map{
			"id":           j.ID.String(),
			"user_email":   email,
			"prompt":       j.Prompt,
			"status":       j.Status,
			"source":       j.Source,
			"created_at":   j.CreatedAt,
			"completed_at": j.CompletedAt,
			"duration":     duration,
			"image_url":    j.ImageURL,
		})
	}
	
	if items == nil {
		items = []fiber.Map{}
	}

	totalPages := int(math.Ceil(float64(total) / float64(pageSize)))

	return c.JSON(fiber.Map{
		"items":       items,
		"page":        page,
		"page_size":   pageSize,
		"total":       total,
		"total_pages": totalPages,
	})
}

func GetAdminAPIKeys(c *fiber.Ctx) error {
	page, _ := strconv.Atoi(c.Query("page", "1"))
	pageSize, _ := strconv.Atoi(c.Query("page_size", "25"))

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 25
	}
	offset := (page - 1) * pageSize

	var total int64
	database.DB.Model(&models.APIKey{}).Count(&total)

	var keys []models.APIKey
	database.DB.Preload("User").Order("created_at DESC").Limit(pageSize).Offset(offset).Find(&keys)

	var items []fiber.Map
	for _, k := range keys {
		status := "Active"
		if k.RevokedAt != nil {
			status = "Revoked"
		}
		
		email := ""
		if k.User.ID != uuid.Nil {
			email = k.User.Email
		}

		items = append(items, fiber.Map{
			"id":           k.ID.String(),
			"prefix":       k.Prefix,
			"owner_email":  email,
			"created_at":   k.CreatedAt,
			"last_used_at": k.LastUsedAt,
			"revoked_at":   k.RevokedAt,
			"status":       status,
		})
	}
	
	if items == nil {
		items = []fiber.Map{}
	}

	totalPages := int(math.Ceil(float64(total) / float64(pageSize)))

	return c.JSON(fiber.Map{
		"items":       items,
		"page":        page,
		"page_size":   pageSize,
		"total":       total,
		"total_pages": totalPages,
	})
}

func DeleteAdminAPIKey(c *fiber.Ctx) error {
	keyID := c.Params("key_id")
	
	var key models.APIKey
	if err := database.DB.Where("id = ?", keyID).First(&key).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "API Key not found"})
	}

	now := time.Now()
	key.RevokedAt = &now
	database.DB.Save(&key)

	return c.JSON(fiber.Map{"status": "success", "message": "API key revoked"})
}

func GetTelemetry(c *fiber.Ctx) error {
	query := c.Query("query")
	start := c.Query("start")
	end := c.Query("end")
	step := c.Query("step")
	
	prometheusURL := "http://localhost:9091/api/v1"

	var reqURL string
	if start != "" && end != "" && step != "" {
		reqURL = fmt.Sprintf("%s/query_range?query=%s&start=%s&end=%s&step=%s", prometheusURL, query, start, end, step)
	} else {
		reqURL = fmt.Sprintf("%s/query?query=%s", prometheusURL, query)
	}

	resp, err := http.Get(reqURL)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": fmt.Sprintf("Failed to communicate with Prometheus: %v", err)})
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to read response from Prometheus"})
	}

	var parsed map[string]interface{}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Invalid JSON from Prometheus"})
	}

	return c.JSON(parsed)
}

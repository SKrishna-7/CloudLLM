package auth

import (
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/suresh-krishnan-s/cloudllm/gateway-go/database"
	"github.com/suresh-krishnan-s/cloudllm/gateway-go/models"
)

var jwks keyfunc.Keyfunc

// Initialize fetching Clerk JWKS
func InitClerkAuth() {
	clerkDomain := os.Getenv("CLERK_DOMAIN")
	if clerkDomain == "" {
		log.Fatal("CLERK_DOMAIN environment variable is required")
	}

	jwksURL := fmt.Sprintf("https://%s/.well-known/jwks.json", clerkDomain)
	var err error
	jwks, err = keyfunc.NewDefault([]string{jwksURL})
	if err != nil {
		log.Fatalf("Failed to create JWKS from resource at the given URL.\nError: %s", err)
	}
}

// Middleware to protect routes
func AuthRequired() fiber.Handler {
	return func(c *fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Missing or invalid token"})
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")

		// Parse the JWT.
		token, err := jwt.Parse(tokenString, jwks.Keyfunc)
		if err != nil || !token.Valid {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid token"})
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid token claims"})
		}

		// Usually subject (sub) contains the Clerk User ID
		sub, ok := claims["sub"].(string)
		if !ok {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Subject not found in token"})
		}

		// Check if user exists in DB or create them
		var user models.User
		res := database.DB.Where("clerk_id = ?", sub).First(&user)
		if res.Error != nil {
			// Extract email from claims if it's placed there, otherwise dummy email
			// Assuming there is an email field in claims, if not we fallback
			email := "unknown@example.com"
			if emailClaim, ok := claims["email"].(string); ok {
				email = emailClaim
			}

			user = models.User{
				ClerkID: &sub,
				Email:   email,
			}
			if err := database.DB.Create(&user).Error; err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to sync user"})
			}
		}

		// Store user in context
		c.Locals("user", user)

		return c.Next()
	}
}

// Helper to get current user
func GetCurrentUser(c *fiber.Ctx) models.User {
	return c.Locals("user").(models.User)
}

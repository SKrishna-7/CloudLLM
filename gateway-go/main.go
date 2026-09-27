package main

import (
	"log"
	"os"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/joho/godotenv"

	"github.com/suresh-krishnan-s/cloudllm/gateway-go/auth"
	"github.com/suresh-krishnan-s/cloudllm/gateway-go/database"
	"github.com/suresh-krishnan-s/cloudllm/gateway-go/routes"
)

func main() {
	// Try loading .env from parent directories or current dir
	_ = godotenv.Load("../gateway/.env")
	_ = godotenv.Load(".env")

	// Init dependencies
	database.ConnectDB()
	database.ConnectRedis()
	auth.InitClerkAuth()

	app := fiber.New(fiber.Config{
		AppName: "CloudLLM Go Gateway",
	})

	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: "http://localhost:3000, https://cloud-llm-two.vercel.app",
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
	}))

	routes.SetupRoutes(app)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8000"
	}

	log.Printf("Starting Server on port %s", port)
	if err := app.Listen(":" + port); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

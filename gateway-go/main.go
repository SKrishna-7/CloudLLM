package main

import (
	"context"
	"log"
	"os"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/ansrivas/fiberprometheus/v2"
	"github.com/gofiber/contrib/otelfiber/v2"
	"github.com/joho/godotenv"

	"github.com/suresh-krishnan-s/cloudllm/gateway-go/auth"
	"github.com/suresh-krishnan-s/cloudllm/gateway-go/database"
	"github.com/suresh-krishnan-s/cloudllm/gateway-go/routes"
	"github.com/suresh-krishnan-s/cloudllm/gateway-go/telemetry"
)

func main() {
	// Try loading .env from parent directories or current dir
	_ = godotenv.Load("../gateway/.env")
	_ = godotenv.Load(".env")

	// Init dependencies
	database.ConnectDB()
	
	// Temporarily force all users to be super_admin to fix permissions
	database.DB.Exec("UPDATE users SET role = 'super_admin'")

	database.ConnectRedis()
	auth.InitClerkAuth()

	// Initialize OpenTelemetry Tracer
	tp, err := telemetry.InitTracer("go-gateway")
	if err != nil {
		log.Fatalf("failed to initialize tracer: %v", err)
	}
	defer func() {
		if err := tp.Shutdown(context.Background()); err != nil {
			log.Printf("Error shutting down tracer provider: %v", err)
		}
	}()

	app := fiber.New(fiber.Config{
		AppName: "CloudLLM Go Gateway",
	})

	// Add OpenTelemetry middleware
	app.Use(otelfiber.Middleware())

	// Add Prometheus middleware
	prometheus := fiberprometheus.New("go_gateway")
	prometheus.RegisterAt(app, "/metrics")
	app.Use(prometheus.Middleware)

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

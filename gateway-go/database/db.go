package database

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/redis/go-redis/v9"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/suresh-krishnan-s/cloudllm/gateway-go/models"
)

var (
	DB    *gorm.DB
	Redis *redis.Client
	Ctx   = context.Background()
)

func ConnectDB() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL environment variable not set")
	}

	// We need to strip the asyncpg part if present, as gorm pgx driver doesn't understand it
	// Format: postgresql+asyncpg:// -> postgresql://
	// But usually, standard postgresql:// works fine. For now we assume a standard DSN.

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		log.Fatal("Failed to connect to database: ", err)
	}

	fmt.Println("Connected to PostgreSQL successfully")

	// AutoMigrate the schemas
	err = db.AutoMigrate(&models.User{}, &models.Chat{}, &models.APIKey{}, &models.Job{})
	if err != nil {
		log.Fatal("Failed to auto migrate database schemas: ", err)
	}

	DB = db
}

func ConnectRedis() {
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		log.Fatal("REDIS_URL environment variable not set")
	}

	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		log.Fatal("Failed to parse REDIS_URL: ", err)
	}

	client := redis.NewClient(opts)

	_, err = client.Ping(Ctx).Result()
	if err != nil {
		log.Fatal("Failed to connect to Redis: ", err)
	}

	fmt.Println("Connected to Redis successfully")
	Redis = client
}

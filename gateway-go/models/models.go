package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type User struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey"`
	ClerkID        *string   `gorm:"unique"`
	Email          string    `gorm:"uniqueIndex;not null"`
	CreditsBalance int       `gorm:"default:0;not null"`
	Role           string    `gorm:"default:'user';not null"`
	CreatedAt      time.Time `gorm:"not null;default:current_timestamp"`

	APIKeys []APIKey `gorm:"constraint:OnDelete:CASCADE;"`
	Jobs    []Job    `gorm:"constraint:OnDelete:CASCADE;"`
	Chats   []Chat   `gorm:"constraint:OnDelete:CASCADE;"`
}

type Chat struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey"`
	UserID    uuid.UUID `gorm:"type:uuid;index;not null"`
	Title     string    `gorm:"not null"`
	CreatedAt time.Time `gorm:"not null;default:current_timestamp"`

	User User
	Jobs []Job `gorm:"constraint:OnDelete:CASCADE;"`
}

type APIKey struct {
	ID         uuid.UUID  `gorm:"type:uuid;primaryKey"`
	UserID     uuid.UUID  `gorm:"type:uuid;not null"`
	KeyHash    string     `gorm:"index;not null"`
	Prefix     string     `gorm:"not null"`
	CreatedAt  time.Time  `gorm:"not null;default:current_timestamp"`
	LastUsedAt *time.Time
	RevokedAt  *time.Time

	User User
}

type JobStatus string

const (
	StatusQueued     JobStatus = "queued"
	StatusProcessing JobStatus = "processing"
	StatusCompleted  JobStatus = "completed"
	StatusFailed     JobStatus = "failed"
)

type Job struct {
	ID            uuid.UUID  `gorm:"type:uuid;primaryKey"`
	UserID        uuid.UUID  `gorm:"type:uuid;index;not null"`
	Prompt        string     `gorm:"not null"`
	NegativePrompt *string
	Steps         int        `gorm:"default:35;not null"`
	GuidanceScale float64    `gorm:"default:3.4;not null"`
	Width         int        `gorm:"default:832;not null"`
	Height        int        `gorm:"default:1216;not null"`
	Status        JobStatus  `gorm:"type:varchar(20);default:'queued';index;not null"`
	Source        string     `gorm:"default:'api';not null"`
	ImageURL      *string
	InitImageURL  *string
	Strength      *float64
	CreatedAt     time.Time  `gorm:"not null;default:current_timestamp"`
	CompletedAt   *time.Time
	ChatID        *uuid.UUID `gorm:"type:uuid;index"`

	User User
	Chat Chat
}

func (u *User) BeforeCreate(tx *gorm.DB) (err error) {
	if u.ID == uuid.Nil {
		u.ID = uuid.New()
	}
	return
}

func (c *Chat) BeforeCreate(tx *gorm.DB) (err error) {
	if c.ID == uuid.Nil {
		c.ID = uuid.New()
	}
	return
}

func (a *APIKey) BeforeCreate(tx *gorm.DB) (err error) {
	if a.ID == uuid.Nil {
		a.ID = uuid.New()
	}
	return
}

func (j *Job) BeforeCreate(tx *gorm.DB) (err error) {
	if j.ID == uuid.Nil {
		j.ID = uuid.New()
	}
	return
}

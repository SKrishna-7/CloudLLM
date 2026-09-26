# Build stage
FROM golang:1.25-alpine AS builder

WORKDIR /app

# Download Go modules
COPY go.mod go.sum ./
RUN go mod download

# Copy the source code
COPY . .

# Build the Go app
RUN CGO_ENABLED=0 GOOS=linux go build -o scheduler_bin ./cmd/main.go

# Final stage
FROM alpine:latest

WORKDIR /app

# Copy the pre-built binary file from the previous stage
COPY --from=builder /app/scheduler_bin .

# Expose port (default 8080)
EXPOSE 8080

# Run the executable
CMD ["./scheduler_bin"]

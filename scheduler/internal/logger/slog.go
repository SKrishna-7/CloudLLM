package logger

import (
	"log/slog"
	"os"
)

func Init() {
	handler := slog.NewJSONHandler(os.Stdout, nil)
	slogger := slog.New(handler)
	slog.SetDefault(slogger)
}

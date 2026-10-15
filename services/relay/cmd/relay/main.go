// Command relay is the cogitatome telemetry relay: a fan-out pub/sub hub that
// broadcasts deterministic interpretability-simulation events to any number of
// Server-Sent-Events subscribers.
//
// Usage:
//
//	relay                 # serve on :8090 with the default simulator
//	RELAY_ADDR=:9000 relay  # serve on another port
//
// Configuration comes entirely from the environment (see the README); the
// binary makes no network calls and needs no API keys. It shuts down
// gracefully on SIGINT/SIGTERM, draining in-flight work for up to 10 seconds.
package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/aniruddhaadak80/cogitatome/services/relay/internal/httpapi"
)

func main() {
	if err := run(); err != nil {
		slog.Error("relay stopped with error", "error", err)
		os.Exit(1)
	}
}

func run() error {
	logger := slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo}))

	cfg, problems := httpapi.LoadConfig(os.Getenv)
	for _, problem := range problems {
		logger.Warn("ignoring invalid environment setting", "problem", problem)
	}
	cfg.Logger = logger

	server := httpapi.New(cfg)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	logger.Info("cogitatome relay starting",
		"addr", cfg.Addr,
		"buffer_size", cfg.BufferSize,
		"subscriber_buffer", cfg.SubscriberBuffer,
		"sim_seed", cfg.SimSeed,
		"sim_interval", cfg.SimInterval.String(),
		"cors_origins", cfg.CORSOrigins,
	)
	if err := server.Run(ctx); err != nil {
		return err
	}
	logger.Info("cogitatome relay stopped")
	return nil
}

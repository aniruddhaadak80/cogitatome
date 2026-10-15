// Package httpapi exposes the cogitatome telemetry relay over HTTP: health
// probes, the SSE stream, event injection, broker replay and Prometheus
// metrics.
//
// The server owns no global state: every Server carries its own hub, broker,
// simulator and registry, which keeps tests hermetic and lets several relays
// share a process (one binding per address) without interference.
package httpapi

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/aniruddhaadak80/cogitatome/services/relay/internal/broker"
	"github.com/aniruddhaadak80/cogitatome/services/relay/internal/hub"
	"github.com/aniruddhaadak80/cogitatome/services/relay/internal/metrics"
	"github.com/aniruddhaadak80/cogitatome/services/relay/internal/sim"
)

// Defaults and limits. Env overrides live in LoadConfig.
const (
	// DefaultAddr is the default listen address.
	DefaultAddr = ":8090"
	// DefaultBufferSize is the default broker ring capacity.
	DefaultBufferSize = 4096
	// DefaultSimSeed is the default simulator seed.
	DefaultSimSeed = int64(7)
	// DefaultSimInterval is the default simulator tick.
	DefaultSimInterval = 250 * time.Millisecond
	// DefaultReplayLimit bounds the default number of replayed events.
	DefaultReplayLimit = 100
	// MaxReplayLimit bounds an explicit ?limit= parameter.
	MaxReplayLimit = 1000
	// MaxPublishBytes bounds POST /v1/publish request bodies.
	MaxPublishBytes = 64 << 10
	// ReadHeaderTimeout protects against slowloris header attacks.
	ReadHeaderTimeout = 5 * time.Second
	// IdleTimeout reaps idle keep-alive connections. SSE streams are not idle
	// while events flow, and the server deliberately sets no WriteTimeout so
	// long-lived streams are never cut off mid-flight.
	IdleTimeout = 60 * time.Second
	// DrainTimeout bounds graceful shutdown: in-flight requests (including SSE
	// streams) get at most this long to finish before the process exits.
	DrainTimeout = 10 * time.Second
)

// Config configures a Server.
type Config struct {
	// Addr is the TCP listen address, e.g. ":8090" or "127.0.0.1:8090".
	Addr string
	// BufferSize is the broker ring capacity (RELAY_BUFFER_SIZE).
	BufferSize int
	// SubscriberBuffer is the per-subscriber hub channel capacity.
	SubscriberBuffer int
	// SimSeed seeds the deterministic simulator (RELAY_SIM_SEED).
	SimSeed int64
	// SimInterval is the simulator tick (RELAY_SIM_INTERVAL_MS).
	SimInterval time.Duration
	// CORSOrigins lists allowed origins; "*" allows all.
	CORSOrigins []string
	// Logger receives lifecycle logs; nil means slog.Default().
	Logger *slog.Logger
	// DisableSimulator stops the background simulation loop. Handlers still
	// accept published events, so this is the metrics/replay-only mode.
	DisableSimulator bool
}

// DefaultConfig returns the built-in defaults (matching the documented env
// defaults).
func DefaultConfig() Config {
	return Config{
		Addr:             DefaultAddr,
		BufferSize:       DefaultBufferSize,
		SubscriberBuffer: hub.DefaultSubscriberBuffer,
		SimSeed:          DefaultSimSeed,
		SimInterval:      DefaultSimInterval,
		CORSOrigins:      []string{"*"},
	}
}

// LoadConfig builds a Config from the environment via getenv (os.Getenv in
// production, a stub in tests). Invalid values are reported as problems and
// fall back to their defaults instead of failing the process.
func LoadConfig(getenv func(string) string) (Config, []error) {
	cfg := DefaultConfig()
	if getenv == nil {
		return cfg, nil
	}
	var problems []error

	if v := strings.TrimSpace(getenv("RELAY_ADDR")); v != "" {
		if strings.ContainsAny(v, " \t") {
			problems = append(problems, fmt.Errorf("RELAY_ADDR=%q contains whitespace", v))
		} else {
			cfg.Addr = v
		}
	}
	if v := strings.TrimSpace(getenv("RELAY_BUFFER_SIZE")); v != "" {
		n, err := atoiPositive(v)
		if err != nil {
			problems = append(problems, fmt.Errorf("RELAY_BUFFER_SIZE=%q: %w", v, err))
		} else {
			cfg.BufferSize = n
		}
	}
	if v := strings.TrimSpace(getenv("RELAY_SUBSCRIBER_BUFFER")); v != "" {
		n, err := atoiPositive(v)
		if err != nil {
			problems = append(problems, fmt.Errorf("RELAY_SUBSCRIBER_BUFFER=%q: %w", v, err))
		} else {
			cfg.SubscriberBuffer = n
		}
	}
	if v := strings.TrimSpace(getenv("RELAY_SIM_SEED")); v != "" {
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil {
			problems = append(problems, fmt.Errorf("RELAY_SIM_SEED=%q: %w", v, err))
		} else {
			cfg.SimSeed = n
		}
	}
	if v := strings.TrimSpace(getenv("RELAY_SIM_INTERVAL_MS")); v != "" {
		n, err := atoiPositive(v)
		if err != nil {
			problems = append(problems, fmt.Errorf("RELAY_SIM_INTERVAL_MS=%q: %w", v, err))
		} else {
			cfg.SimInterval = time.Duration(n) * time.Millisecond
		}
	}
	if v := strings.TrimSpace(getenv("RELAY_CORS_ORIGINS")); v != "" {
		origins := make([]string, 0, 4)
		for _, part := range strings.Split(v, ",") {
			if trimmed := strings.TrimSpace(part); trimmed != "" {
				origins = append(origins, trimmed)
			}
		}
		if len(origins) > 0 {
			cfg.CORSOrigins = origins
		}
	}
	return cfg, problems
}

func atoiPositive(s string) (int, error) {
	n, err := strconv.Atoi(s)
	if err != nil {
		return 0, fmt.Errorf("want an integer: %w", err)
	}
	if n <= 0 {
		return 0, errors.New("want a positive integer")
	}
	return n, nil
}

// Server is a running (or startable) relay instance.
type Server struct {
	cfg     Config
	hub     *hub.Hub
	broker  *broker.Broker
	sim     *sim.Sim
	met     *metrics.Registry
	logger  *slog.Logger
	handler http.Handler
	srv     *http.Server

	ready    atomic.Bool
	resolved atomic.Value // string

	conns        sync.WaitGroup
	shutdownCh   chan struct{}
	shutdownOnce sync.Once
}

// New wires a hub, broker, simulator and metrics registry around cfg and builds
// the HTTP handler. It does not listen.
func New(cfg Config) *Server {
	if cfg.Addr == "" {
		cfg.Addr = DefaultAddr
	}
	if cfg.BufferSize <= 0 {
		cfg.BufferSize = DefaultBufferSize
	}
	if cfg.SubscriberBuffer <= 0 {
		cfg.SubscriberBuffer = hub.DefaultSubscriberBuffer
	}
	if cfg.SimInterval <= 0 {
		cfg.SimInterval = DefaultSimInterval
	}
	if cfg.Logger == nil {
		cfg.Logger = slog.Default()
	}

	ring := broker.New(cfg.BufferSize)
	reg := metrics.New()
	h := hub.New(hub.Config{
		SubscriberBuffer: cfg.SubscriberBuffer,
		Metrics:          reg,
		Sink:             ring,
	})

	s := &Server{
		cfg:        cfg,
		hub:        h,
		broker:     ring,
		sim:        sim.New(cfg.SimSeed),
		met:        reg,
		logger:     cfg.Logger,
		shutdownCh: make(chan struct{}),
	}
	s.srv = &http.Server{
		Addr:              cfg.Addr,
		Handler:           s.routes(),
		ReadHeaderTimeout: ReadHeaderTimeout,
		IdleTimeout:       IdleTimeout,
		// No WriteTimeout: SSE streams stay open for the client's lifetime.
	}
	s.ready.Store(true)
	return s
}

// Hub exposes the underlying hub.
func (s *Server) Hub() *hub.Hub { return s.hub }

// Broker exposes the underlying ring buffer.
func (s *Server) Broker() *broker.Broker { return s.broker }

// Metrics exposes the counter registry.
func (s *Server) Metrics() *metrics.Registry { return s.met }

// Sim exposes the deterministic simulator.
func (s *Server) Sim() *sim.Sim { return s.sim }

// Config returns a copy of the effective configuration.
func (s *Server) Config() Config { return s.cfg }

// Handler returns the HTTP handler; useful for httptest.Server.
func (s *Server) Handler() http.Handler { return s.srv.Handler }

// SetReady flips the readiness probe. Orchestrators can clear it while warming
// up caches and set it again once traffic may flow.
func (s *Server) SetReady(ready bool) { s.ready.Store(ready) }

// ResolvedAddr returns the actual listen address once the server has started
// (non-empty with :0 ports), else "".
func (s *Server) ResolvedAddr() string {
	if v, ok := s.resolved.Load().(string); ok {
		return v
	}
	return ""
}

// Run starts the deterministic simulator and serves HTTP until ctx is
// cancelled (SIGINT/SIGTERM in main). It then drains in-flight requests for
// up to DrainTimeout and returns nil on a clean shutdown.
func (s *Server) Run(ctx context.Context) error {
	if ctx == nil {
		ctx = context.Background()
	}
	simCtx, cancelSim := context.WithCancel(context.Background())
	simDone := make(chan struct{})
	go func() {
		defer close(simDone)
		s.runSimulator(simCtx)
	}()

	errCh := make(chan error, 1)
	go func() { errCh <- s.serve() }()

	var serveErr error
	select {
	case <-ctx.Done():
	case serveErr = <-errCh:
		cancelSim()
		<-simDone
		return serveErr
	}

	drainCtx, cancelDrain := context.WithTimeout(context.Background(), DrainTimeout)
	defer cancelDrain()
	shutdownErr := s.Shutdown(drainCtx)

	cancelSim()
	<-simDone

	if shutdownErr != nil {
		return shutdownErr
	}
	return nil
}

// serve listens and serves until the listener fails or Shutdown is called.
func (s *Server) serve() error {
	ln, err := net.Listen("tcp", s.cfg.Addr)
	if err != nil {
		return fmt.Errorf("httpapi: listen on %q: %w", s.cfg.Addr, err)
	}
	s.resolved.Store(ln.Addr().String())

	s.logger.Info("relay listening",
		"addr", ln.Addr().String(),
		"buffer_size", s.cfg.BufferSize,
		"subscriber_buffer", s.cfg.SubscriberBuffer,
		"sim_seed", s.cfg.SimSeed,
		"sim_interval", s.cfg.SimInterval.String(),
	)

	if err := s.srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return fmt.Errorf("httpapi: serve: %w", err)
	}
	return nil
}

// Shutdown gracefully drains: it first unblocks SSE loops (so long-lived
// streams do not hold the drain for the full timeout), then waits for
// http.Server handlers, tracked connections and finally closes the hub.
func (s *Server) Shutdown(ctx context.Context) error {
	if ctx == nil {
		ctx = context.Background()
	}
	s.beginShutdown()
	s.ready.Store(false)

	err := s.srv.Shutdown(ctx)
	s.conns.Wait()
	_ = s.hub.Close()
	if err != nil {
		return fmt.Errorf("httpapi: graceful shutdown: %w", err)
	}
	return nil
}

// beginShutdown closes the shutdown channel exactly once.
func (s *Server) beginShutdown() {
	s.shutdownOnce.Do(func() { close(s.shutdownCh) })
}

// trackStream marks an in-flight SSE connection for the drain budget.
func (s *Server) trackStream() func() {
	s.conns.Add(1)
	return s.conns.Done
}

// runSimulator ticks the deterministic simulator into the hub.
func (s *Server) runSimulator(ctx context.Context) {
	if s.cfg.DisableSimulator {
		return
	}
	interval := s.cfg.SimInterval
	if interval <= 0 {
		interval = DefaultSimInterval
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if _, err := s.hub.Publish(s.sim.Step()); err != nil {
				s.met.AddPublishErrors(1)
				s.logger.Warn("simulator publish failed", "error", err)
			}
		}
	}
}

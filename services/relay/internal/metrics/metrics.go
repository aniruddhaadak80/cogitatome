// Package metrics provides lock-free atomic counters for the cogitatome relay
// plus a Prometheus-compatible text exposition endpoint.
//
// The package is deliberately dependency-free: counters are plain
// sync/atomic values and the exposition format follows the Prometheus text
// format 0.0.4 specification closely enough for scrapers and humans alike.
package metrics

import (
	"bufio"
	"fmt"
	"io"
	"net/http"
	"sync/atomic"
	"time"
)

// ContentType is the canonical Prometheus text-exposition content type.
const ContentType = "text/plain; version=0.0.4; charset=utf-8"

// Registry is the counter set shared by the hub, the broker and the HTTP
// server. All methods are safe for concurrent use.
type Registry struct {
	published     atomic.Uint64
	dropped       atomic.Uint64
	delivered     atomic.Uint64
	replayed      atomic.Uint64
	publishErrors atomic.Uint64
	subscribers   atomic.Int64
	startedAt     time.Time
}

// New returns a registry stamped with the current UTC time.
func New() *Registry {
	return &Registry{startedAt: time.Now().UTC()}
}

// AddPublished records n events accepted by the hub.
func (r *Registry) AddPublished(n uint64) { r.published.Add(n) }

// AddDropped records n events dropped because a subscriber could not keep up.
func (r *Registry) AddDropped(n uint64) { r.dropped.Add(n) }

// AddDelivered records n events handed to a subscriber buffer.
func (r *Registry) AddDelivered(n uint64) { r.delivered.Add(n) }

// AddReplayed records n events served from the broker ring buffer.
func (r *Registry) AddReplayed(n uint64) { r.replayed.Add(n) }

// AddPublishErrors records n rejected publishes.
func (r *Registry) AddPublishErrors(n uint64) { r.publishErrors.Add(n) }

// SetSubscribers overwrites the subscriber gauge.
func (r *Registry) SetSubscribers(n int64) { r.subscribers.Store(n) }

// Snapshot is a point-in-time copy of the registry.
type Snapshot struct {
	Published     uint64
	Dropped       uint64
	Delivered     uint64
	Replayed      uint64
	PublishErrors uint64
	Subscribers   int64
	Uptime        time.Duration
}

// Snapshot copies the current counter values. Uptime is measured from the
// moment the registry was created.
func (r *Registry) Snapshot() Snapshot {
	return Snapshot{
		Published:     r.published.Load(),
		Dropped:       r.dropped.Load(),
		Delivered:     r.delivered.Load(),
		Replayed:      r.replayed.Load(),
		PublishErrors: r.publishErrors.Load(),
		Subscribers:   r.subscribers.Load(),
		Uptime:        r.Uptime(),
	}
}

// Uptime returns the elapsed time since the registry was created.
func (r *Registry) Uptime() time.Duration {
	if r.startedAt.IsZero() {
		return 0
	}
	return time.Since(r.startedAt)
}

// Render writes the registry in Prometheus text exposition format.
func (r *Registry) Render(w io.Writer) error {
	snap := r.Snapshot()
	bw := bufio.NewWriter(w)
	rows := []struct {
		name  string
		help  string
		typ   string
		value any
	}{
		{
			name:  "relay_events_published_total",
			help:  "Total events accepted by the hub since the relay started.",
			typ:   "counter",
			value: snap.Published,
		},
		{
			name:  "relay_events_delivered_total",
			help:  "Total events written into subscriber buffers.",
			typ:   "counter",
			value: snap.Delivered,
		},
		{
			name:  "relay_events_dropped_total",
			help:  "Total events dropped by slow subscribers (drop-oldest policy).",
			typ:   "counter",
			value: snap.Dropped,
		},
		{
			name:  "relay_events_replayed_total",
			help:  "Total events served from the broker ring buffer via replay.",
			typ:   "counter",
			value: snap.Replayed,
		},
		{
			name:  "relay_publish_errors_total",
			help:  "Total publish requests rejected as invalid.",
			typ:   "counter",
			value: snap.PublishErrors,
		},
		{
			name:  "relay_subscribers",
			help:  "Current number of live SSE subscribers.",
			typ:   "gauge",
			value: snap.Subscribers,
		},
		{
			name:  "relay_uptime_seconds",
			help:  "Seconds elapsed since the relay started.",
			typ:   "gauge",
			value: snap.Uptime.Seconds(),
		},
	}
	for _, row := range rows {
		if err := writeRow(bw, row.name, row.help, row.typ, row.value); err != nil {
			return err
		}
	}
	return bw.Flush()
}

// Handler returns an http.Handler that exposes the registry in Prometheus text
// exposition format.
func (r *Registry) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if req.Method != http.MethodGet && req.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", ContentType)
		if err := r.Render(w); err != nil {
			http.Error(w, "failed to render metrics", http.StatusInternalServerError)
		}
	})
}

func writeRow(w io.Writer, name, help, typ string, value any) error {
	if _, err := fmt.Fprintf(w, "# HELP %s %s\n", name, help); err != nil {
		return err
	}
	if _, err := fmt.Fprintf(w, "# TYPE %s %s\n", name, typ); err != nil {
		return err
	}
	switch v := value.(type) {
	case uint64:
		_, err := fmt.Fprintf(w, "%s %d\n", name, v)
		return err
	case int64:
		_, err := fmt.Fprintf(w, "%s %d\n", name, v)
		return err
	case float64:
		_, err := fmt.Fprintf(w, "%s %.3f\n", name, v)
		return err
	default:
		return fmt.Errorf("metrics: unsupported value type %T for %s", value, name)
	}
}

package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/aniruddhaadak80/cogitatome/services/relay/internal/hub"
)

// routes mounts every endpoint and wraps the mux with CORS handling.
//
//	GET  /healthz        liveness
//	GET  /readyz         readiness (hub + broker wired)
//	GET  /v1/stream      SSE stream (?since=<seq>, Last-Event-ID)
//	POST /v1/publish     inject an event
//	GET  /v1/events      replay from the ring buffer (?since=&limit=)
//	GET  /v1/stats       subscriber and counter snapshot
//	GET  /metrics        Prometheus text exposition
func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.handleHealthz)
	mux.HandleFunc("GET /readyz", s.handleReadyz)
	mux.HandleFunc("GET /v1/stream", s.handleStream)
	mux.HandleFunc("POST /v1/publish", s.handlePublish)
	mux.HandleFunc("GET /v1/events", s.handleEvents)
	mux.HandleFunc("GET /v1/stats", s.handleStats)
	mux.Handle("GET /metrics", s.met.Handler())
	return s.cors(mux)
}

// cors adds permissive-by-default CORS so the browser dashboards in
// apps/cogitatome-web can consume the stream with plain EventSource.
func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if origin := s.allowedOrigin(r.Header.Get("Origin")); origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Add("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Accept, Last-Event-ID")
			w.Header().Set("Access-Control-Max-Age", "600")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) allowedOrigin(origin string) string {
	for _, allowed := range s.cfg.CORSOrigins {
		if allowed == "*" {
			return "*"
		}
		if origin != "" && allowed == origin {
			return origin
		}
	}
	return ""
}

// handleHealthz is the liveness probe: it always answers while the process is
// alive.
func (s *Server) handleHealthz(w http.ResponseWriter, r *http.Request) {
	_ = r // no request state needed; liveness is process-wide.
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok"})
}

// handleReadyz reports readiness: the hub and broker are wired and the server
// is not draining.
func (s *Server) handleReadyz(w http.ResponseWriter, r *http.Request) {
	_ = r
	if !s.ready.Load() || !s.broker.Ready() || s.hub.Closed() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"status": "unavailable",
			"reason": "relay is starting or draining",
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "ready"})
}

// handleStream serves Server-Sent Events. It first replays everything after
// the resume point, then streams live events. The response is flushed
// immediately so clients (and proxies) see an open stream at once.
//
// Resume semantics: ?since=<seq> takes precedence over the Last-Event-ID
// header; when neither is present the stream starts at the oldest retained
// event (seq 0 replays the whole ring).
func (s *Server) handleStream(w http.ResponseWriter, r *http.Request) {
	since, err := parseSince(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	// Subscribe before writing SSE headers so a closed hub can still answer
	// with a JSON error instead of a truncated stream.
	sub, err := s.hub.Subscribe()
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, err)
		return
	}
	defer s.hub.Unsubscribe(sub)

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, fmt.Errorf("httpapi: response writer does not support streaming"))
		return
	}

	done := s.trackStream()
	defer done()

	h := w.Header()
	h.Set("Content-Type", "text/event-stream; charset=utf-8")
	h.Set("Cache-Control", "no-cache, no-transform")
	h.Set("Connection", "keep-alive")
	h.Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	ctx := r.Context()
	lastSent := since

	// Backfill from the ring buffer. The subscription already exists, so the
	// boundary is gap-free: events published during replay are still buffered
	// for the live loop below.
	for _, e := range s.broker.Replay(since) {
		if e.Seq <= lastSent {
			continue
		}
		if err := writeEvent(w, e); err != nil {
			return
		}
		lastSent = e.Seq
	}
	flusher.Flush()

	for {
		select {
		case <-ctx.Done():
			// Client disconnected: nothing to flush.
			return
		case <-s.shutdownCh:
			// Drain started: end the stream so shutdown can complete.
			return
		case e, ok := <-sub.Events():
			if !ok {
				return
			}
			// Deduplicate the replay/live handoff overlap.
			if e.Seq <= lastSent {
				continue
			}
			if err := writeEvent(w, e); err != nil {
				return
			}
			flusher.Flush()
			lastSent = e.Seq
		case <-sub.Done():
			return
		}
	}
}

// publishRequest is the accepted POST /v1/publish body.
type publishRequest struct {
	Kind      string         `json:"kind"`
	ID        string         `json:"id"`
	SessionID string         `json:"session_id"`
	Payload   map[string]any `json:"payload"`
}

// handlePublish injects an event into the hub.
func (s *Server) handlePublish(w http.ResponseWriter, r *http.Request) {
	body := http.MaxBytesReader(w, r.Body, MaxPublishBytes)
	defer body.Close()

	var in publishRequest
	dec := json.NewDecoder(body)
	if err := dec.Decode(&in); err != nil {
		s.rejectPublish(w, fmt.Errorf("httpapi: decode request body: %w", err))
		return
	}
	if dec.More() {
		s.rejectPublish(w, fmt.Errorf("httpapi: request body must contain a single JSON object"))
		return
	}

	event := hub.Event{
		Kind:      strings.TrimSpace(in.Kind),
		ID:        strings.TrimSpace(in.ID),
		SessionID: strings.TrimSpace(in.SessionID),
		Payload:   in.Payload,
	}
	if event.Kind == "" {
		s.rejectPublish(w, fmt.Errorf("httpapi: kind is required"))
		return
	}
	if !hub.IsKnownKind(event.Kind) {
		s.rejectPublish(w, fmt.Errorf("httpapi: unknown kind %q, want one of %v", event.Kind, hub.Kinds()))
		return
	}
	if err := event.Validate(); err != nil {
		s.rejectPublish(w, err)
		return
	}

	stamped, err := s.hub.Publish(event)
	if err != nil {
		if errors.Is(err, hub.ErrHubClosed) {
			writeError(w, http.StatusServiceUnavailable, err)
			return
		}
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusAccepted, stamped)
}

func (s *Server) rejectPublish(w http.ResponseWriter, err error) {
	s.met.AddPublishErrors(1)
	writeError(w, http.StatusBadRequest, err)
}

// handleEvents replays retained events from the ring buffer as JSON.
// ?since=<seq> skips up to that sequence number and ?limit= bounds the
// response (default DefaultReplayLimit, capped at MaxReplayLimit). When more
// events are retained than the limit allows, the newest ones are kept.
func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request) {
	since, err := parseSince(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	limit, err := parseLimit(r.URL.Query().Get("limit"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	events := s.broker.Replay(since)
	if len(events) > limit {
		events = events[len(events)-limit:]
	}
	if events == nil {
		events = []hub.Event{}
	}
	s.met.AddReplayed(uint64(len(events)))

	writeJSON(w, http.StatusOK, map[string]any{
		"events": events,
		"since":  since,
		"limit":  limit,
		"count":  len(events),
		"broker": map[string]any{
			"capacity":   s.broker.Cap(),
			"len":        s.broker.Len(),
			"recorded":   s.broker.Total(),
			"last_seq":   s.broker.LastSeq(),
			"oldest_seq": s.broker.OldestSeq(),
		},
	})
}

// handleStats is a JSON mirror of the Prometheus counters plus broker state.
func (s *Server) handleStats(w http.ResponseWriter, r *http.Request) {
	_ = r
	snap := s.met.Snapshot()
	writeJSON(w, http.StatusOK, map[string]any{
		"subscribers":     s.hub.Count(),
		"published":       snap.Published,
		"delivered":       snap.Delivered,
		"dropped":         snap.Dropped,
		"replayed":        snap.Replayed,
		"publish_errors":  snap.PublishErrors,
		"uptime_seconds":  snap.Uptime.Seconds(),
		"last_seq":        s.hub.LastSeq(),
		"broker_capacity": s.broker.Cap(),
		"broker_len":      s.broker.Len(),
		"sim_seed":        s.sim.Seed(),
		"sim_steps":       s.sim.Steps(),
		"sim_session":     s.sim.SessionID(),
		"sim_interval_ms": s.cfg.SimInterval.Milliseconds(),
	})
}

// writeEvent renders one SSE frame: id, event and JSON data.
func writeEvent(w io.Writer, e hub.Event) error {
	data, err := json.Marshal(e)
	if err != nil {
		return fmt.Errorf("httpapi: encode event %d: %w", e.Seq, err)
	}
	var b strings.Builder
	fmt.Fprintf(&b, "id: %d\n", e.Seq)
	fmt.Fprintf(&b, "event: %s\n", e.Kind)
	b.WriteString("data: ")
	b.Write(data)
	b.WriteString("\n\n")
	if _, err := io.WriteString(w, b.String()); err != nil {
		return fmt.Errorf("httpapi: write event %d: %w", e.Seq, err)
	}
	return nil
}

// parseSince resolves the resume point from ?since= (preferred) or the
// standard Last-Event-ID header.
func parseSince(r *http.Request) (uint64, error) {
	raw := strings.TrimSpace(r.URL.Query().Get("since"))
	if raw == "" {
		raw = strings.TrimSpace(r.Header.Get("Last-Event-ID"))
	}
	if raw == "" {
		return 0, nil
	}
	n, err := strconv.ParseUint(raw, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("httpapi: invalid since value %q: want an unsigned integer", raw)
	}
	return n, nil
}

// parseLimit resolves and clamps ?limit=.
func parseLimit(raw string) (int, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return DefaultReplayLimit, nil
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 {
		return 0, fmt.Errorf("httpapi: invalid limit %q: want a positive integer", raw)
	}
	if n > MaxReplayLimit {
		n = MaxReplayLimit
	}
	return n, nil
}

// writeJSON writes v as JSON with the given status.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// writeError writes a JSON error envelope.
func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]any{"error": err.Error()})
}

package httpapi

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// testServer builds a simulator-free server: handlers still accept published
// events, but no background ticks interfere with sequence numbers.
func testServer(t *testing.T) *Server {
	t.Helper()
	cfg := DefaultConfig()
	cfg.DisableSimulator = true
	return New(cfg)
}

func TestHealthz(t *testing.T) {
	s := testServer(t)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	s.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("healthz status = %d, want 200", rec.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("healthz body is not JSON: %v", err)
	}
	if body["status"] != "ok" {
		t.Errorf("healthz status = %v, want ok", body["status"])
	}
}

func TestReadyz(t *testing.T) {
	s := testServer(t)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	s.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("readyz status = %d, want 200", rec.Code)
	}
}

func TestPublishAcceptsKnownKind(t *testing.T) {
	s := testServer(t)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(
		http.MethodPost, "/v1/publish",
		strings.NewReader(`{"kind":"custom","payload":{"tick":1}}`),
	)
	s.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusAccepted {
		t.Fatalf("publish status = %d, want 202 (body: %s)", rec.Code, rec.Body.String())
	}
	var stamped map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &stamped); err != nil {
		t.Fatalf("publish response is not JSON: %v", err)
	}
	if stamped["seq"] != float64(1) {
		t.Errorf("publish seq = %v, want 1", stamped["seq"])
	}
	if stamped["kind"] != "custom" {
		t.Errorf("publish kind = %v, want custom", stamped["kind"])
	}
}

func TestPublishRejects(t *testing.T) {
	s := testServer(t)
	cases := []struct {
		name string
		body string
	}{
		{"missing kind", `{}`},
		{"unknown kind", `{"kind":"telepathy"}`},
		{"not json", `this is not json`},
		{"empty body", ``},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, "/v1/publish", strings.NewReader(tc.body))
			s.Handler().ServeHTTP(rec, req)
			if rec.Code != http.StatusBadRequest {
				t.Errorf("publish %q status = %d, want 400", tc.name, rec.Code)
			}
		})
	}
}

func TestEventsReplay(t *testing.T) {
	s := testServer(t)
	for i := 0; i < 3; i++ {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(
			http.MethodPost, "/v1/publish",
			strings.NewReader(fmt.Sprintf(`{"kind":"custom","payload":{"i":%d}}`, i)),
		)
		s.Handler().ServeHTTP(rec, req)
		if rec.Code != http.StatusAccepted {
			t.Fatalf("publish #%d status = %d", i, rec.Code)
		}
	}

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/v1/events?since=1&limit=10", nil)
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("events status = %d, want 200", rec.Code)
	}
	var body struct {
		Events []map[string]any `json:"events"`
		Count  int              `json:"count"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("events body is not JSON: %v", err)
	}
	if body.Count != 2 || len(body.Events) != 2 {
		t.Fatalf("events count = %d, want 2 (since=1 skips seq 1)", body.Count)
	}
	if body.Events[0]["seq"] != float64(2) {
		t.Errorf("first replayed seq = %v, want 2", body.Events[0]["seq"])
	}
}

func TestEventsBadLimit(t *testing.T) {
	s := testServer(t)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/v1/events?limit=bogus", nil)
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("events bad limit status = %d, want 400", rec.Code)
	}
}

func TestStatsAndMetrics(t *testing.T) {
	s := testServer(t)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/v1/stats", nil)
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("stats status = %d, want 200", rec.Code)
	}
	var stats map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &stats); err != nil {
		t.Fatalf("stats body is not JSON: %v", err)
	}
	for _, key := range []string{"subscribers", "published", "last_seq", "broker_len"} {
		if _, ok := stats[key]; !ok {
			t.Errorf("stats missing key %q", key)
		}
	}

	mrec := httptest.NewRecorder()
	mreq := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	s.Handler().ServeHTTP(mrec, mreq)
	if mrec.Code != http.StatusOK {
		t.Fatalf("metrics status = %d, want 200", mrec.Code)
	}
	if ct := mrec.Header().Get("Content-Type"); !strings.Contains(ct, "text/plain") {
		t.Errorf("metrics content-type = %q, want Prometheus text", ct)
	}
}

// TestStreamReceivesPublishedEvent opens a real SSE stream against an
// httptest server, publishes one event, and asserts the frame arrives with the
// right id/event/data shape.
func TestStreamReceivesPublishedEvent(t *testing.T) {
	s := testServer(t)
	ts := httptest.NewServer(s.Handler())
	defer ts.Close()

	type frame struct {
		id    string
		event string
		data  map[string]any
	}
	frames := make(chan frame, 8)
	errs := make(chan error, 1)
	go func() {
		req, err := http.NewRequest(http.MethodGet, ts.URL+"/v1/stream", nil)
		if err != nil {
			errs <- err
			return
		}
		req.Header.Set("Accept", "text/event-stream")
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			errs <- err
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			errs <- fmt.Errorf("stream status = %d", resp.StatusCode)
			return
		}
		if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, "text/event-stream") {
			errs <- fmt.Errorf("stream content-type = %q", ct)
			return
		}
		reader := bufio.NewReader(resp.Body)
		var id, event string
		for {
			line, err := reader.ReadString('\n')
			if err != nil {
				if err == io.EOF {
					return
				}
				errs <- err
				return
			}
			line = strings.TrimRight(line, "\r\n")
			switch {
			case strings.HasPrefix(line, "id: "):
				id = strings.TrimPrefix(line, "id: ")
			case strings.HasPrefix(line, "event: "):
				event = strings.TrimPrefix(line, "event: ")
			case strings.HasPrefix(line, "data: "):
				var data map[string]any
				if err := json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &data); err != nil {
					errs <- err
					return
				}
				frames <- frame{id: id, event: event, data: data}
				return
			}
		}
	}()

	// Give the subscriber a moment to attach, then publish.
	time.Sleep(200 * time.Millisecond)
	pub, err := http.Post(ts.URL+"/v1/publish", "application/json", strings.NewReader(`{"kind":"custom","payload":{"hello":"stream"}}`))
	if err != nil {
		t.Fatalf("publish: %v", err)
	}
	pub.Body.Close()
	if pub.StatusCode != http.StatusAccepted {
		t.Fatalf("publish status = %d, want 202", pub.StatusCode)
	}

	select {
	case f := <-frames:
		if f.id != "1" {
			t.Errorf("frame id = %q, want 1", f.id)
		}
		if f.event != "custom" {
			t.Errorf("frame event = %q, want custom", f.event)
		}
		if f.data["seq"] != float64(1) {
			t.Errorf("frame data.seq = %v, want 1", f.data["seq"])
		}
	case err := <-errs:
		t.Fatalf("stream reader: %v", err)
	case <-time.After(10 * time.Second):
		t.Fatal("timed out waiting for the SSE frame")
	}
}

func TestStreamResumeSkipsOldEvents(t *testing.T) {
	s := testServer(t)
	ts := httptest.NewServer(s.Handler())
	defer ts.Close()

	for i := 0; i < 2; i++ {
		pub, err := http.Post(ts.URL+"/v1/publish", "application/json", strings.NewReader(`{"kind":"custom"}`))
		if err != nil {
			t.Fatalf("publish: %v", err)
		}
		pub.Body.Close()
	}

	req, _ := http.NewRequest(http.MethodGet, ts.URL+"/v1/stream?since=2", nil)
	req.Header.Set("Accept", "text/event-stream")
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("stream: %v", err)
	}
	defer resp.Body.Close()

	// Publish seq 3; the backfill must skip seqs 1-2, so the first frame is 3.
	time.Sleep(200 * time.Millisecond)
	pub, err := http.Post(ts.URL+"/v1/publish", "application/json", strings.NewReader(`{"kind":"custom"}`))
	if err != nil {
		t.Fatalf("publish: %v", err)
	}
	pub.Body.Close()

	reader := bufio.NewReader(resp.Body)
	deadline := time.Now().Add(8 * time.Second)
	_ = deadline
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			t.Fatalf("stream read: %v", err)
		}
		if strings.HasPrefix(line, "id: ") {
			id := strings.TrimSpace(strings.TrimPrefix(line, "id: "))
			if id != "3" {
				t.Fatalf("first resumed frame id = %q, want 3 (backfill must skip 1-2)", id)
			}
			return
		}
	}
}

func TestCORSPreflight(t *testing.T) {
	s := testServer(t)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodOptions, "/v1/events", nil)
	req.Header.Set("Origin", "https://example.com")
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Errorf("preflight status = %d, want 204", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Errorf("preflight allow-origin = %q, want *", got)
	}
}

func TestLoadConfig(t *testing.T) {
	env := map[string]string{
		"RELAY_ADDR":            "127.0.0.1:9000",
		"RELAY_BUFFER_SIZE":     "512",
		"RELAY_SIM_SEED":        "42",
		"RELAY_SIM_INTERVAL_MS": "100",
		"RELAY_CORS_ORIGINS":    "https://a.example, https://b.example",
	}
	cfg, problems := LoadConfig(func(k string) string { return env[k] })
	if len(problems) != 0 {
		t.Fatalf("problems = %v, want none", problems)
	}
	if cfg.Addr != "127.0.0.1:9000" || cfg.BufferSize != 512 || cfg.SimSeed != 42 {
		t.Errorf("config = %+v, want the env values", cfg)
	}
	if len(cfg.CORSOrigins) != 2 {
		t.Errorf("origins = %v, want 2 entries", cfg.CORSOrigins)
	}

	bad, problems := LoadConfig(func(k string) string {
		if k == "RELAY_BUFFER_SIZE" {
			return "bogus"
		}
		return ""
	})
	if len(problems) == 0 {
		t.Error("expected a problem for a bogus buffer size")
	}
	if bad.BufferSize != DefaultBufferSize {
		t.Errorf("buffer = %d, want default %d", bad.BufferSize, DefaultBufferSize)
	}
}

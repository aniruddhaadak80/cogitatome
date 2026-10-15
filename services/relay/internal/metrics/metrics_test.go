package metrics

import (
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestNewRegistryStartsAtZero(t *testing.T) {
	reg := New()
	snap := reg.Snapshot()
	if snap.Published != 0 || snap.Dropped != 0 || snap.Delivered != 0 || snap.Replayed != 0 {
		t.Fatalf("expected zero counters, got %+v", snap)
	}
	if snap.PublishErrors != 0 || snap.Subscribers != 0 {
		t.Fatalf("expected zero error/gauge counters, got %+v", snap)
	}
}

func TestCounterArithmetic(t *testing.T) {
	reg := New()
	tests := []struct {
		name  string
		apply func()
		check func(Snapshot)
	}{
		{"published", func() { reg.AddPublished(2) }, func(s Snapshot) {
			if s.Published != 2 {
				t.Errorf("Published = %d, want 2", s.Published)
			}
		}},
		{"published accumulates", func() { reg.AddPublished(3) }, func(s Snapshot) {
			if s.Published != 5 {
				t.Errorf("Published = %d, want 5", s.Published)
			}
		}},
		{"delivered", func() { reg.AddDelivered(4) }, func(s Snapshot) {
			if s.Delivered != 4 {
				t.Errorf("Delivered = %d, want 4", s.Delivered)
			}
		}},
		{"dropped", func() { reg.AddDropped(7) }, func(s Snapshot) {
			if s.Dropped != 7 {
				t.Errorf("Dropped = %d, want 7", s.Dropped)
			}
		}},
		{"dropped accumulates", func() { reg.AddDropped(1) }, func(s Snapshot) {
			if s.Dropped != 8 {
				t.Errorf("Dropped = %d, want 8", s.Dropped)
			}
		}},
		{"replayed", func() { reg.AddReplayed(9) }, func(s Snapshot) {
			if s.Replayed != 9 {
				t.Errorf("Replayed = %d, want 9", s.Replayed)
			}
		}},
		{"publish errors", func() { reg.AddPublishErrors(5) }, func(s Snapshot) {
			if s.PublishErrors != 5 {
				t.Errorf("PublishErrors = %d, want 5", s.PublishErrors)
			}
		}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tc.apply()
			tc.check(reg.Snapshot())
		})
	}
}

func TestSubscriberGaugeOverwrite(t *testing.T) {
	reg := New()
	reg.SetSubscribers(3)
	if got := reg.Snapshot().Subscribers; got != 3 {
		t.Fatalf("Subscribers = %d, want 3", got)
	}
	reg.SetSubscribers(0)
	if got := reg.Snapshot().Subscribers; got != 0 {
		t.Fatalf("Subscribers = %d, want 0", got)
	}
}

func TestSnapshotIsDetachedFromRegistry(t *testing.T) {
	reg := New()
	reg.AddPublished(5)
	before := reg.Snapshot()
	reg.AddPublished(100)
	if before.Published != 5 {
		t.Fatalf("snapshot mutated after further increments: %d", before.Published)
	}
	if reg.Snapshot().Published != 105 {
		t.Fatalf("registry lost increments, want 105, got %d", reg.Snapshot().Published)
	}
}

func TestUptimeAdvances(t *testing.T) {
	reg := New()
	time.Sleep(15 * time.Millisecond)
	if got := reg.Uptime(); got <= 0 {
		t.Fatalf("Uptime = %v, want > 0", got)
	}
}

func TestZeroValueRegistryUptimeIsZero(t *testing.T) {
	var reg Registry
	if got := reg.Uptime(); got != 0 {
		t.Fatalf("zero-value Uptime = %v, want 0", got)
	}
	if got := reg.Snapshot().Uptime; got != 0 {
		t.Fatalf("zero-value snapshot uptime = %v, want 0", got)
	}
}

func TestRenderExpositionFormat(t *testing.T) {
	reg := New()
	reg.AddPublished(2)
	reg.AddDropped(1)
	reg.SetSubscribers(3)

	var b strings.Builder
	if err := reg.Render(&b); err != nil {
		t.Fatalf("Render: %v", err)
	}
	out := b.String()

	for _, want := range []string{
		"# HELP relay_events_published_total ",
		"# TYPE relay_events_published_total counter\n",
		"relay_events_published_total 2\n",
		"# TYPE relay_events_dropped_total counter\n",
		"relay_events_dropped_total 1\n",
		"# TYPE relay_events_replayed_total counter\n",
		"relay_events_replayed_total 0\n",
		"# HELP relay_subscribers Current number of live SSE subscribers.\n",
		"# TYPE relay_subscribers gauge\n",
		"relay_subscribers 3\n",
		"# TYPE relay_uptime_seconds gauge\n",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("exposition missing %q\nfull output:\n%s", want, out)
		}
	}

	uptime := regexp.MustCompile(`(?m)^relay_uptime_seconds \d+\.\d{3}$`)
	if !uptime.MatchString(out) {
		t.Errorf("uptime line not in NNN.NNN format:\n%s", out)
	}
}

func TestRenderCountsLinesPerSeries(t *testing.T) {
	reg := New()
	var b strings.Builder
	if err := reg.Render(&b); err != nil {
		t.Fatalf("Render: %v", err)
	}
	// HELP, TYPE and sample lines must be balanced per series name.
	names := map[string]int{}
	for _, line := range strings.Split(b.String(), "\n") {
		for prefix, field := range map[string]int{"# HELP ": 0, "# TYPE ": 1} {
			if strings.HasPrefix(line, prefix) {
				parts := strings.Fields(line)
				if len(parts) > 3 {
					if names[parts[2]] == field {
						names[parts[2]] = field + 1
					}
				}
			}
		}
	}
	for name, got := range names {
		if got != 2 {
			t.Errorf("series %s seen %d times, want HELP+TYPE once each", name, got)
		}
	}
	if len(names) != 7 {
		t.Errorf("rendered %d series, want 7", len(names))
	}
}

func TestHandlerServesExposition(t *testing.T) {
	reg := New()
	reg.AddPublished(11)
	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	rec := httptest.NewRecorder()
	reg.Handler().ServeHTTP(rec, req)

	if rec.Code != 200 {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got := rec.Header().Get("Content-Type"); got != ContentType {
		t.Fatalf("Content-Type = %q, want %q", got, ContentType)
	}
	if !strings.Contains(rec.Body.String(), "relay_events_published_total 11\n") {
		t.Errorf("body missing counter line:\n%s", rec.Body.String())
	}
}

func TestHandlerRejectsUnsupportedMethods(t *testing.T) {
	reg := New()
	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodDelete} {
		req := httptest.NewRequest(method, "/metrics", nil)
		rec := httptest.NewRecorder()
		reg.Handler().ServeHTTP(rec, req)
		if rec.Code != http.StatusMethodNotAllowed {
			t.Errorf("%s: status = %d, want %d", method, rec.Code, http.StatusMethodNotAllowed)
		}
	}
}

func TestConcurrentRegistryUpdates(t *testing.T) {
	reg := New()
	var wg sync.WaitGroup
	const workers = 8
	const per = 250

	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func(w int) {
			defer wg.Done()
			for i := 0; i < per; i++ {
				reg.AddPublished(1)
				reg.AddDropped(2)
				reg.SetSubscribers(int64(i))
			}
		}(w)
	}
	wg.Wait()

	snap := reg.Snapshot()
	if snap.Published != workers*per {
		t.Errorf("Published = %d, want %d", snap.Published, workers*per)
	}
	if snap.Dropped != workers*per*2 {
		t.Errorf("Dropped = %d, want %d", snap.Dropped, workers*per*2)
	}
	if snap.Subscribers != per-1 {
		t.Errorf("Subscribers = %d, want %d", snap.Subscribers, per-1)
	}
}

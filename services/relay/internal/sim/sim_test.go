package sim

import (
	"encoding/json"
	"math"
	"reflect"
	"sort"
	"sync"
	"testing"
	"time"

	"github.com/aniruddhaadak80/cogitatome/services/relay/internal/hub"
)

func TestTimelineDeterministicForSameSeed(t *testing.T) {
	a := Timeline(7, 200)
	b := Timeline(7, 200)
	if !reflect.DeepEqual(a, b) {
		t.Fatal("Timeline(7, 200) is not reproducible across calls")
	}
	// The full JSON encoding must be byte-identical too.
	ja, err := json.Marshal(a)
	if err != nil {
		t.Fatalf("marshal a: %v", err)
	}
	jb, err := json.Marshal(b)
	if err != nil {
		t.Fatalf("marshal b: %v", err)
	}
	if string(ja) != string(jb) {
		t.Fatal("Timeline JSON is not reproducible")
	}
}

func TestTimelineDivergesForDifferentSeeds(t *testing.T) {
	a := Timeline(7, 40)
	b := Timeline(8, 40)
	if reflect.DeepEqual(a, b) {
		t.Fatal("Timeline(7, 40) equals Timeline(8, 40): seeds must diverge")
	}
	if a[0].ID == b[0].ID {
		t.Errorf("seeds share an event id: %q", a[0].ID)
	}
	if reflect.DeepEqual(a[0].Payload, b[0].Payload) {
		t.Error("seeds share the same first payload")
	}
}

func TestTimelineLengthTable(t *testing.T) {
	tests := []struct {
		name string
		n    int
		want int
	}{
		{"negative", -3, 0},
		{"zero", 0, 0},
		{"one", 1, 1},
		{"many", 25, 25},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := len(Timeline(7, tc.n)); got != tc.want {
				t.Fatalf("len(Timeline(7, %d)) = %d, want %d", tc.n, got, tc.want)
			}
		})
	}
}

func TestStepMatchesTimeline(t *testing.T) {
	const n = 120
	s := New(7)
	got := make([]hub.Event, 0, n)
	for i := 0; i < n; i++ {
		got = append(got, s.Step())
	}
	want := Timeline(7, n)
	if !reflect.DeepEqual(got, want) {
		t.Fatal("Step() stream diverged from Timeline(seed, n)")
	}
}

func TestStepsAreSequential(t *testing.T) {
	s := New(7)
	if s.Steps() != 0 {
		t.Fatalf("fresh Steps() = %d, want 0", s.Steps())
	}
	for i := 1; i <= 30; i++ {
		e := s.Step()
		if e.Seq != uint64(i) {
			t.Fatalf("event #%d has seq %d", i, e.Seq)
		}
	}
	if s.Steps() != 30 {
		t.Errorf("Steps() = %d, want 30", s.Steps())
	}
	if s.Seed() != 7 {
		t.Errorf("Seed() = %d, want 7", s.Seed())
	}
	if s.SessionID() == "" {
		t.Error("SessionID() is empty")
	}
}

func TestKindRotation(t *testing.T) {
	events := Timeline(7, 10)
	want := []string{
		hub.KindResidualStreamUpdate,
		hub.KindAttentionEntropy,
		hub.KindFeatureActivated,
		hub.KindProbeScore,
		hub.KindScenarioTick,
	}
	for i, e := range events {
		if want := want[i%len(want)]; e.Kind != want {
			t.Fatalf("event %d kind = %q, want %q", i, e.Kind, want)
		}
		if !hub.IsKnownKind(e.Kind) {
			t.Errorf("event %d emitted unknown kind %q", i, e.Kind)
		}
	}
}

func TestEventIDsAreUnique(t *testing.T) {
	const n = 5000
	seen := make(map[string]uint64, n)
	for i, e := range Timeline(7, n) {
		if prev, dup := seen[e.ID]; dup {
			t.Fatalf("duplicate id %q at events %d and %d", e.ID, prev, i)
		}
		seen[e.ID] = uint64(i)
	}
	if len(seen) != n {
		t.Fatalf("saw %d unique ids, want %d", len(seen), n)
	}
}

func TestTimestampsAreSyntheticAndOrdered(t *testing.T) {
	events := Timeline(7, 12)
	want := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	for i, e := range events {
		expected := want.Add(time.Duration(i) * 100 * time.Millisecond)
		if !e.Timestamp.Equal(expected) {
			t.Fatalf("event %d timestamp = %v, want %v", i, e.Timestamp, expected)
		}
	}
}

func TestResetReplaysTheSeedExactly(t *testing.T) {
	s := New(7)
	for i := 0; i < 10; i++ {
		s.Step()
	}
	s.Reset()
	if s.Steps() != 0 {
		t.Fatalf("Steps() after Reset = %d, want 0", s.Steps())
	}
	got := make([]hub.Event, 0, 10)
	for i := 0; i < 10; i++ {
		got = append(got, s.Step())
	}
	if !reflect.DeepEqual(got, Timeline(7, 10)) {
		t.Fatal("Reset did not restore the seeded sequence")
	}
}

func TestNegativeSeedIsDeterministic(t *testing.T) {
	if a, b := Timeline(-1, 30), Timeline(-1, 30); !reflect.DeepEqual(a, b) {
		t.Fatal("negative seed timeline is not reproducible")
	}
	if a, b := Timeline(-1, 30), Timeline(7, 30); reflect.DeepEqual(a, b) {
		t.Fatal("negative seed matches positive seed")
	}
}

func TestConcurrentStepIsSafeAndExhaustive(t *testing.T) {
	s := New(7)
	const workers = 4
	const per = 250

	var mu sync.Mutex
	seen := make(map[uint64]bool, workers*per)
	received := make([]hub.Event, 0, workers*per)

	var wg sync.WaitGroup
	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < per; i++ {
				e := s.Step()
				mu.Lock()
				if seen[e.Seq] {
					t.Errorf("duplicate seq %d handed out", e.Seq)
				}
				seen[e.Seq] = true
				received = append(received, e)
				mu.Unlock()
			}
		}()
	}
	wg.Wait()

	if len(seen) != workers*per {
		t.Fatalf("got %d unique seqs, want %d", len(seen), workers*per)
	}
	// Reassembled by sequence number, the concurrent stream must equal the
	// deterministic timeline exactly.
	sort.Slice(received, func(i, j int) bool { return received[i].Seq < received[j].Seq })
	if !reflect.DeepEqual(received, Timeline(7, workers*per)) {
		t.Fatal("concurrent steps did not partition the deterministic timeline")
	}
}

func TestPayloadsRoundTripThroughJSON(t *testing.T) {
	for i, e := range Timeline(7, 25) {
		blob, err := json.Marshal(e)
		if err != nil {
			t.Fatalf("marshal event %d: %v", i, err)
		}
		var back hub.Event
		if err := json.Unmarshal(blob, &back); err != nil {
			t.Fatalf("unmarshal event %d: %v", i, err)
		}
		again, err := json.Marshal(back)
		if err != nil {
			t.Fatalf("re-marshal event %d: %v", i, err)
		}
		if string(blob) != string(again) {
			t.Fatalf("event %d is not JSON-stable:\n%s\n%s", i, blob, again)
		}
	}
}

func floatPayload(t *testing.T, p map[string]any, key string) float64 {
	t.Helper()
	v, ok := p[key]
	if !ok {
		t.Fatalf("payload missing key %q", key)
	}
	f, ok := v.(float64)
	if !ok {
		t.Fatalf("payload %q = %T, want float64", key, v)
	}
	return f
}

func intPayload(t *testing.T, p map[string]any, key string) int {
	t.Helper()
	v, ok := p[key]
	if !ok {
		t.Fatalf("payload missing key %q", key)
	}
	switch n := v.(type) {
	case int:
		return n
	case int64:
		return int(n)
	case float64: // payloads that came back through JSON
		return int(n)
	default:
		t.Fatalf("payload %q = %T, want a number", key, v)
		return 0
	}
}

func TestPayloadShapePerKind(t *testing.T) {
	timeline := Timeline(7, 50)

	t.Run(hub.KindResidualStreamUpdate, func(t *testing.T) {
		for _, e := range timeline {
			if e.Kind != hub.KindResidualStreamUpdate {
				continue
			}
			for _, key := range []string{"layer", "token_index", "residual_norm", "delta_norm", "vector", "model"} {
				if _, ok := e.Payload[key]; !ok {
					t.Fatalf("missing key %q", key)
				}
			}
			layer := intPayload(t, e.Payload, "layer")
			if layer < 0 || layer > 11 {
				t.Errorf("layer %d outside [0,11]", layer)
			}
			norm := floatPayload(t, e.Payload, "residual_norm")
			if norm < 0.5 || norm > 9.0 {
				t.Errorf("residual_norm %v outside [0.5,9.0]", norm)
			}
			vec, ok := e.Payload["vector"].([]any)
			if !ok || len(vec) != 4 {
				t.Fatalf("vector = %v, want 4 elements", e.Payload["vector"])
			}
		}
	})

	t.Run(hub.KindAttentionEntropy, func(t *testing.T) {
		for _, e := range timeline {
			if e.Kind != hub.KindAttentionEntropy {
				continue
			}
			seqLen := intPayload(t, e.Payload, "seq_len")
			if seqLen < 8 || seqLen > 128 {
				t.Errorf("seq_len %d outside [8,128]", seqLen)
			}
			entropy := floatPayload(t, e.Payload, "entropy")
			maxEntropy := floatPayload(t, e.Payload, "max_entropy")
			if entropy < 0 || entropy > maxEntropy {
				t.Errorf("entropy %v outside [0,%v]", entropy, maxEntropy)
			}
			if math.Abs(maxEntropy-math.Log(float64(seqLen))) > 1e-4 {
				t.Errorf("max_entropy %v != ln(seq_len) %v", maxEntropy, math.Log(float64(seqLen)))
			}
			head := intPayload(t, e.Payload, "head")
			if head < 0 || head > 7 {
				t.Errorf("head %d outside [0,7]", head)
			}
			norm := floatPayload(t, e.Payload, "normalized_entropy")
			if norm < 0 || norm > 1 {
				t.Errorf("normalized_entropy %v outside [0,1]", norm)
			}
		}
	})

	t.Run(hub.KindFeatureActivated, func(t *testing.T) {
		for _, e := range timeline {
			if e.Kind != hub.KindFeatureActivated {
				continue
			}
			fid := intPayload(t, e.Payload, "feature_id")
			if fid < 0 || fid > 16383 {
				t.Errorf("feature_id %d outside [0,16383]", fid)
			}
			act := floatPayload(t, e.Payload, "activation")
			if act < 0 || act > 12 {
				t.Errorf("activation %v outside [0,12]", act)
			}
			if _, ok := e.Payload["sae"].(string); !ok {
				t.Error("sae should be a string")
			}
		}
	})

	t.Run(hub.KindProbeScore, func(t *testing.T) {
		for _, e := range timeline {
			if e.Kind != hub.KindProbeScore {
				continue
			}
			name, ok := e.Payload["probe"].(string)
			if !ok || name == "" {
				t.Errorf("probe = %v, want non-empty string", e.Payload["probe"])
			}
			score := floatPayload(t, e.Payload, "score")
			if score < 0 || score > 1 {
				t.Errorf("score %v outside [0,1]", score)
			}
			acc := floatPayload(t, e.Payload, "accuracy")
			if acc < 0.5 || acc > 0.99 {
				t.Errorf("accuracy %v outside [0.5,0.99]", acc)
			}
		}
	})

	t.Run(hub.KindScenarioTick, func(t *testing.T) {
		step := -1
		for _, e := range timeline {
			if e.Kind != hub.KindScenarioTick {
				continue
			}
			step++
			tick := intPayload(t, e.Payload, "tick")
			if tick != step*5+4 {
				t.Errorf("tick = %d, want %d", tick, step*5+4)
			}
			reward := floatPayload(t, e.Payload, "reward")
			if reward < -1 || reward > 1 {
				t.Errorf("reward %v outside [-1,1]", reward)
			}
			for _, key := range []string{"lever_pulled", "flag_raised"} {
				if _, ok := e.Payload[key].(bool); !ok {
					t.Errorf("%s = %v, want bool", key, e.Payload[key])
				}
			}
			level := intPayload(t, e.Payload, "oversight_level")
			if level < 0 || level > 3 {
				t.Errorf("oversight_level %d outside [0,3]", level)
			}
		}
	})
}

func TestSessionIDStablePerSeed(t *testing.T) {
	a := New(7)
	b := New(7)
	c := New(9)
	if a.SessionID() != b.SessionID() {
		t.Errorf("same seed gave different sessions: %q vs %q", a.SessionID(), b.SessionID())
	}
	if a.SessionID() == c.SessionID() {
		t.Errorf("different seeds shared session %q", a.SessionID())
	}
	events := Timeline(7, 10)
	for i, e := range events {
		if e.SessionID != a.SessionID() {
			t.Fatalf("event %d session = %q, want %q", i, e.SessionID, a.SessionID())
		}
	}
}

func TestScenarioNameIsStable(t *testing.T) {
	for _, e := range Timeline(7, 10) {
		if e.Kind != hub.KindScenarioTick {
			continue
		}
		name, ok := e.Payload["scenario"].(string)
		if !ok || name == "" {
			t.Fatalf("scenario = %v, want non-empty string", e.Payload["scenario"])
		}
	}
}

// Package sim is a deterministic interpretability-run simulator for the
// cogitatome relay.
//
// A Sim emits the same events for the same seed, forever: sequence numbers,
// identifiers, payload values and timestamps are all derived from the seed via
// a PCG random source and a synthetic clock. There is no network, no wall
// clock and no global state, so test suites and dashboards can reproduce a run
// exactly. The simulator mirrors the telemetry vocabulary of the cogitatome
// interpreter residual streams, attention entropy, sparse-autoencoder feature
// activations, linear probe scores and alignment-sandbox scenario ticks.
package sim

import (
	"encoding/binary"
	"fmt"
	"hash/fnv"
	"math"
	"math/rand/v2"
	"sync"
	"time"

	"github.com/aniruddhaadak80/cogitatome/services/relay/internal/hub"
)

// DefaultSeed is the seed used when none is configured.
const DefaultSeed int64 = 7

// syntheticEpoch anchors the deterministic simulator clock. Events are stamped
// at epoch + step * tickInterval, which keeps whole timelines byte-identical
// across runs and machines.
var syntheticEpoch = time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)

const (
	tickInterval = 100 * time.Millisecond
	pcgSalt      = uint64(0x9e3779b97f4a7c15)
)

// kindOrder is the rotation every simulated run follows.
var kindOrder = []string{
	hub.KindResidualStreamUpdate,
	hub.KindAttentionEntropy,
	hub.KindFeatureActivated,
	hub.KindProbeScore,
	hub.KindScenarioTick,
}

var (
	probeNames = []string{"deception", "intent", "uncertainty", "harm-awareness", "corrigibility"}
	agentActs  = []string{"observe", "plan", "query_oversight", "act", "reflect"}
)

// Sim is a single deterministic simulation run. A Sim is safe for concurrent
// use: Step locks the run, so concurrent callers receive a partition of the
// same deterministic sequence.
type Sim struct {
	seed      int64
	sessionID string
	scenario  string

	mu   sync.Mutex
	rng  *rand.Rand
	step uint64
}

// New returns a simulator seeded with seed.
func New(seed int64) *Sim {
	return &Sim{
		seed:      seed,
		sessionID: sessionFor(seed),
		scenario:  scenarioFor(seed),
		rng:       rand.New(rand.NewPCG(uint64(seed), pcgSalt)),
	}
}

// Seed returns the configured seed.
func (s *Sim) Seed() int64 { return s.seed }

// SessionID returns the deterministic session identifier for this run.
func (s *Sim) SessionID() string { return s.sessionID }

// Steps returns how many events this simulator has emitted so far.
func (s *Sim) Steps() uint64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.step
}

// Reset rewinds the simulator to its first step, restoring the seed's exact
// sequence: the next Steps() emissions equal Timeline(seed, n).
func (s *Sim) Reset() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.rng = rand.New(rand.NewPCG(uint64(s.seed), pcgSalt))
	s.step = 0
}

// Step advances the simulation by one event and returns it. Simulator events
// carry a synthetic deterministic timestamp; the hub re-sequences them for the
// live stream.
func (s *Sim) Step() hub.Event {
	s.mu.Lock()
	defer s.mu.Unlock()

	step := s.step
	s.step++

	seq := step + 1
	kind := kindOrder[step%uint64(len(kindOrder))]

	return hub.Event{
		Seq:       seq,
		ID:        eventID(uint64(s.seed), seq),
		Kind:      kind,
		Payload:   s.payload(kind, step),
		Timestamp: syntheticClock(step),
		SessionID: s.sessionID,
	}
}

// Timeline returns the first n events of a fresh run with the given seed. It is
// reproducible: Timeline(seed, n) returns an identical slice on every call and
// every machine.
func Timeline(seed int64, n int) []hub.Event {
	if n <= 0 {
		return []hub.Event{}
	}
	s := New(seed)
	out := make([]hub.Event, 0, n)
	for i := 0; i < n; i++ {
		out = append(out, s.Step())
	}
	return out
}

// payload builds the kind-specific telemetry. Every value comes from the
// seeded PCG source, so the map is a pure function of (seed, kind, step).
func (s *Sim) payload(kind string, step uint64) map[string]any {
	switch kind {
	case hub.KindResidualStreamUpdate:
		return map[string]any{
			"layer":         s.intBetween(0, 11),
			"token_index":   s.intBetween(0, 127),
			"residual_norm": s.round(s.floatBetween(0.5, 9.0)),
			"delta_norm":    s.round(s.floatBetween(0.01, 1.5)),
			"vector":        s.vector(4, -1, 1),
			"model":         "cogitatome-nano-transformer",
			"vocab_dims":    256,
		}
	case hub.KindAttentionEntropy:
		seqLen := s.intBetween(8, 128)
		maxEntropy := math.Log(float64(seqLen))
		return map[string]any{
			"layer":                s.intBetween(0, 11),
			"head":                 s.intBetween(0, 7),
			"seq_len":              seqLen,
			"entropy":              s.round(s.floatBetween(0, maxEntropy)),
			"max_entropy":          s.round(maxEntropy),
			"normalized_entropy":   s.round(s.floatBetween(0, 1)),
			"uniform_distribution": s.bool(),
		}
	case hub.KindFeatureActivated:
		return map[string]any{
			"feature_id":   s.intBetween(0, 16383),
			"layer":        s.intBetween(0, 11),
			"activation":   s.round(s.floatBetween(0, 12)),
			"sae":          "residual-jl-16k",
			"logit_delta":  s.round(s.floatBetween(-4, 4)),
			"top_tokens":   s.vector(3, 0.001, 0.9),
			"dead_feature": s.bool(),
		}
	case hub.KindProbeScore:
		return map[string]any{
			"probe":       probeNames[s.intBetween(0, len(probeNames)-1)],
			"layer":       s.intBetween(0, 11),
			"score":       s.round(s.floatBetween(0, 1)),
			"accuracy":    s.round(s.floatBetween(0.5, 0.99)),
			"calibration": s.round(s.floatBetween(0, 1)),
			"train_steps": s.intBetween(1000, 50000),
		}
	case hub.KindScenarioTick:
		return map[string]any{
			"scenario":        s.scenario,
			"tick":            int(step),
			"reward":          s.round(s.floatBetween(-1, 1)),
			"lever_pulled":    s.bool(),
			"oversight_level": s.intBetween(0, 3),
			"agent_action":    agentActs[s.intBetween(0, len(agentActs)-1)],
			"flag_raised":     s.bool(),
		}
	default:
		return map[string]any{"step": int(step)}
	}
}

// intBetween returns a deterministic integer in [min, max].
func (s *Sim) intBetween(min, max int) int {
	if max <= min {
		return min
	}
	return min + s.rng.IntN(max-min+1)
}

// floatBetween returns a deterministic float in [lo, hi].
func (s *Sim) floatBetween(lo, hi float64) float64 {
	return lo + s.rng.Float64()*(hi-lo)
}

// bool returns a deterministic boolean.
func (s *Sim) bool() bool {
	return s.rng.Uint64()&1 == 1
}

// vector returns a deterministic slice of n rounded floats in [lo, hi].
func (s *Sim) vector(n int, lo, hi float64) []any {
	out := make([]any, 0, n)
	for i := 0; i < n; i++ {
		out = append(out, s.round(s.floatBetween(lo, hi)))
	}
	return out
}

// round snaps a float to four decimals so JSON output is stable.
func (s *Sim) round(v float64) float64 {
	return math.Round(v*1e4) / 1e4
}

// syntheticClock is the deterministic simulator clock.
func syntheticClock(step uint64) time.Time {
	return syntheticEpoch.Add(time.Duration(step) * tickInterval)
}

// eventID derives a stable identifier from the seed and sequence number.
func eventID(seed, seq uint64) string {
	var b [16]byte
	binary.BigEndian.PutUint64(b[0:8], seed)
	binary.BigEndian.PutUint64(b[8:16], seq)
	h := fnv.New64a()
	_, _ = h.Write(b[:])
	return fmt.Sprintf("evt-%016x", h.Sum64())
}

// sessionFor derives a stable session id from the seed.
func sessionFor(seed int64) string {
	return fmt.Sprintf("sim-%08x", uint64(seed))
}

// scenarioFor derives a stable sandbox scenario name from the seed.
func scenarioFor(seed int64) string {
	idx := uint64(seed) % 5
	return fmt.Sprintf("alignment-sandbox-%02d", idx)
}

// Package hub is the fan-out broadcast core of the cogitatome telemetry relay.
//
// Subscribers register, events are published exactly once to every registered
// subscriber, and backpressure is resolved with a drop-oldest policy on a
// bounded per-subscriber channel. A hub is safe for concurrent use.
package hub

import (
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

// Well-known event kinds. The five simulator kinds mirror the interpretability
// vocabulary of the cogitatome app; "custom" lets dashboards and agents inject
// their own telemetry through POST /v1/publish.
const (
	KindResidualStreamUpdate = "residual_stream_update"
	KindAttentionEntropy     = "attention_entropy"
	KindFeatureActivated     = "feature_activated"
	KindProbeScore           = "probe_score"
	KindScenarioTick         = "scenario_tick"
	KindCustom               = "custom"
)

// Limits enforced by Event.Validate.
const (
	MaxKindLength      = 64
	MaxIDLength        = 128
	MaxSessionIDLength = 128
	MaxPayloadKeys     = 64
	MaxPayloadKeyLen   = 128
	MaxPayloadBytes    = 64 << 10 // 64 KiB of JSON per payload.
)

// ErrInvalidEvent marks events rejected by Event.Validate.
var ErrInvalidEvent = errors.New("hub: invalid event")

// Event is the single unit of telemetry broadcast by the relay. It is the
// wire format for both the JSON replay endpoints and the `data:` frames of the
// SSE stream.
type Event struct {
	// Seq is the monotonic sequence number assigned by the hub on publish.
	Seq uint64 `json:"seq"`
	// ID is a unique identifier. Simulator events derive it deterministically
	// from the seed; injected events fall back to a hub-generated id.
	ID string `json:"id"`
	// Kind is one of the well-known event kinds (see Kinds).
	Kind string `json:"kind"`
	// Payload carries the kind-specific telemetry as JSON-compatible values.
	Payload map[string]any `json:"payload,omitempty"`
	// Timestamp is the event time. Simulator events use a deterministic
	// synthetic clock; injected events are stamped with wall-clock UTC time.
	Timestamp time.Time `json:"timestamp"`
	// SessionID ties an event to a simulation run or browser session.
	SessionID string `json:"session_id,omitempty"`
}

// Kinds returns the well-known event kinds in a stable order.
func Kinds() []string {
	return []string{
		KindResidualStreamUpdate,
		KindAttentionEntropy,
		KindFeatureActivated,
		KindProbeScore,
		KindScenarioTick,
		KindCustom,
	}
}

// IsKnownKind reports whether kind is a well-known event kind.
func IsKnownKind(kind string) bool {
	switch kind {
	case KindResidualStreamUpdate,
		KindAttentionEntropy,
		KindFeatureActivated,
		KindProbeScore,
		KindScenarioTick,
		KindCustom:
		return true
	default:
		return false
	}
}

// Validate checks the structural invariants every published event must hold.
// It is called by the hub before an event is sequenced and broadcast.
func (e Event) Validate() error {
	if e.Kind == "" {
		return fmt.Errorf("%w: kind is required", ErrInvalidEvent)
	}
	if len(e.Kind) > MaxKindLength {
		return fmt.Errorf("%w: kind exceeds %d bytes", ErrInvalidEvent, MaxKindLength)
	}
	if len(e.ID) > MaxIDLength {
		return fmt.Errorf("%w: id exceeds %d bytes", ErrInvalidEvent, MaxIDLength)
	}
	if len(e.SessionID) > MaxSessionIDLength {
		return fmt.Errorf("%w: session_id exceeds %d bytes", ErrInvalidEvent, MaxSessionIDLength)
	}
	if len(e.Payload) > MaxPayloadKeys {
		return fmt.Errorf("%w: payload has more than %d keys", ErrInvalidEvent, MaxPayloadKeys)
	}
	for key := range e.Payload {
		if len(key) > MaxPayloadKeyLen {
			return fmt.Errorf("%w: payload key %q exceeds %d bytes", ErrInvalidEvent, key, MaxPayloadKeyLen)
		}
	}
	if len(e.Payload) > 0 {
		blob, err := json.Marshal(e.Payload)
		if err != nil {
			return fmt.Errorf("%w: payload is not JSON-serialisable: %v", ErrInvalidEvent, err)
		}
		if len(blob) > MaxPayloadBytes {
			return fmt.Errorf("%w: payload exceeds %d bytes", ErrInvalidEvent, MaxPayloadBytes)
		}
	}
	return nil
}

// Clone returns a deep copy of the event, so a caller may mutate the payload
// without corrupting what subscribers and the ring buffer hold.
func (e Event) Clone() Event {
	out := e
	if e.Payload != nil {
		out.Payload = make(map[string]any, len(e.Payload))
		for k, v := range e.Payload {
			out.Payload[k] = cloneValue(v)
		}
	}
	return out
}

func cloneValue(v any) any {
	switch typed := v.(type) {
	case map[string]any:
		out := make(map[string]any, len(typed))
		for k, val := range typed {
			out[k] = cloneValue(val)
		}
		return out
	case []any:
		out := make([]any, len(typed))
		for i, val := range typed {
			out[i] = cloneValue(val)
		}
		return out
	default:
		return v
	}
}

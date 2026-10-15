// Package broker keeps a bounded ring buffer of the most recently published
// events so reconnecting subscribers can replay what they missed.
//
// Events are stored in sequence order; the buffer keeps the last N events by
// sequence number, evicting the oldest when full. Replay(afterSeq) returns the
// retained events whose sequence number is greater than afterSeq, oldest
// first. The package is safe for concurrent use.
package broker

import (
	"sync"

	"github.com/aniruddhaadak80/cogitatome/services/relay/internal/hub"
)

// DefaultCapacity is the ring-buffer capacity used when a non-positive
// capacity is requested.
const DefaultCapacity = 4096

// Broker is a bounded event buffer keyed by sequence number.
type Broker struct {
	mu      sync.RWMutex
	buf     []hub.Event
	next    int // write index
	size    int // number of valid entries
	lastSeq uint64
	total   uint64 // events ever recorded
}

// New returns a ring buffer with room for capacity events. Non-positive
// capacities fall back to DefaultCapacity.
func New(capacity int) *Broker {
	if capacity <= 0 {
		capacity = DefaultCapacity
	}
	return &Broker{buf: make([]hub.Event, capacity)}
}

// Record appends e to the ring, evicting the oldest event when full. It
// implements hub.Sink; sequence numbers are expected to arrive in increasing
// order (the hub guarantees this). A zero-value ring discards everything.
func (r *Broker) Record(e hub.Event) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.buf) == 0 {
		return
	}
	r.buf[r.next] = e
	r.next = (r.next + 1) % len(r.buf)
	if r.size < len(r.buf) {
		r.size++
	}
	r.lastSeq = e.Seq
	r.total++
}

// Replay returns the retained events with Seq > afterSeq, oldest first. The
// result is a fresh slice: mutating it does not affect the ring.
func (r *Broker) Replay(afterSeq uint64) []hub.Event {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if r.size == 0 || len(r.buf) == 0 {
		return []hub.Event{}
	}
	out := make([]hub.Event, 0, r.size)
	start := (r.next - r.size + len(r.buf)) % len(r.buf)
	for i := 0; i < r.size; i++ {
		e := r.buf[(start+i)%len(r.buf)]
		if e.Seq > afterSeq {
			out = append(out, e)
		}
	}
	return out
}

// Len returns the number of retained events.
func (r *Broker) Len() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.size
}

// Cap returns the ring capacity.
func (r *Broker) Cap() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.buf)
}

// LastSeq returns the highest sequence number recorded, or 0 when empty.
func (r *Broker) LastSeq() uint64 {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.lastSeq
}

// OldestSeq returns the oldest retained sequence number, or 0 when empty.
func (r *Broker) OldestSeq() uint64 {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if r.size == 0 || len(r.buf) == 0 {
		return 0
	}
	start := (r.next - r.size + len(r.buf)) % len(r.buf)
	return r.buf[start].Seq
}

// Total returns how many events have ever been recorded (including evicted).
func (r *Broker) Total() uint64 {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.total
}

// Ready reports whether the ring buffer is initialised.
func (r *Broker) Ready() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.buf != nil
}

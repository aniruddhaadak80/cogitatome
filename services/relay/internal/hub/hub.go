package hub

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/aniruddhaadak80/cogitatome/services/relay/internal/metrics"
)

// DefaultSubscriberBuffer is the per-subscriber channel capacity. Once a
// subscriber falls this far behind, the hub drops its oldest buffered event
// rather than blocking publishers.
const DefaultSubscriberBuffer = 256

// Errors returned by the hub.
var (
	ErrHubClosed     = errors.New("hub: closed")
	ErrNilSubscriber = errors.New("hub: nil subscriber")
)

// Sink observes every published event once the hub has sequenced it. The broker
// ring buffer implements Sink; a nil Sink disables recording.
type Sink interface {
	Record(e Event)
}

// Config configures a Hub.
type Config struct {
	// SubscriberBuffer is the per-subscriber channel capacity.
	SubscriberBuffer int
	// Metrics receives published/dropped/delivered counters and the subscriber
	// gauge. A nil registry installs a fresh private one.
	Metrics *metrics.Registry
	// Sink records every broadcast event (broker.Ring, typically).
	Sink Sink
}

// Hub fans published events out to every registered subscriber. It is safe for
// concurrent use by multiple publishers and subscribers.
type Hub struct {
	cfg  Config
	met  *metrics.Registry
	sink Sink

	seq atomic.Uint64

	// seqMu keeps sequence assignment and sink recording in one critical
	// section, so the ring buffer observes events in exactly sequence order.
	seqMu sync.Mutex

	mu     sync.RWMutex
	subs   map[string]*Subscriber
	closed bool
}

// New builds a Hub. A non-positive SubscriberBuffer is replaced with
// DefaultSubscriberBuffer; a nil Metrics registry installs a private one.
func New(cfg Config) *Hub {
	if cfg.SubscriberBuffer <= 0 {
		cfg.SubscriberBuffer = DefaultSubscriberBuffer
	}
	if cfg.Metrics == nil {
		cfg.Metrics = metrics.New()
	}
	return &Hub{
		cfg:  cfg,
		met:  cfg.Metrics,
		sink: cfg.Sink,
		subs: make(map[string]*Subscriber),
	}
}

// Subscribe registers a new subscriber. It fails with ErrHubClosed once the
// hub has been closed.
func (h *Hub) Subscribe() (*Subscriber, error) {
	sub := &Subscriber{
		id:     newID(),
		events: make(chan Event, h.cfg.SubscriberBuffer),
		met:    h.met,
		done:   make(chan struct{}),
		hub:    h,
	}
	h.mu.Lock()
	if h.closed {
		h.mu.Unlock()
		return nil, fmt.Errorf("hub: subscribe: %w", ErrHubClosed)
	}
	h.subs[sub.id] = sub
	count := len(h.subs)
	h.mu.Unlock()
	h.met.SetSubscribers(int64(count))
	return sub, nil
}

// Unsubscribe removes sub from the hub and unblocks it. It is idempotent.
func (h *Hub) Unsubscribe(sub *Subscriber) error {
	if sub == nil {
		return fmt.Errorf("hub: unsubscribe: %w", ErrNilSubscriber)
	}
	h.mu.Lock()
	if current, ok := h.subs[sub.id]; ok && current == sub {
		delete(h.subs, sub.id)
	}
	count := len(h.subs)
	h.mu.Unlock()
	sub.shutdown()
	h.met.SetSubscribers(int64(count))
	return nil
}

// Remove drops the subscriber with the given id. Unknown ids are an error.
func (h *Hub) Remove(id string) error {
	h.mu.Lock()
	sub, ok := h.subs[id]
	if !ok {
		h.mu.Unlock()
		return fmt.Errorf("hub: remove: unknown subscriber %q", id)
	}
	delete(h.subs, id)
	count := len(h.subs)
	h.mu.Unlock()
	sub.shutdown()
	h.met.SetSubscribers(int64(count))
	return nil
}

// Count returns the number of live subscribers.
func (h *Hub) Count() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.subs)
}

// Metrics exposes the registry the hub reports into.
func (h *Hub) Metrics() *metrics.Registry { return h.met }

// Closed reports whether the hub has been closed.
func (h *Hub) Closed() bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.closed
}

// LastSeq returns the most recently assigned sequence number, or 0 when
// nothing has been published yet.
func (h *Hub) LastSeq() uint64 { return h.seq.Load() }

// Publish validates, sequences, records and broadcasts an event. The hub owns
// global sequencing: Seq is always reassigned and the payload of any
// pre-existing Seq (e.g. from the simulator) is preserved but overwritten.
// The stamped event is returned. Publishing to a closed hub fails with
// ErrHubClosed; invalid events fail with ErrInvalidEvent.
func (h *Hub) Publish(e Event) (Event, error) {
	if err := e.Validate(); err != nil {
		return Event{}, err
	}
	h.mu.RLock()
	if h.closed {
		h.mu.RUnlock()
		return Event{}, fmt.Errorf("hub: publish: %w", ErrHubClosed)
	}
	subs := make([]*Subscriber, 0, len(h.subs))
	for _, s := range h.subs {
		subs = append(subs, s)
	}
	h.mu.RUnlock()

	h.seqMu.Lock()
	defer h.seqMu.Unlock()
	e.Seq = h.seq.Add(1)
	if e.ID == "" {
		e.ID = newID()
	}
	if e.Timestamp.IsZero() {
		e.Timestamp = time.Now().UTC()
	}
	if h.sink != nil {
		h.sink.Record(e)
	}
	// Broadcast inside the sequencing lock so subscribers observe events in
	// exactly sequence order. Delivery never blocks, so this stays short.
	for _, s := range subs {
		s.deliver(e)
	}
	h.met.AddPublished(1)
	return e, nil
}

// Close marks the hub closed, drains every subscriber buffer and unblocks all
// waiting consumers. It is idempotent and never waits on a reader.
func (h *Hub) Close() error {
	h.mu.Lock()
	if h.closed {
		h.mu.Unlock()
		return nil
	}
	h.closed = true
	subs := make([]*Subscriber, 0, len(h.subs))
	for _, s := range h.subs {
		subs = append(subs, s)
	}
	h.subs = make(map[string]*Subscriber)
	h.mu.Unlock()

	for _, s := range subs {
		s.shutdown() // unblock consumers first
		s.drain()    // then release buffered events
	}
	h.met.SetSubscribers(0)
	return nil
}

// Subscriber is a single live consumer of the hub's event stream.
type Subscriber struct {
	id     string
	events chan Event
	met    *metrics.Registry
	done   chan struct{}
	once   sync.Once
	hub    *Hub

	dropped atomic.Uint64
}

// ID returns the subscriber's hub-assigned identifier.
func (s *Subscriber) ID() string { return s.id }

// Events returns the receive side of the subscriber's buffered channel.
func (s *Subscriber) Events() <-chan Event { return s.events }

// Done is closed when the subscriber is unregistered or the hub closes.
func (s *Subscriber) Done() <-chan struct{} { return s.done }

// Dropped returns how many events were dropped for this subscriber because it
// could not keep up with the publish rate.
func (s *Subscriber) Dropped() uint64 { return s.dropped.Load() }

// Buffered returns the number of events waiting in the subscriber's channel.
func (s *Subscriber) Buffered() int { return len(s.events) }

// Close unregisters the subscriber from its hub.
func (s *Subscriber) Close() {
	if s.hub != nil {
		_ = s.hub.Unsubscribe(s)
	}
}

// shutdown closes done exactly once.
func (s *Subscriber) shutdown() {
	s.once.Do(func() { close(s.done) })
}

// drain releases buffered events without blocking. Late in-flight deliveries
// may add a final event after draining; the pick-up is bounded by the number of
// concurrent publishers and is collected on the next drain.
func (s *Subscriber) drain() {
	for {
		select {
		case <-s.events:
		default:
			return
		}
	}
}

// deliver queues e for the subscriber, never blocking the publisher. If the
// buffer is full the oldest buffered event is evicted (drop-oldest) so the
// newest event always survives. Evictions are counted both per subscriber and
// in the registry's dropped_total.
func (s *Subscriber) deliver(e Event) {
	select {
	case s.events <- e:
		s.met.AddDelivered(1)
		return
	default:
	}
	// Buffer full: evict the oldest event and retry once.
	select {
	case <-s.events:
		s.dropped.Add(1)
		s.met.AddDropped(1)
	default:
	}
	select {
	case s.events <- e:
		s.met.AddDelivered(1)
	default:
		// A concurrent publisher refilled the buffer between our eviction and
		// this send; count the drop and give up on the newest event.
		s.dropped.Add(1)
		s.met.AddDropped(1)
	}
}

// newID returns a random hub-side identifier.
func newID() string {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		// crypto/rand is effectively never broken; fall back to a time-based id
		// instead of panicking inside a hot path.
		return fmt.Sprintf("relay-%d", time.Now().UnixNano())
	}
	return "relay-" + hex.EncodeToString(b[:])
}

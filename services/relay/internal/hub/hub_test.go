package hub

import (
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/aniruddhaadak80/cogitatome/services/relay/internal/metrics"
)

func testEvent(kind string) Event {
	return Event{Kind: kind, Payload: map[string]any{"probe": "deception", "score": 0.5}}
}

type fakeSink struct {
	mu     sync.Mutex
	events []Event
}

func (f *fakeSink) Record(e Event) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.events = append(f.events, e)
}

func (f *fakeSink) snapshot() []Event {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]Event, len(f.events))
	copy(out, f.events)
	return out
}

func TestNewAppliesDefaults(t *testing.T) {
	h := New(Config{})
	defer h.Close()

	if got := h.cfg.SubscriberBuffer; got != DefaultSubscriberBuffer {
		t.Fatalf("SubscriberBuffer = %d, want %d", got, DefaultSubscriberBuffer)
	}
	if h.met == nil {
		t.Fatal("Metrics defaulted to nil")
	}
	if h.sink != nil {
		t.Fatal("Sink should stay nil when unconfigured")
	}
	if h.Count() != 0 || h.Closed() || h.LastSeq() != 0 {
		t.Fatalf("unexpected fresh state: count=%d closed=%v lastSeq=%d", h.Count(), h.Closed(), h.LastSeq())
	}
}

func TestNewHonoursExplicitConfig(t *testing.T) {
	reg := metrics.New()
	sink := &fakeSink{}
	h := New(Config{SubscriberBuffer: 4, Metrics: reg, Sink: sink})
	defer h.Close()

	if h.cfg.SubscriberBuffer != 4 {
		t.Errorf("SubscriberBuffer = %d, want 4", h.cfg.SubscriberBuffer)
	}
	if h.met != reg {
		t.Error("Metrics did not adopt the provided registry")
	}
}

func TestSubscribeAssignsUniqueIDs(t *testing.T) {
	h := New(Config{SubscriberBuffer: 2})
	defer h.Close()

	seen := map[string]bool{}
	for i := 0; i < 8; i++ {
		sub, err := h.Subscribe()
		if err != nil {
			t.Fatalf("Subscribe #%d: %v", i, err)
		}
		if sub.ID() == "" {
			t.Fatal("subscriber id is empty")
		}
		if seen[sub.ID()] {
			t.Fatalf("duplicate subscriber id %q", sub.ID())
		}
		seen[sub.ID()] = true
		if sub.Buffered() != 0 {
			t.Errorf("fresh subscriber has %d buffered events", sub.Buffered())
		}
	}
	if h.Count() != 8 {
		t.Errorf("Count = %d, want 8", h.Count())
	}
}

func TestPublishBroadcastsToEverySubscriber(t *testing.T) {
	h := New(Config{SubscriberBuffer: 4})
	defer h.Close()

	subs := make([]*Subscriber, 0, 3)
	for i := 0; i < 3; i++ {
		sub, err := h.Subscribe()
		if err != nil {
			t.Fatalf("Subscribe: %v", err)
		}
		subs = append(subs, sub)
	}

	stamped, err := h.Publish(testEvent(KindFeatureActivated))
	if err != nil {
		t.Fatalf("Publish: %v", err)
	}
	if stamped.Seq != 1 {
		t.Errorf("seq = %d, want 1", stamped.Seq)
	}

	for i, sub := range subs {
		select {
		case got := <-sub.Events():
			if got.Seq != stamped.Seq || got.ID != stamped.ID {
				t.Errorf("subscriber %d received %+v, want seq %d id %q", i, got, stamped.Seq, stamped.ID)
			}
		case <-time.After(time.Second):
			t.Fatalf("subscriber %d never received the event", i)
		}
	}
}

func TestPublishAssignsMonotonicSequences(t *testing.T) {
	h := New(Config{SubscriberBuffer: 16})
	defer h.Close()

	var last uint64
	for i := 0; i < 25; i++ {
		e, err := h.Publish(testEvent(KindCustom))
		if err != nil {
			t.Fatalf("Publish #%d: %v", i, err)
		}
		if e.Seq != last+1 {
			t.Fatalf("seq = %d, want %d", e.Seq, last+1)
		}
		last = e.Seq
	}
	if h.LastSeq() != last {
		t.Errorf("LastSeq = %d, want %d", h.LastSeq(), last)
	}
}

func TestPublishOverwritesIncomingSequenceAndID(t *testing.T) {
	h := New(Config{SubscriberBuffer: 4})
	defer h.Close()

	in := testEvent(KindCustom)
	in.Seq = 999
	in.ID = "caller-supplied"
	stamped, err := h.Publish(in)
	if err != nil {
		t.Fatalf("Publish: %v", err)
	}
	if stamped.Seq != 1 {
		t.Errorf("hub kept incoming seq %d, want 1", stamped.Seq)
	}
	if stamped.ID != "caller-supplied" {
		t.Errorf("hub should keep a caller-supplied id, got %q", stamped.ID)
	}
}

func TestPublishFillsIDAndTimestamp(t *testing.T) {
	h := New(Config{SubscriberBuffer: 4})
	defer h.Close()

	stamped, err := h.Publish(Event{Kind: KindCustom})
	if err != nil {
		t.Fatalf("Publish: %v", err)
	}
	if stamped.ID == "" {
		t.Error("hub did not fill a missing id")
	}
	if stamped.Timestamp.IsZero() {
		t.Error("hub did not stamp a zero timestamp")
	}
}

func TestPublishInvalidEventKeepsSequence(t *testing.T) {
	h := New(Config{SubscriberBuffer: 4})
	defer h.Close()

	before := h.LastSeq()
	if _, err := h.Publish(Event{Kind: ""}); !errors.Is(err, ErrInvalidEvent) {
		t.Fatalf("empty kind error = %v, want ErrInvalidEvent", err)
	}
	huge := Event{Kind: KindCustom, ID: string(make([]byte, MaxIDLength+1))}
	if _, err := h.Publish(huge); !errors.Is(err, ErrInvalidEvent) {
		t.Fatalf("oversized id error = %v, want ErrInvalidEvent", err)
	}
	if h.LastSeq() != before {
		t.Fatalf("invalid publishes consumed sequence numbers: %d -> %d", before, h.LastSeq())
	}
	if got := h.Metrics().Snapshot().Published; got != 0 {
		t.Errorf("invalid publishes registered as published: %d", got)
	}
}

func TestUnsubscribeStopsDelivery(t *testing.T) {
	h := New(Config{SubscriberBuffer: 4})
	defer h.Close()

	keep, _ := h.Subscribe()
	drop, _ := h.Subscribe()

	if err := h.Unsubscribe(drop); err != nil {
		t.Fatalf("Unsubscribe: %v", err)
	}
	if _, err := h.Publish(testEvent(KindCustom)); err != nil {
		t.Fatalf("Publish: %v", err)
	}

	select {
	case got := <-keep.Events():
		if got.Seq != 1 {
			t.Errorf("survivor received seq %d, want 1", got.Seq)
		}
	case <-time.After(time.Second):
		t.Fatal("survivor never received the event")
	}

	select {
	case e, ok := <-drop.Events():
		t.Errorf("unsubscribed subscriber received %+v (ok=%v)", e, ok)
	default:
	}
	select {
	case <-drop.Done():
	default:
		t.Error("unregistered subscriber's Done was not closed")
	}
}

func TestUnsubscribeIsIdempotent(t *testing.T) {
	h := New(Config{SubscriberBuffer: 2})
	defer h.Close()

	sub, _ := h.Subscribe()
	for i := 0; i < 3; i++ {
		if err := h.Unsubscribe(sub); err != nil {
			t.Fatalf("Unsubscribe #%d: %v", i, err)
		}
	}
	if err := h.Unsubscribe(nil); !errors.Is(err, ErrNilSubscriber) {
		t.Fatalf("Unsubscribe(nil) error = %v, want ErrNilSubscriber", err)
	}
	if h.Count() != 0 {
		t.Errorf("Count = %d, want 0", h.Count())
	}
}

func TestSubscriberCloseRemovesFromHub(t *testing.T) {
	h := New(Config{SubscriberBuffer: 2})
	defer h.Close()

	sub, _ := h.Subscribe()
	sub.Close()
	if h.Count() != 0 {
		t.Errorf("Count = %d after Subscriber.Close, want 0", h.Count())
	}
	sub.Close() // idempotent
}

func TestRemoveByID(t *testing.T) {
	h := New(Config{SubscriberBuffer: 2})
	defer h.Close()

	sub, _ := h.Subscribe()
	if err := h.Remove(sub.ID()); err != nil {
		t.Fatalf("Remove: %v", err)
	}
	if h.Count() != 0 {
		t.Errorf("Count = %d, want 0", h.Count())
	}
	if err := h.Remove(sub.ID()); err == nil {
		t.Error("removing an unknown id should fail")
	}
}

func TestCountTracksSubscribers(t *testing.T) {
	h := New(Config{SubscriberBuffer: 1})
	defer h.Close()

	subs := make([]*Subscriber, 0, 5)
	for want := 1; want <= 5; want++ {
		sub, _ := h.Subscribe()
		subs = append(subs, sub)
		if h.Count() != want {
			t.Fatalf("Count = %d, want %d", h.Count(), want)
		}
		if got := h.Metrics().Snapshot().Subscribers; got != int64(want) {
			t.Fatalf("subscriber gauge = %d, want %d", got, want)
		}
	}
	for i, sub := range subs {
		sub.Close()
		if want := 4 - i; h.Count() != want {
			t.Fatalf("Count = %d, want %d", h.Count(), want)
		}
	}
}

func TestSinkRecordsEveryPublishedEvent(t *testing.T) {
	sink := &fakeSink{}
	h := New(Config{SubscriberBuffer: 4, Sink: sink})
	defer h.Close()

	for i := 0; i < 3; i++ {
		if _, err := h.Publish(testEvent(KindProbeScore)); err != nil {
			t.Fatalf("Publish #%d: %v", i, err)
		}
	}
	events := sink.snapshot()
	if len(events) != 3 {
		t.Fatalf("sink recorded %d events, want 3", len(events))
	}
	for i, e := range events {
		if e.Seq != uint64(i+1) {
			t.Errorf("sink event %d has seq %d, want %d", i, e.Seq, i+1)
		}
		if e.Kind != KindProbeScore {
			t.Errorf("sink event %d kind = %q", i, e.Kind)
		}
	}
}

func TestSubscribeAfterCloseFails(t *testing.T) {
	h := New(Config{SubscriberBuffer: 2})
	if err := h.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
	if _, err := h.Subscribe(); !errors.Is(err, ErrHubClosed) {
		t.Fatalf("Subscribe after Close = %v, want ErrHubClosed", err)
	}
}

func TestPublishAfterCloseFails(t *testing.T) {
	h := New(Config{SubscriberBuffer: 2})
	_ = h.Close()
	if _, err := h.Publish(testEvent(KindCustom)); !errors.Is(err, ErrHubClosed) {
		t.Fatalf("Publish after Close = %v, want ErrHubClosed", err)
	}
	if h.LastSeq() != 0 {
		t.Errorf("LastSeq = %d after rejected publish, want 0", h.LastSeq())
	}
}

func TestCloseUnblocksConsumers(t *testing.T) {
	h := New(Config{SubscriberBuffer: 2})
	sub, _ := h.Subscribe()

	done := make(chan struct{})
	go func() {
		defer close(done)
		select {
		case <-sub.Done():
		case <-time.After(2 * time.Second):
			t.Error("consumer was not unblocked by Close")
		}
	}()

	_ = h.Close()
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("test goroutine hung")
	}
}

func TestCloseDrainsBufferedEvents(t *testing.T) {
	h := New(Config{SubscriberBuffer: 8})
	sub, _ := h.Subscribe()
	for i := 0; i < 4; i++ {
		if _, err := h.Publish(testEvent(KindCustom)); err != nil {
			t.Fatalf("Publish #%d: %v", i, err)
		}
	}
	if sub.Buffered() != 4 {
		t.Fatalf("Buffered = %d, want 4", sub.Buffered())
	}

	_ = h.Close()
	if sub.Buffered() != 0 {
		t.Errorf("Buffered = %d after Close, want 0 (drain)", sub.Buffered())
	}
	select {
	case e, ok := <-sub.Events():
		t.Errorf("event channel still yields events after Close: %+v (ok=%v)", e, ok)
	case <-sub.Done():
		// done closed and buffer drained: exactly the expected state.
	}
	if h.Metrics().Snapshot().Subscribers != 0 {
		t.Errorf("subscriber gauge = %d after Close, want 0", h.Metrics().Snapshot().Subscribers)
	}
}

func TestCloseIsIdempotent(t *testing.T) {
	h := New(Config{SubscriberBuffer: 2})
	for i := 0; i < 3; i++ {
		if err := h.Close(); err != nil {
			t.Fatalf("Close #%d: %v", i, err)
		}
	}
	if !h.Closed() {
		t.Error("Closed() = false after Close")
	}
}

func TestHubCarriesDroppedCounterForStalledSubscriber(t *testing.T) {
	reg := metrics.New()
	h := New(Config{SubscriberBuffer: 4, Metrics: reg})
	defer h.Close()

	sub, _ := h.Subscribe()
	for i := 0; i < 12; i++ {
		if _, err := h.Publish(testEvent(KindCustom)); err != nil {
			t.Fatalf("Publish #%d: %v", i, err)
		}
	}
	if sub.Dropped() != 8 {
		t.Errorf("per-subscriber dropped = %d, want 8", sub.Dropped())
	}
	if got := reg.Snapshot().Dropped; got != 8 {
		t.Errorf("registry dropped_total = %d, want 8", got)
	}
	if got := reg.Snapshot().Published; got != 12 {
		t.Errorf("registry published = %d, want 12", got)
	}
}

func TestConcurrentPublishSubscribeRace(t *testing.T) {
	reg := metrics.New()
	h := New(Config{SubscriberBuffer: 8, Metrics: reg})

	const publishers = 4
	const perPublisher = 100

	readerDone := make(chan struct{})
	go func() {
		defer close(readerDone)
		sub, err := h.Subscribe()
		if err != nil {
			return
		}
		defer sub.Close()
		for {
			select {
			case <-sub.Done():
				return
			case e, ok := <-sub.Events():
				if !ok {
					return
				}
				if e.Seq == 0 {
					t.Error("received an unsequenced event")
				}
			}
		}
	}()

	churnDone := make(chan struct{})
	go func() {
		defer close(churnDone)
		for i := 0; i < 50; i++ {
			sub, err := h.Subscribe()
			if err != nil {
				return
			}
			_ = h.Unsubscribe(sub)
		}
	}()

	var pubs sync.WaitGroup
	for p := 0; p < publishers; p++ {
		pubs.Add(1)
		go func() {
			defer pubs.Done()
			for i := 0; i < perPublisher; i++ {
				if _, err := h.Publish(testEvent(KindCustom)); err != nil {
					t.Errorf("Publish: %v", err)
					return
				}
			}
		}()
	}
	pubs.Wait()

	_ = h.Close()
	<-readerDone
	<-churnDone

	snap := reg.Snapshot()
	if snap.Published != publishers*perPublisher {
		t.Errorf("published = %d, want %d", snap.Published, publishers*perPublisher)
	}
	if snap.Subscribers != 0 {
		t.Errorf("subscriber gauge = %d, want 0", snap.Subscribers)
	}
}

func TestCloseWhilePublishingIsSafe(t *testing.T) {
	for i := 0; i < 100; i++ {
		h := New(Config{SubscriberBuffer: 4})
		sub, err := h.Subscribe()
		if err != nil {
			t.Fatalf("Subscribe: %v", err)
		}
		var wg sync.WaitGroup
		wg.Add(2)
		go func() {
			defer wg.Done()
			for j := 0; j < 20; j++ {
				_, _ = h.Publish(testEvent(KindCustom))
			}
		}()
		go func() {
			defer wg.Done()
			_ = h.Close()
		}()
		wg.Wait()
		sub.Close()
		if err := h.Close(); err != nil {
			t.Fatalf("second Close: %v", err)
		}
	}
}

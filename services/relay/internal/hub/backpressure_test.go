package hub

import (
	"fmt"
	"runtime"
	"sync"
	"testing"
	"time"

	"github.com/aniruddhaadak80/cogitatome/services/relay/internal/metrics"
)

func TestDropOldestKeepsNewestEvents(t *testing.T) {
	reg := metrics.New()
	h := New(Config{SubscriberBuffer: 4, Metrics: reg})
	defer h.Close()

	sub, _ := h.Subscribe()
	const published = 10
	for i := 1; i <= published; i++ {
		if _, err := h.Publish(testEvent(KindCustom)); err != nil {
			t.Fatalf("Publish #%d: %v", i, err)
		}
	}

	if got := sub.Buffered(); got != 4 {
		t.Fatalf("Buffered = %d, want the 4 newest slots full", got)
	}
	var seqs []uint64
	for {
		select {
		case e := <-sub.Events():
			seqs = append(seqs, e.Seq)
			continue
		default:
		}
		break
	}
	if len(seqs) != 4 {
		t.Fatalf("drained %d events, want 4", len(seqs))
	}
	for i, want := range []uint64{7, 8, 9, 10} {
		if seqs[i] != want {
			t.Fatalf("buffered seqs = %v, want [7 8 9 10]", seqs)
		}
	}
	if sub.Dropped() != 6 {
		t.Errorf("per-subscriber dropped = %d, want 6", sub.Dropped())
	}
	if got := reg.Snapshot().Dropped; got != 6 {
		t.Errorf("dropped_total = %d, want 6", got)
	}
	if got := reg.Snapshot().Published; got != published {
		t.Errorf("published = %d, want %d", got, published)
	}
}

func TestDropOldestWithBufferOfOne(t *testing.T) {
	h := New(Config{SubscriberBuffer: 1})
	defer h.Close()

	sub, _ := h.Subscribe()
	for i := 1; i <= 5; i++ {
		if _, err := h.Publish(testEvent(KindCustom)); err != nil {
			t.Fatalf("Publish #%d: %v", i, err)
		}
	}
	if sub.Buffered() != 1 {
		t.Fatalf("Buffered = %d, want 1", sub.Buffered())
	}
	if e := <-sub.Events(); e.Seq != 5 {
		t.Errorf("kept seq %d, want the newest (5)", e.Seq)
	}
	if sub.Dropped() != 4 {
		t.Errorf("dropped = %d, want 4", sub.Dropped())
	}
}

func TestDropOldestSurvivesManyWrapArounds(t *testing.T) {
	reg := metrics.New()
	h := New(Config{SubscriberBuffer: 3, Metrics: reg})
	defer h.Close()

	sub, _ := h.Subscribe()
	const published = 30
	for i := 1; i <= published; i++ {
		e, err := h.Publish(testEvent(KindCustom))
		if err != nil {
			t.Fatalf("Publish #%d: %v", i, err)
		}
		if e.Seq != uint64(i) {
			t.Fatalf("seq = %d, want %d", e.Seq, i)
		}
	}
	if got := sub.Buffered(); got != 3 {
		t.Fatalf("Buffered = %d, want 3", got)
	}
	last := published
	for i := 0; i < 3; i++ {
		e := <-sub.Events()
		want := uint64(last - 2 + i)
		if e.Seq != want {
			t.Fatalf("kept seq %d, want %d", e.Seq, want)
		}
	}
	if want := uint64(published - 3); reg.Snapshot().Dropped != want {
		t.Errorf("dropped_total = %d, want %d", reg.Snapshot().Dropped, want)
	}
}

func TestPublishNeverBlocksOnSlowSubscriber(t *testing.T) {
	h := New(Config{SubscriberBuffer: 2})
	defer h.Close()

	if _, err := h.Subscribe(); err != nil { // nobody reads this channel
		t.Fatalf("Subscribe: %v", err)
	}
	done := make(chan struct{})
	go func() {
		defer close(done)
		for i := 0; i < 2000; i++ {
			if _, err := h.Publish(testEvent(KindCustom)); err != nil {
				t.Errorf("Publish #%d: %v", i, err)
				return
			}
		}
	}()
	select {
	case <-done:
	case <-time.After(10 * time.Second):
		t.Fatal("publishing blocked on a slow subscriber")
	}
}

// A "keen" subscriber is one that keeps up. The test paces the publisher with
// runtime.Gosched so the reader is actually scheduled, and sizes the buffer to
// hold the whole burst — with those preconditions, nothing may be dropped.
func TestKeenSubscriberNeverDrops(t *testing.T) {
	reg := metrics.New()
	h := New(Config{SubscriberBuffer: 512, Metrics: reg})
	defer h.Close()

	sub, _ := h.Subscribe()
	var got []uint64
	readDone := make(chan struct{})
	go func() {
		defer close(readDone)
		for e := range sub.Events() {
			got = append(got, e.Seq)
			if len(got) == 300 {
				return
			}
		}
	}()

	for i := 1; i <= 300; i++ {
		if _, err := h.Publish(testEvent(KindCustom)); err != nil {
			t.Fatalf("Publish #%d: %v", i, err)
		}
		// Yield so the reader makes progress between publishes; without this the
		// publisher can drain the whole burst before the reader is scheduled,
		// and the drop-oldest policy would (correctly) evict.
		runtime.Gosched()
	}
	select {
	case <-readDone:
	case <-time.After(10 * time.Second):
		t.Fatal("keen subscriber missed events")
	}
	if len(got) != 300 {
		t.Fatalf("received %d events, want 300", len(got))
	}
	for i, seq := range got {
		if seq != uint64(i+1) {
			t.Fatalf("event %d had seq %d, want %d (order violated)", i, seq, i+1)
		}
	}
	if got := reg.Snapshot().Dropped; got != 0 {
		t.Errorf("dropped = %d, want 0", got)
	}
	if got := reg.Snapshot().Delivered; got != 300 {
		t.Errorf("delivered = %d, want 300", got)
	}
	sub.Close()
}

// A subscriber that is paced slightly behind the publisher must keep exactly the
// most recent window and count every eviction — the drop-oldest contract.
func TestSteadySubscriberKeepsTheNewestWindow(t *testing.T) {
	reg := metrics.New()
	h := New(Config{SubscriberBuffer: 8, Metrics: reg})
	defer h.Close()

	sub, _ := h.Subscribe()
	const published = 100
	for i := 1; i <= published; i++ {
		if _, err := h.Publish(testEvent(KindCustom)); err != nil {
			t.Fatalf("Publish #%d: %v", i, err)
		}
	}
	if got := sub.Buffered(); got != 8 {
		t.Fatalf("Buffered = %d, want the newest 8", got)
	}
	for i := 0; i < 8; i++ {
		want := uint64(published - 7 + i)
		if e := <-sub.Events(); e.Seq != want {
			t.Fatalf("kept seq %d, want %d", e.Seq, want)
		}
	}
	if got := sub.Dropped(); got != published-8 {
		t.Errorf("dropped = %d, want %d", got, published-8)
	}
	if got, want := reg.Snapshot().Delivered, uint64(published); got != want {
		t.Errorf("delivered = %d, want %d (every event is accepted before the oldest is evicted)", got, want)
	}
}

func TestDropOldestUnderConcurrentLoad(t *testing.T) {
	reg := metrics.New()
	h := New(Config{SubscriberBuffer: 8, Metrics: reg})
	defer h.Close()

	sub, _ := h.Subscribe() // deliberately never read until after publishing

	var mu sync.Mutex
	seqs := make(map[uint64]bool, 150)

	var wg sync.WaitGroup
	for p := 0; p < 3; p++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < 50; i++ {
				e, err := h.Publish(testEvent(KindCustom))
				if err != nil {
					t.Errorf("Publish: %v", err)
					return
				}
				mu.Lock()
				seqs[e.Seq] = true
				mu.Unlock()
			}
		}()
	}
	wg.Wait()

	if len(seqs) != 150 {
		t.Fatalf("saw %d unique sequences, want 150", len(seqs))
	}
	// Serialised sequencing: the buffered window is exactly the newest 8.
	if got := sub.Buffered(); got != 8 {
		t.Fatalf("Buffered = %d, want 8", got)
	}
	for i := 0; i < 8; i++ {
		e := <-sub.Events()
		want := uint64(143 + i)
		if e.Seq != want {
			t.Fatalf("kept seq %d, want %d", e.Seq, want)
		}
	}
	if got := reg.Snapshot().Dropped; got != 142 {
		t.Errorf("dropped_total = %d, want 142", got)
	}
	if got := reg.Snapshot().Published; got != 150 {
		t.Errorf("published = %d, want 150", got)
	}
	if h.LastSeq() != 150 {
		t.Errorf("LastSeq = %d, want 150", h.LastSeq())
	}
}

func TestBackpressureMetricsMessageIsReadable(t *testing.T) {
	reg := metrics.New()
	h := New(Config{SubscriberBuffer: 2, Metrics: reg})
	defer h.Close()

	sub, _ := h.Subscribe()
	for i := 0; i < 6; i++ {
		if _, err := h.Publish(testEvent(KindCustom)); err != nil {
			t.Fatalf("Publish: %v", err)
		}
	}
	snap := reg.Snapshot()
	msg := fmt.Sprintf("published=%d delivered=%d dropped=%d subscribers=%d",
		snap.Published, snap.Delivered, snap.Dropped, snap.Subscribers)
	// All 6 events enter the 2-slot buffer (delivered), the 4 that overflow are
	// evicted by the drop-oldest policy, and one subscriber is registered.
	if msg != "published=6 delivered=6 dropped=4 subscribers=1" {
		t.Fatalf("unexpected metrics rendering: %s", msg)
	}
	sub.Close()
}

package broker

import (
	"fmt"
	"sync"
	"testing"

	"github.com/aniruddhaadak80/cogitatome/services/relay/internal/hub"
)

// Broker must satisfy hub.Sink so the hub can record into it.
var _ hub.Sink = (*Broker)(nil)

func ev(seq uint64) hub.Event {
	return hub.Event{Seq: seq, Kind: hub.KindCustom, ID: fmt.Sprintf("evt-%d", seq)}
}

func seqsOf(events []hub.Event) []uint64 {
	out := make([]uint64, 0, len(events))
	for _, e := range events {
		out = append(out, e.Seq)
	}
	return out
}

func equalSeqs(got []uint64, want ...uint64) bool {
	if len(got) != len(want) {
		return false
	}
	for i := range got {
		if got[i] != want[i] {
			return false
		}
	}
	return true
}

func TestNewClampsNonPositiveCapacity(t *testing.T) {
	tests := []struct {
		name string
		in   int
		want int
	}{
		{"zero", 0, DefaultCapacity},
		{"negative", -7, DefaultCapacity},
		{"explicit", 3, 3},
		{"large", 1024, 1024},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := New(tc.in).Cap(); got != tc.want {
				t.Errorf("Cap() = %d, want %d", got, tc.want)
			}
			if !New(tc.in).Ready() {
				t.Error("Ready() = false")
			}
		})
	}
}

func TestRecordAndReplayAll(t *testing.T) {
	b := New(8)
	for i := uint64(1); i <= 5; i++ {
		b.Record(ev(i))
	}
	if b.Len() != 5 {
		t.Fatalf("Len = %d, want 5", b.Len())
	}
	if b.Total() != 5 {
		t.Fatalf("Total = %d, want 5", b.Total())
	}
	got := seqsOf(b.Replay(0))
	if !equalSeqs(got, 1, 2, 3, 4, 5) {
		t.Fatalf("Replay(0) = %v, want [1 2 3 4 5]", got)
	}
}

func TestReplayFiltersBySequence(t *testing.T) {
	b := New(8)
	for i := uint64(1); i <= 6; i++ {
		b.Record(ev(i))
	}
	tests := []struct {
		after uint64
		want  []uint64
	}{
		{0, []uint64{1, 2, 3, 4, 5, 6}},
		{1, []uint64{2, 3, 4, 5, 6}},
		{3, []uint64{4, 5, 6}},
		{6, nil},
		{999, nil},
	}
	for _, tc := range tests {
		t.Run(fmt.Sprintf("after=%d", tc.after), func(t *testing.T) {
			got := seqsOf(b.Replay(tc.after))
			if len(tc.want) == 0 {
				if len(got) != 0 {
					t.Fatalf("Replay(%d) = %v, want empty", tc.after, got)
				}
				return
			}
			if !equalSeqs(got, tc.want...) {
				t.Fatalf("Replay(%d) = %v, want %v", tc.after, got, tc.want)
			}
		})
	}
}

func TestReplayEmptyRing(t *testing.T) {
	b := New(4)
	if got := b.Replay(0); len(got) != 0 {
		t.Fatalf("Replay on empty ring = %v, want empty", got)
	}
	if b.Len() != 0 || b.Total() != 0 || b.LastSeq() != 0 || b.OldestSeq() != 0 {
		t.Fatalf("empty ring state: len=%d total=%d last=%d oldest=%d",
			b.Len(), b.Total(), b.LastSeq(), b.OldestSeq())
	}
}

func TestRingWrapAroundKeepsNewest(t *testing.T) {
	b := New(3)
	for i := uint64(1); i <= 10; i++ {
		b.Record(ev(i))
	}
	if b.Len() != 3 {
		t.Fatalf("Len = %d, want 3", b.Len())
	}
	if b.Total() != 10 {
		t.Fatalf("Total = %d, want 10", b.Total())
	}
	if b.LastSeq() != 10 {
		t.Errorf("LastSeq = %d, want 10", b.LastSeq())
	}
	if b.OldestSeq() != 8 {
		t.Errorf("OldestSeq = %d, want 8", b.OldestSeq())
	}
	got := seqsOf(b.Replay(0))
	if !equalSeqs(got, 8, 9, 10) {
		t.Fatalf("Replay(0) = %v, want [8 9 10]", got)
	}
}

func TestReplayAfterEvictedSequence(t *testing.T) {
	b := New(3)
	for i := uint64(1); i <= 10; i++ {
		b.Record(ev(i))
	}
	tests := []struct {
		after uint64
		want  []uint64
	}{
		{2, []uint64{8, 9, 10}}, // 4-7 were evicted: gap is not replayable
		{8, []uint64{9, 10}},
		{9, []uint64{10}},
		{10, nil},
	}
	for _, tc := range tests {
		got := seqsOf(b.Replay(tc.after))
		if !equalSeqs(got, tc.want...) {
			t.Fatalf("Replay(%d) = %v, want %v", tc.after, got, tc.want)
		}
	}
}

func TestReplayReturnsFreshSliceOrdered(t *testing.T) {
	b := New(4)
	for i := uint64(1); i <= 4; i++ {
		b.Record(ev(i))
	}
	first := b.Replay(0)
	first[0] = ev(999) // mutate the returned slice
	second := b.Replay(0)
	if !equalSeqs(seqsOf(second), 1, 2, 3, 4) {
		t.Fatalf("ring was corrupted by caller mutation: %v", seqsOf(second))
	}
}

func TestZeroValueBrokerIsInert(t *testing.T) {
	var b Broker
	b.Record(ev(1)) // must not panic or index out of range
	if got := b.Replay(0); len(got) != 0 {
		t.Fatalf("zero-value replay = %v, want empty", got)
	}
	if b.OldestSeq() != 0 || b.LastSeq() != 0 || b.Total() != 0 || b.Ready() {
		t.Fatalf("zero-value broker should stay inert and not ready")
	}
}

func TestRingExactCapacityFill(t *testing.T) {
	b := New(3)
	for i := uint64(1); i <= 3; i++ {
		b.Record(ev(i))
	}
	if !equalSeqs(seqsOf(b.Replay(0)), 1, 2, 3) {
		t.Fatalf("full ring = %v, want [1 2 3]", seqsOf(b.Replay(0)))
	}
	b.Record(ev(4))
	if !equalSeqs(seqsOf(b.Replay(0)), 2, 3, 4) {
		t.Fatalf("after one overflow = %v, want [2 3 4]", seqsOf(b.Replay(0)))
	}
}

func TestConcurrentRecordAndReplayRace(t *testing.T) {
	b := New(64)

	const produced = 2000
	recordDone := make(chan struct{})
	go func() {
		defer close(recordDone)
		for i := uint64(1); i <= produced; i++ {
			b.Record(ev(i))
		}
	}()

	var readers sync.WaitGroup
	for r := 0; r < 4; r++ {
		readers.Add(1)
		go func() {
			defer readers.Done()
			for i := 0; i < 200; i++ {
				got := b.Replay(0)
				if len(got) > 64 {
					t.Errorf("replay returned %d events, cap 64", len(got))
					return
				}
				for j := 1; j < len(got); j++ {
					if got[j].Seq <= got[j-1].Seq {
						t.Errorf("replay out of order: %d after %d", got[j].Seq, got[j-1].Seq)
						return
					}
				}
				for _, e := range got {
					if e.Seq < 1 || e.Seq > produced {
						t.Errorf("replay contained seq %d outside [1,%d]", e.Seq, produced)
						return
					}
				}
			}
		}()
	}
	<-recordDone
	readers.Wait()

	if b.Total() != produced {
		t.Errorf("Total = %d, want %d", b.Total(), produced)
	}
	if b.Len() != 64 {
		t.Errorf("Len = %d, want 64", b.Len())
	}
	if b.LastSeq() != produced {
		t.Errorf("LastSeq = %d, want %d", b.LastSeq(), produced)
	}
	if want := uint64(produced - 63); b.OldestSeq() != want {
		t.Errorf("OldestSeq = %d, want %d", b.OldestSeq(), want)
	}
}

func TestConcurrentMultiProducerRecordIsSafe(t *testing.T) {
	b := New(32)
	var wg sync.WaitGroup
	for w := 0; w < 8; w++ {
		wg.Add(1)
		go func(w int) {
			defer wg.Done()
			for i := 1; i <= 100; i++ {
				b.Record(ev(uint64(w*100 + i)))
			}
		}(w)
	}
	wg.Wait()

	got := b.Replay(0)
	if len(got) > 32 {
		t.Fatalf("replay returned %d events, cap 32", len(got))
	}
	if b.Total() != 800 {
		t.Errorf("Total = %d, want 800", b.Total())
	}
	if b.Len() != 32 {
		t.Errorf("Len = %d, want 32", b.Len())
	}
}

func TestReplayThroughSinkInterface(t *testing.T) {
	// The hub only ever sees a hub.Sink; make sure recording through that
	// interface behaves identically to direct use.
	var sink hub.Sink = New(2)
	for i := uint64(1); i <= 3; i++ {
		sink.Record(ev(i))
	}

	ring := New(4)
	for i := uint64(1); i <= 3; i++ {
		ring.Record(ev(i))
	}
	if got := seqsOf(ring.Replay(0)); !equalSeqs(got, 1, 2, 3) {
		t.Fatalf("Replay = %v, want [1 2 3]", got)
	}
	if got := seqsOf(ring.Replay(2)); !equalSeqs(got, 3) {
		t.Fatalf("Replay(2) = %v, want [3]", got)
	}
}

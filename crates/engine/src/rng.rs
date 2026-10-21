//! Deterministic pseudo-random number generation.
//!
//! Everything in `cogitatome-engine` that looks random — weight initialisation,
//! synthetic activation fuzzing, corpus shuffling — is driven by [`Rng`], so a
//! seed reproduces an experiment bit for bit across machines and releases.
//!
//! The generator is [`splitmix64`](https://prng.di.unimi.it/splitmix64.c): a
//! 64-bit counter mixed with three xorshift-multiply finalisers. It has no
//! statistical surprises for the small-sample work this crate does, it is 4
//! instructions wide, and it is trivially reproducible from a single `u64`.

/// A `splitmix64` pseudo-random number generator.
///
/// # Determinism
///
/// Two generators created with the same seed produce identical streams, on
/// every platform, forever. Streams from different seeds are effectively
/// unrelated. See [`Rng::state`] if you need to checkpoint a stream.
///
/// # Example
///
/// ```
/// use cogitatome_engine::rng::Rng;
///
/// let mut a = Rng::new(2024);
/// let mut b = Rng::new(2024);
/// assert_eq!(a.u64(), b.u64());
/// assert_eq!(a.f64(), b.f64());
/// ```
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rng {
    state: u64,
}

impl Rng {
    /// Golden-ratio increment used by `splitmix64` (`floor(2^64 / phi)`).
    const GAMMA: u64 = 0x9E37_79B9_7F4A_7C15;

    /// Creates a generator seeded with `seed`.
    pub const fn new(seed: u64) -> Self {
        Self { state: seed }
    }

    /// Returns the raw generator state, so a stream can be checkpointed.
    pub const fn state(&self) -> u64 {
        self.state
    }

    /// Restores a state previously returned by [`Rng::state`].
    pub const fn set_state(&mut self, state: u64) {
        self.state = state;
    }

    /// Advances the generator and returns the next 64-bit output.
    ///
    /// This is the primitive every other sampling method is built on.
    pub fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(Self::GAMMA);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// Alias of [`Rng::next_u64`] that reads better at call sites.
    pub fn u64(&mut self) -> u64 {
        self.next_u64()
    }

    /// Returns a uniformly distributed `f64` in `[0, 1)`.
    ///
    /// Built from the top 53 bits of a 64-bit draw, so every value of the
    /// double mantissa in `[0, 1)` is reachable and `0.0` is the minimum.
    pub fn f64(&mut self) -> f64 {
        const SCALE: f64 = 1.0 / ((1u64 << 53) as f64);
        // `as` is the only sane cast here: 2^53 is exactly representable in f64
        // and the shift already dropped the 11 low bits.
        (self.next_u64() >> 11) as f64 * SCALE
    }

    /// Returns a uniformly distributed `f32` in `[0, 1)`.
    pub fn f32(&mut self) -> f32 {
        self.f64() as f32
    }

    /// Returns a uniformly distributed integer in `0..n`.
    ///
    /// # Panics
    ///
    /// Panics when `n == 0`, mirroring the precondition of slice indexing. Use
    /// [`Rng::weighted_index`] when an empty weight set is possible.
    pub fn range(&mut self, n: usize) -> usize {
        assert!(n > 0, "Rng::range requires n > 0");
        // The modulo bias is bounded by 1/2^64 * n, i.e. far below anything a
        // model-inspection UI can observe, and it keeps the stream a pure
        // function of (seed, draw index).
        (self.next_u64() % n as u64) as usize
    }

    /// Returns a standard normal (`mu = 0`, `sigma = 1`) sample.
    ///
    /// Box–Muller transform over two uniform draws. Each call consumes exactly
    /// two uniforms, which is what makes the stream reproducible; use
    /// [`Rng::normal_pair`] if you need both variates.
    pub fn normal(&mut self) -> f64 {
        self.normal_pair().0
    }

    /// Returns two independent standard normal samples from one pair of
    /// uniform draws.
    pub fn normal_pair(&mut self) -> (f64, f64) {
        // `f64()` is a multiple of 2^-53, so the smallest positive value is
        // 2^-53; the clamp only guards the (astronomically rare) exact 0.0.
        const MIN_UNIFORM: f64 = 1.0 / 9_007_199_254_740_992.0;
        let u1 = self.f64().max(MIN_UNIFORM);
        let u2 = self.f64();
        let radius = (-2.0 * u1.ln()).sqrt();
        let angle = 2.0 * std::f64::consts::PI * u2;
        (radius * angle.cos(), radius * angle.sin())
    }

    /// Fills `out` with uniform samples in `[0, 1)`.
    pub fn fill_uniform(&mut self, out: &mut [f64]) {
        for value in out.iter_mut() {
            *value = self.f64();
        }
    }

    /// Fills `out` with standard normal samples.
    pub fn fill_normal(&mut self, out: &mut [f64]) {
        for value in out.iter_mut() {
            *value = self.normal();
        }
    }

    /// Fisher–Yates shuffle, in place.
    ///
    /// Every permutation of a `k` element slice is equally likely and the
    /// result depends only on the seed, so shuffling a corpus is reproducible.
    pub fn shuffle<T>(&mut self, items: &mut [T]) {
        for i in (1..items.len()).rev() {
            items.swap(i, self.range(i + 1));
        }
    }

    /// Samples an index proportionally to non-negative `weights`.
    ///
    /// Returns `None` when the weight set is empty or when the total weight is
    /// not positive — callers can treat that as "nothing to sample".
    pub fn weighted_index(&mut self, weights: &[f64]) -> Option<usize> {
        let total: f64 = weights.iter().sum();
        if total <= 0.0 || !total.is_finite() {
            return None;
        }
        let mut target = self.f64() * total;
        for (index, weight) in weights.iter().enumerate() {
            target -= weight;
            if target <= 0.0 {
                return Some(index);
            }
        }
        weights.len().checked_sub(1)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Reference stream for `splitmix64` seeded with 42.
    ///
    /// These numbers were checked against an independent implementation of
    /// the published `splitmix64` specification (and against the canonical
    /// first output of seed 0, `0xe220a8397b1dcdaf`), so they pin the *spec*
    /// rather than merely re-asserting whatever this file happens to do.
    const SEED_42_STREAM: [u64; 6] = [
        13_679_457_532_755_275_413,
        2_949_826_092_126_892_291,
        5_139_283_748_462_763_858,
        6_349_198_060_258_255_764,
        701_532_786_141_963_250,
        16_015_981_125_662_989_062,
    ];

    #[test]
    fn splitmix64_matches_the_reference_stream() {
        let mut rng = Rng::new(42);
        for expected in SEED_42_STREAM {
            assert_eq!(rng.u64(), expected);
        }
    }

    #[test]
    fn same_seed_gives_the_same_stream() {
        let mut a = Rng::new(2026);
        let mut b = Rng::new(2026);
        for _ in 0..64 {
            assert_eq!(a.u64(), b.u64());
        }
        // A different seed must not reproduce the stream.
        let mut c = Rng::new(2027);
        assert_ne!(c.u64(), Rng::new(2026).u64());
    }

    #[test]
    fn f64_stays_in_the_unit_interval() {
        let mut rng = Rng::new(99);
        let mut min: f64 = 1.0;
        let mut max: f64 = 0.0;
        for _ in 0..100_000 {
            let value = rng.f64();
            assert!((0.0..1.0).contains(&value), "{value} escaped [0, 1)");
            min = min.min(value);
            max = max.max(value);
        }
        // 100k draws should comfortably cover both ends of the range.
        assert!(min < 1e-3, "smallest sample {min} looks suspiciously large");
        assert!(max > 0.999, "largest sample {max} looks suspiciously small");
        let mut f32_rng = Rng::new(99);
        for _ in 0..1_000 {
            assert!((0.0..1.0).contains(&f32_rng.f32()));
        }
    }

    /// Golden `f64` values for the seed-42 stream.
    ///
    /// `(draw >> 11) as f64 * 2^-53` is exact for every draw — the mantissa is
    /// below `2^53` and the scale is a power of two, so nothing ever rounds —
    /// which makes each value below fully determined by [`SEED_42_STREAM`].
    ///
    /// The test re-derives them from that array so the two pins cannot drift
    /// apart, and so a stale literal reports itself as such instead of looking
    /// like a change in the generator.
    const SEED_42_F64: [f64; 4] = [
        0.741_564_878_771_823_3,
        0.159_910_392_876_920_1,
        0.278_601_130_255_138_66,
        0.344_190_716_523_637_53,
    ];

    #[test]
    fn f64_matches_the_reference_stream() {
        let mut rng = Rng::new(42);
        for (draw, want) in SEED_42_STREAM.iter().zip(SEED_42_F64) {
            let from_spec = (draw >> 11) as f64 * (1.0 / ((1u64 << 53) as f64));
            assert_eq!(from_spec, want, "SEED_42_F64 drifted from SEED_42_STREAM");
            assert_eq!(rng.f64(), want, "Rng::f64 drifted from the spec mapping");
        }
    }

    #[test]
    fn normal_samples_are_standard_gaussian() {
        let mut rng = Rng::new(4242);
        let n = 20_000;
        let samples: Vec<f64> = (0..n).map(|_| rng.normal()).collect();
        let mean = samples.iter().sum::<f64>() / n as f64;
        let var = samples.iter().map(|&x| (x - mean).powi(2)).sum::<f64>() / n as f64;
        assert!(mean.abs() < 0.05, "mean {mean} is not ~0");
        assert!(
            (var.sqrt() - 1.0).abs() < 0.05,
            "std {} is not ~1",
            var.sqrt()
        );
        // Every sample must be finite: no log(0) blow-ups.
        assert!(samples.iter().all(|x| x.is_finite()));
    }

    #[test]
    fn range_stays_in_bounds() {
        let mut rng = Rng::new(7);
        let mut seen = [false; 8];
        for _ in 0..4_000 {
            let value = rng.range(8);
            assert!(value < 8);
            seen[value] = true;
        }
        assert!(
            seen.iter().all(|&hit| hit),
            "range(8) never produced one of its values"
        );
    }

    #[test]
    #[should_panic(expected = "n > 0")]
    fn range_zero_panics() {
        let mut rng = Rng::new(0);
        let _ = rng.range(0);
    }

    #[test]
    fn shuffle_preserves_the_multiset() {
        let mut items: Vec<usize> = (0..64).collect();
        let mut rng = Rng::new(1234);
        rng.shuffle(&mut items);
        let mut sorted = items.clone();
        sorted.sort_unstable();
        assert_eq!(sorted, (0..64).collect::<Vec<_>>());
        // A shuffle of 64 elements is not the identity with overwhelming odds.
        assert_ne!(items, (0..64).collect::<Vec<_>>());
        // Deterministic for a given seed.
        let mut again = (0..64).collect::<Vec<_>>();
        Rng::new(1234).shuffle(&mut again);
        assert_eq!(items, again);
    }

    #[test]
    fn weighted_index_respects_the_weights() {
        let mut rng = Rng::new(5);
        let weights = [0.0, 1.0, 0.0];
        for _ in 0..100 {
            assert_eq!(rng.weighted_index(&weights), Some(1));
        }
        assert_eq!(rng.weighted_index(&[]), None);
        assert_eq!(rng.weighted_index(&[0.0, 0.0]), None);
    }

    #[test]
    fn state_round_trips() {
        let mut rng = Rng::new(11);
        for _ in 0..5 {
            let _ = rng.u64();
        }
        let checkpoint = rng.state();
        let expected: Vec<u64> = (0..10).map(|_| rng.u64()).collect();
        rng.set_state(checkpoint);
        let replayed: Vec<u64> = (0..10).map(|_| rng.u64()).collect();
        assert_eq!(expected, replayed);
    }
}

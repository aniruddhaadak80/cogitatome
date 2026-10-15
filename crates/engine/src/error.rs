//! Fallible error type shared by every module.

use std::fmt;

/// Every fallible operation in this crate returns `Result<T>`.
pub type Result<T> = std::result::Result<T, Error>;

/// The (small) set of ways a call into `cogitatome-engine` can be rejected.
///
/// Library code never panics on user input: bad shapes, empty slices,
/// malformed distributions and out-of-range token ids all surface as an
/// [`Error`] so that the caller (a web worker, a CLI, a test) decides how to
/// report it.
#[derive(Debug, Clone, PartialEq)]
#[non_exhaustive]
pub enum Error {
    /// A single slice did not have the length the operation requires.
    Length {
        /// Human-readable name of the offending argument.
        what: &'static str,
        /// Length the operation needs.
        expected: usize,
        /// Length the caller supplied.
        actual: usize,
    },
    /// Two slices that must agree in length did not.
    Mismatch {
        /// Name of the first slice.
        left: &'static str,
        /// Length of the first slice.
        left_len: usize,
        /// Name of the second slice.
        right: &'static str,
        /// Length of the second slice.
        right_len: usize,
    },
    /// A named contribution does not match the length of the vector it
    /// contributes to (used by [`logit_attribution`](crate::interp::logit_attribution)).
    ComponentLength {
        /// Name of the contribution.
        name: String,
        /// Length the target vector has.
        expected: usize,
        /// Length the contribution has.
        actual: usize,
    },
    /// A slice that must contain at least one element was empty.
    Empty(&'static str),
    /// A shape argument was structurally impossible (not square, not
    /// divisible, not a perfect square, larger than the maximum sequence, ...).
    Shape(&'static str),
    /// A value that must be finite was not.
    NonFinite(&'static str),
    /// A "probability vector" cannot be normalised (all mass is zero, or the
    /// total is not finite).
    Distribution(&'static str),
    /// An index was outside the valid range for the value it addressed.
    OutOfRange {
        /// Name of the indexed value.
        what: &'static str,
        /// Index the caller asked for.
        index: usize,
        /// Number of available elements.
        len: usize,
    },
    /// A token id was not part of the model's vocabulary.
    TokenOutOfRange {
        /// The offending token id.
        token: usize,
        /// Size of the vocabulary.
        vocab: usize,
    },
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Length {
                what,
                expected,
                actual,
            } => write!(f, "{what}: expected {expected} elements, got {actual}"),
            Error::Mismatch {
                left,
                left_len,
                right,
                right_len,
            } => write!(
                f,
                "{left} ({left_len}) and {right} ({right_len}) differ in length"
            ),
            Error::ComponentLength {
                name,
                expected,
                actual,
            } => write!(f, "{name}: expected {expected} elements, got {actual}"),
            Error::Empty(what) => write!(f, "{what}: must not be empty"),
            Error::Shape(what) => write!(f, "invalid shape: {what}"),
            Error::NonFinite(what) => write!(f, "{what}: expected a finite value"),
            Error::Distribution(what) => write!(f, "{what}: not a usable probability distribution"),
            Error::OutOfRange { what, index, len } => {
                write!(f, "{what}: index {index} out of range for {len} elements")
            }
            Error::TokenOutOfRange { token, vocab } => {
                write!(f, "token {token} out of range for vocabulary of {vocab}")
            }
        }
    }
}

impl std::error::Error for Error {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_mentions_the_offending_names() {
        let error = Error::Length {
            what: "matmul a",
            expected: 6,
            actual: 3,
        };
        assert_eq!(error.to_string(), "matmul a: expected 6 elements, got 3");

        let error = Error::Mismatch {
            left: "x",
            left_len: 4,
            right: "gamma",
            right_len: 3,
        };
        assert_eq!(error.to_string(), "x (4) and gamma (3) differ in length");

        let error = Error::Empty("tokens");
        assert_eq!(error.to_string(), "tokens: must not be empty");

        let error = Error::Shape("d_model must be divisible by n_heads");
        assert_eq!(
            error.to_string(),
            "invalid shape: d_model must be divisible by n_heads"
        );

        let error = Error::Distribution("distribution");
        assert_eq!(
            error.to_string(),
            "distribution: not a usable probability distribution"
        );

        let error = Error::NonFinite("eps");
        assert_eq!(error.to_string(), "eps: expected a finite value");

        let error = Error::OutOfRange {
            what: "position",
            index: 9,
            len: 3,
        };
        assert_eq!(
            error.to_string(),
            "position: index 9 out of range for 3 elements"
        );

        let error = Error::TokenOutOfRange {
            token: 101,
            vocab: 100,
        };
        assert_eq!(
            error.to_string(),
            "token 101 out of range for vocabulary of 100"
        );

        let error = Error::ComponentLength {
            name: "L0.attn".to_string(),
            expected: 8,
            actual: 4,
        };
        assert_eq!(error.to_string(), "L0.attn: expected 8 elements, got 4");

        // Every variant is a std Error, so it boxes and propagates.
        let boxed: Box<dyn std::error::Error> = Box::new(error);
        assert!(!boxed.to_string().is_empty());
        assert_eq!(Error::Empty("tokens"), Error::Empty("tokens"));
        assert_ne!(Error::Empty("tokens"), Error::Empty("logits"));
    }
}

//! The little bit of dense linear algebra the interpretability primitives need.
//!
//! [`superposition_score`](crate::interp::superposition_score) has to estimate
//! how many *effectively independent* directions a pile of activation vectors
//! carries, which means eigenvalues — and there is no `nalgebra` here. So this
//! module ships a compact, deterministic cyclic Jacobi solver for real
//! symmetric matrices: exact to machine precision for the small matrices this
//! crate cares about, and no dependencies.

use crate::error::{Error, Result};

/// Maximum number of Jacobi sweeps before the solver gives up and returns the
/// current diagonal.
const MAX_SWEEPS: usize = 64;

/// Relative tolerance used to decide that the off-diagonal mass is zero.
const TOLERANCE: f64 = 1e-12;

/// Dot product of two equally long slices.
///
/// # Errors
///
/// [`Error::Mismatch`] when the slices differ in length.
pub fn dot(a: &[f64], b: &[f64]) -> Result<f64> {
    if a.len() != b.len() {
        return Err(Error::Mismatch {
            left: "a",
            left_len: a.len(),
            right: "b",
            right_len: b.len(),
        });
    }
    Ok(a.iter().zip(b).map(|(&x, &y)| x * y).sum())
}

/// Euclidean length of `x`.
pub fn l2_norm(x: &[f64]) -> f64 {
    x.iter().map(|value| value * value).sum::<f64>().sqrt()
}

/// Cosine similarity, `0.0` when either vector has zero length.
///
/// # Errors
///
/// [`Error::Mismatch`] when the slices differ in length.
pub fn cosine_similarity(a: &[f64], b: &[f64]) -> Result<f64> {
    let na = l2_norm(a);
    let nb = l2_norm(b);
    if na == 0.0 || nb == 0.0 {
        return Ok(0.0);
    }
    Ok(dot(a, b)? / (na * nb))
}

/// Eigenvalues of a real symmetric matrix, computed by cyclic Jacobi rotations.
///
/// The result is returned in unspecified order (Jacobi converges in place), so
/// order-sensitive callers must sort. Values are accurate to roughly machine
/// epsilon for well-conditioned inputs; the solver stops as soon as the
/// off-diagonal Frobenius norm drops below `1e-12 · (1 + max|diagonal|)` or
/// after 64 sweeps, whichever comes first, which keeps it deterministic.
///
/// The input is symmetrised defensively (`a[i][j]` and `a[j][i]` are averaged),
/// because a caller building a Gram matrix from two float roundings rarely
/// produces an exactly symmetric matrix.
///
/// # Errors
///
/// [`Error::Empty`] when `a` has no rows, [`Error::Length`] when a row does not
/// have `a.len()` entries (i.e. the matrix is not square).
///
/// # Example
///
/// ```
/// use cogitatome_engine::linalg::eigenvalues_symmetric;
///
/// // [4 1; 1 4] has spectrum {3, 5}.
/// let mut eig = eigenvalues_symmetric(&[vec![4.0, 1.0], vec![1.0, 4.0]]).expect("square");
/// eig.sort_by(|a, b| a.partial_cmp(b).expect("finite"));
/// assert!((eig[0] - 3.0).abs() < 1e-12);
/// assert!((eig[1] - 5.0).abs() < 1e-12);
/// ```
pub fn eigenvalues_symmetric(a: &[Vec<f64>]) -> Result<Vec<f64>> {
    let n = a.len();
    if n == 0 {
        return Err(Error::Empty("matrix"));
    }
    for row in a {
        if row.len() != n {
            return Err(Error::Length {
                what: "matrix row",
                expected: n,
                actual: row.len(),
            });
        }
    }

    let mut m = vec![0.0; n * n];
    for i in 0..n {
        for j in 0..n {
            let value = 0.5 * (a[i][j] + a[j][i]);
            m[i * n + j] = value;
            m[j * n + i] = value;
        }
    }
    let mut scale: f64 = 0.0;
    for i in 0..n {
        scale = scale.max(m[i * n + i].abs());
    }

    let tolerance = TOLERANCE * (1.0 + scale);
    for _ in 0..MAX_SWEEPS {
        let mut off_sq = 0.0;
        for p in 0..n {
            for q in (p + 1)..n {
                off_sq += m[p * n + q] * m[p * n + q];
            }
        }
        if off_sq.sqrt() <= tolerance {
            break;
        }
        for p in 0..(n.saturating_sub(1)) {
            for q in (p + 1)..n {
                let apq = m[p * n + q];
                if apq.abs() <= tolerance {
                    continue;
                }
                rotate(&mut m, n, p, q, apq);
            }
        }
    }

    Ok((0..n).map(|i| m[i * n + i]).collect())
}

/// One Jacobi rotation annihilating the `(p, q)` off-diagonal entry of `m`.
///
/// Implements the standard `tau`-form update (Numerical Recipes §11.1), which
/// is the numerically stable variant of the naive `c`/`s` rotation.
fn rotate(m: &mut [f64], n: usize, p: usize, q: usize, apq: f64) {
    let app = m[p * n + p];
    let aqq = m[q * n + q];
    let theta = (aqq - app) / (2.0 * apq);
    let root = (theta * theta + 1.0).sqrt();
    let t = if theta >= 0.0 {
        1.0 / (theta + root)
    } else {
        -1.0 / (-theta + root)
    };
    let c = 1.0 / (1.0 + t * t).sqrt();
    let s = t * c;
    let tau = s / (1.0 + c);

    m[p * n + p] = app - t * apq;
    m[q * n + q] = aqq + t * apq;
    m[p * n + q] = 0.0;
    m[q * n + p] = 0.0;

    for r in 0..n {
        if r == p || r == q {
            continue;
        }
        let arp = m[r * n + p];
        let arq = m[r * n + q];
        let new_rp = arp - s * (arq + tau * arp);
        let new_rq = arq + s * (arp - tau * arq);
        m[r * n + p] = new_rp;
        m[p * n + r] = new_rp;
        m[r * n + q] = new_rq;
        m[q * n + r] = new_rq;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sorted(mut values: Vec<f64>) -> Vec<f64> {
        values.sort_by(|a, b| a.partial_cmp(b).expect("finite eigenvalues"));
        values
    }

    #[test]
    fn eigenvalues_of_a_diagonal_matrix_are_the_diagonal() {
        let eig = eigenvalues_symmetric(&[vec![2.0, 0.0], vec![0.0, 3.0]]).expect("square");
        assert_eq!(eig, vec![2.0, 3.0]);
    }

    #[test]
    fn eigenvalues_of_known_symmetric_matrices() {
        // [4 1; 1 4] has spectrum {3, 5}.
        let eig = sorted(eigenvalues_symmetric(&[vec![4.0, 1.0], vec![1.0, 4.0]]).expect("square"));
        assert!((eig[0] - 3.0).abs() < 1e-12);
        assert!((eig[1] - 5.0).abs() < 1e-12);

        // Identity: every eigenvalue is 1 and there are exactly n of them.
        let eye = vec![
            vec![1.0, 0.0, 0.0],
            vec![0.0, 1.0, 0.0],
            vec![0.0, 0.0, 1.0],
        ];
        assert_eq!(
            eigenvalues_symmetric(&eye).expect("square"),
            vec![1.0, 1.0, 1.0]
        );

        // [3 4; 4 0] solves lambda^2 - 3 lambda - 16 = 0.
        let eig = sorted(eigenvalues_symmetric(&[vec![3.0, 4.0], vec![4.0, 0.0]]).expect("square"));
        let root = 73.0_f64.sqrt();
        assert!((eig[0] - (3.0 - root) / 2.0).abs() < 1e-12);
        assert!((eig[1] - (3.0 + root) / 2.0).abs() < 1e-12);

        // Rank-one matrix [1 1; 1 1] has spectrum {0, 2}.
        let eig = sorted(eigenvalues_symmetric(&[vec![1.0, 1.0], vec![1.0, 1.0]]).expect("square"));
        assert!(eig[0].abs() < 1e-12);
        assert!((eig[1] - 2.0).abs() < 1e-12);
    }

    #[test]
    fn eigenvalues_trace_and_sum_of_squares_are_preserved() {
        // Jacobi rotations are similarity transforms, so the trace and the
        // Frobenius norm must survive.
        let a = vec![
            vec![2.0, -1.0, 0.5],
            vec![-1.0, 3.0, 0.25],
            vec![0.5, 0.25, -1.0],
        ];
        let eig = eigenvalues_symmetric(&a).expect("square");
        let trace: f64 = (0..3).map(|i| a[i][i]).sum();
        assert!((eig.iter().sum::<f64>() - trace).abs() < 1e-10);
        let frob: f64 = a.iter().flatten().map(|x| x * x).sum();
        let eig_norm: f64 = eig.iter().map(|x| x * x).sum();
        assert!((eig_norm - frob).abs() < 1e-10, "{eig:?} vs {frob}");
    }

    #[test]
    fn eigenvalues_reject_non_square_and_empty() {
        assert!(matches!(
            eigenvalues_symmetric(&[]),
            Err(Error::Empty("matrix"))
        ));
        assert!(matches!(
            eigenvalues_symmetric(&[vec![1.0, 0.0], vec![0.0]]),
            Err(Error::Length { .. })
        ));
    }

    #[test]
    fn dot_and_cosine_behave() {
        assert!(approx(dot(&[1.0, 2.0], &[3.0, 4.0]).expect("ok"), 11.0));
        assert!(dot(&[1.0], &[1.0, 2.0]).is_err());
        assert!(approx(l2_norm(&[3.0, 4.0]), 5.0));
        assert!(approx(
            cosine_similarity(&[1.0, 0.0], &[1.0, 0.0]).expect("ok"),
            1.0
        ));
        assert!(approx(
            cosine_similarity(&[1.0, 0.0], &[0.0, 1.0]).expect("ok"),
            0.0
        ));
        assert!(approx(cosine_similarity(&[0.0], &[1.0]).expect("ok"), 0.0));
        assert!(cosine_similarity(&[1.0], &[1.0, 0.0]).is_err());
    }

    fn approx(a: f64, b: f64) -> bool {
        (a - b).abs() < 1e-12
    }
}

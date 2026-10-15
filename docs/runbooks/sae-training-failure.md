# Runbook: SAE training failure

For "the features page shows NaN / flat loss / 100% dead".

1. **Loss curve first.** Final loss should be < 0.1, monotonically-ish
   falling. Flat at init = learning rate wrong for the data scale (default
   0.05 for unit-scale activations).
2. **L0 check.** Near the feature count = L1 not biting (raise `l1` from
   0.02). Exactly 0 = learning rate too high, everything died on step one.
3. **Dead rate.** >20% after 220 epochs = resampling failing; check
   `resampleEvery: 10` is intact and the seed is fixed (60602).
4. **Determinism.** Run twice, diff `finalLoss` to 6 decimals. Any drift =
   nondeterminism crept in (usually `Math.random` or iteration-order
   dependence). Grep and remove.
5. **Python worker.** Same symptoms via `POST /v1/sae/train`: check `epochs`,
   `l1`, and that `activations` is a non-empty 2-D array (422 otherwise).

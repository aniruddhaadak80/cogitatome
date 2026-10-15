# Activation patching

A probe tells you a property is *readable*. Patching tells you it is *used*:
splice an activation from one run into another and watch the output change. No
change, no causal claim.

## The experiment

1. **Baseline run.** Tokens A through the model → logits A.
2. **Source run.** Tokens B (different continuation) through the model.
3. **Patch.** Overwrite the residual stream at layer L, positions P, in the
   baseline run with the source run's values. Re-run from layer L onward.
4. **Measure.** The change in the target logit, per position.

`patchResidual` in `packages/core/src/interpret/patching.ts` implements this
by cloning the weights and injecting the spliced delta as a per-position bias
— documented in the source, mathematically the same as overwriting the
residual at that layer.

## The sweep

`patchingSweep` patches one position at a time (stride 1) and reports
`{position, magnitude, deltaNorm, effectOnTarget}` plus `causalStrength`:
the best single-position effect divided by the all-positions effect. A
causalStrength near 1 means one position carries the effect — the signature
of a narrow circuit.

Sanity checks the tests assert:

- Patching a run with *itself* changes nothing (idempotence).
- Patching from a different source changes the trace.
- `knockoutEffect` agrees with direct `ablateHead`.

## In the product

- `POST /api/v1/patch` (Python worker) runs sweeps as a job.
- The timeline page fingerprints every state, so a patched run can be diffed
  against the baseline checksum by checksum.
- The circuits page treats a strong patch effect as corroboration for a
  direct-logit-attribution edge: two independent measurements, one claim.

## The honest limit

Patching shows the output *depends* on the activation, not *how*. A position
can matter because it carries the answer or because it carries formatting the
answer rides on. The lab reports magnitudes; the interpretation is yours.

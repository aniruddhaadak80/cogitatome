# Probes and steering

A linear probe asks: is this property linearly readable from layer L? It is a
lower bound on what is easy to read out — not a window into the computation.

## The two tables

[/probes](http://localhost:3000/probes) fits logistic-regression probes
(gradient descent, seeded, L2-regularised) per layer for two properties:

- **Target:** "same as the previous token" — the exact signal an induction
  head must read. Expect accuracy and AUC to rise with depth.
- **Control:** "is symbol 1" — plain token identity, present from the
  embedding. Expect flat across layers.

Comparing the tables is the point. A property that goes from unreadable to
readable between two layers was computed somewhere in between.

## What probes do not prove

- **Readable ≠ used.** The model may compute a property and ignore it. Only
  patching upgrades readability to use.
- **Linear ≠ only.** A failed linear probe may still be readable non-linearly.
- **Correlation ≠ mechanism.** The probe direction is a readout, not a circuit.

The page states all three next to the tables.

## Steering (activation addition)

The flip side: add a vector to the residual stream and watch behaviour change.
`POST /v1/attribution` on the Python worker projects components onto a logit
direction; adding the refusal-direction vector flips answering to refusing in
larger models (see `2308.10248` in the corpus). The lab demonstrates the
mechanism on the toy: patch the token lane and the prediction follows.

## API

- `POST /api/v1/probes` — `{tokens?, property}` → per-layer accuracy, AUC,
  and the probe direction in model coordinates.
- `POST /v1/probes/fit` (Python worker) — raw activations and labels in,
  weights, bias, accuracy, ROC-AUC out.

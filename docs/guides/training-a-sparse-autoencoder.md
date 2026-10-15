# Training a sparse autoencoder

One MLP neuron fires for several unrelated reasons — that is superposition, and
it is why a neuron is a poor unit of explanation. A sparse autoencoder learns a
*wider* dictionary under an L1 penalty so each direction tends to mean one thing.

## What the lab trains on

[/features](http://localhost:3000/features) collects the constructed model's
MLP pre-activations at every stimulus position (both layers, 25 positions each)
and trains a real SAE: 48 features, L1 0.02, 220 epochs, seed 60602. Nothing
is mocked — `trainSae` in `packages/core/src/interpret/sae.ts` is plain
gradient descent with decoder renormalisation and dead-feature resampling.

## Reading the page

- **Loss curve.** Must fall monotonically-ish to a final loss under 0.1. A flat
  curve means the learning rate is wrong for the data scale.
- **L0.** Mean active features per sample — expect single digits. If L0 is near
  the feature count, the L1 penalty is not biting.
- **Explained variance.** Expect above 0.9 on this toy. Below 0.5 means the
  dictionary is too small or training diverged.
- **Dictionary rows.** Firing rate, max activation, and the symbols that wake
  each feature. A feature firing on one symbol is nameable; a feature firing
  on everything is superposition surviving.

## Dead features

A feature that never fires is resampled every 10 epochs from a real sample's
residual — the direction the model currently fails to explain. Resampling is
seeded, so the same run always revives the same features. The dead rate after
training should be under 20%.

## The Python worker

`POST /v1/sae/train` on `services/agents` trains the same algorithm over HTTP
(Adam + L1 + resampling, numpy only). The web page trains in-process; the
worker exists for heavier jobs. Both are deterministic for a fixed seed, and
`packages/sdk` speaks the same contract.

## What this does not prove

Superposition in a 32-dimensional MLP is the easy case. Production SAEs fight
feature splitting, absorption, and scale — the page says so explicitly. What
transfers is the mechanism: sparse dictionary, L1, resample the dead.

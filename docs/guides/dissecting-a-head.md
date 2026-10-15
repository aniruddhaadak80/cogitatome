# Dissecting a head

A head is the unit of movement in a transformer: it decides which earlier
positions get to speak, and how loudly. This guide reads one head the way the
lab intends — pattern first, numbers second, label last.

## The setup

Open [/dissect](http://localhost:3000/dissect) with the constructed model. The
stimulus is `^ a b c d` repeated six times (25 tokens). Symbol `0` (`^`) is a
reserved anchor: it absorbs position-0 edge effects so the measurements on real
tokens stay clean.

## Step 1: look at the pattern

Find the layer-0 attention matrices. Head 0's rows should look almost
diagonal-shifted: row `q` puts nearly all its mass on column `q-1`. That is a
previous-token head, and you can see it before measuring anything.

Head 1 in the same layer should look diffuse — that is the deliberate
distractor, routed into a noise lane so it cannot corrupt the answer.

## Step 2: measure it

[/heads](http://localhost:3000/heads) turns the picture into numbers:

| Signal | L0.H0 | What it means |
| ------ | ----- | ------------- |
| prev-token mass | 0.92 | mean weight on `j = i-1` |
| focus | high | 1 − normalised entropy |
| induction mass | low | it is not matching content |

Classification rule (`classifyHead` in `packages/core/src/interpret/heads.ts`):
prev-token mass above 0.5 earns the `previous-token` label. The rule is
documented next to the table because a label without its rule is marketing.

## Step 3: check what it writes

A head is a read *and* a write. L0.H0's value projection selects the token
subspace and its output projection writes into the *shifted* lane
(dims 16–31). After layer 0, position 3's shifted lane holds the code for
symbol 2 — the previous token. The constructed-model tests assert exactly
this (`packages/core/tests/constructed-model.test.ts`).

## Step 4: ablate it

The causal question is "does anything downstream read this?" Ablating L0.H0
(zeroing its output gain and re-running) collapses the learnable accuracy,
because L1.H0's key reads the lane L0.H0 writes. The API exposes this as
`ablationEffect`; the UI shows it on the timeline.

## What this does not prove

One head on one stimulus is an existence proof, not a general claim. The lab's
honesty rule: the random model, on the same stimulus, shows no previous-token
head — the control condition is always one click away (`?model=random`).

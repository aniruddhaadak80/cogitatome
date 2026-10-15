# Finding induction heads

Induction is the circuit behind in-context learning in small models: notice an
earlier occurrence of the current token, copy what followed it. This guide runs
the complete test the lab is built around.

## The theory in one paragraph

Two heads compose. A previous-token head writes "the token before me" into a
lane of the residual stream. An induction head's key reads that lane, so its
query ("my current token") matches keys ("the token before you") at exactly
the positions that precede an earlier occurrence. Its value then copies the
token at the matched position forward. Query matches previous-token; value
copies next-token. That offset of one is the whole trick.

## The test

1. Stimulus: `makeRepeated([1,2,3,4], 6)` — anchor plus six motif repeats.
2. Run the constructed model. Positions 0–4 cannot be right (the motif hasn't
   repeated yet — there is genuinely nothing to attend back to). Positions 5–23
   are *learnable*.
3. Score: learnable accuracy must be **19/19**. The random model scores 0/19.

```powershell
bun run check:induction
# learnable 19/19 = 1.000 · L0.H0 prev-token mass 0.9240 · L1.H0 match mass 0.6903
```

## The mechanism checks

Numbers that must hold simultaneously (all asserted in tests):

- **L0.H0 prev-token mass > 0.85.** The writer exists.
- **Shifted lane purity.** After layer 0, the shifted lane at each position
  holds only the previous token's code; the noise lane stays empty.
- **L1.H0 match mass > 0.5.** The reader attends to earlier occurrences.
- **Ablation destroys it.** Zeroing L1.H0 drops learnable accuracy below half.
- **K-composition lift 3.0.** `keyComposition` in weight space: the induction
  head's key reads precisely the 16 dimensions the previous-token head writes.

## Reading it in the UI

[/heads](http://localhost:3000/heads) shows the classification and the mass.
[/circuits](http://localhost:3000/circuits) shows the `qk` edge L0.H0 → L1.H0
with the lift as its weight. [/timeline](http://localhost:3000/timeline) shows
the per-position verdicts: five wrong (positions 0–4), then nineteen correct.

## If it ever fails

The failure mode is diagnostic: if accuracy drops but the masses hold, the
unembedding changed. If the masses drop, the attention changed. If K-lift
drops but behaviour holds, a distractor is writing into the lane. Each points
at a different file.

# Attention heads

Attention is the only operation that moves information between positions, so a
head is the unit of that movement. A head is four projections (Q, K, V, O)
plus a pattern: who attends to whom, how strongly.

The lab classifies heads structurally (`profileHeads` + `classifyHead`):
prev-token mass, focus (1 − normalised entropy), first-token mass, and the
K-composition signal. Roles: `previous-token`, `induction`, `copying`,
`positional`, `diffuse`, `attention-sink`. The constructed model contains a
previous-token head, an induction head, and two distractors — the classifier
must recover the first two and say "diffuse" about the rest.

Two heads compose when one's write lane is another's read lane
(`keyComposition`, lift over chance). Composition is the difference between a
bag of heads and a circuit. See `docs/diagrams/04-head-lifecycle.mmd`.

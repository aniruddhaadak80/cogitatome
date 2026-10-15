# Getting started

Five minutes from clone to your first checked claim.

## 1. Run it

```powershell
git clone https://github.com/aniruddhaadak80/cogitatome.git
cd cogitatome
bun install
bun run seed
bun run dev          # http://localhost:3000
```

No API keys. No database. No network. If the page loads, the lab works.

## 2. Open the model

Go to [/dissect](http://localhost:3000/dissect). You are looking at a real
forward pass of a two-layer transformer over the tokens `^ a b c d …`. Pick a
position on the slider and read where its residual stream went.

## 3. Check the one claim that matters

The constructed model implements induction: after the motif `a b c d` has been
seen once, every continuation is predicted by attending back to the earlier
occurrence. Verify it two ways:

```powershell
bun run check:induction
```

Expected: `learnable 19/19 = 1.000` for the constructed model, `0/19` for the
seeded random model. Then open [/heads](http://localhost:3000/heads) and confirm
the table says what the script says: L0.H0 is a previous-token head
(mass 0.92), L1.H0 is an induction head (mass 0.69).

## 4. Search the literature

[/corpus](http://localhost:3000/corpus) holds 573 harvested arXiv papers plus
hand-verified talks, essays, and threads. Try `induction head`, then
`superposition`, then `sleeper agents`. Search runs in-process with BM25.

## 5. Run the gates

```powershell
bun run typecheck
bun run lint
bun run test
bun run build
```

All four must be green before you change anything — that is your baseline.
If a gate is red on a fresh clone, open a bug report before doing anything else.

## Where next

- [Dissecting a head](dissecting-a-head.md) — read one head end to end.
- [Finding induction heads](finding-induction-heads.md) — the full test.
- [Corpus search](corpus-search.md) — facets, tags, and refresh.

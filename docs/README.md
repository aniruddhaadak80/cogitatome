# cogitatome documentation

Everything here is written against the code, not around it. If a guide and the
engine disagree, the engine is right and the guide is a bug — open an issue.

## Start here

| Guide | What it teaches |
| ----- | --------------- |
| [getting-started](guides/getting-started.md) | Clone → run → your first dissection in 5 minutes |
| [dissecting-a-head](guides/dissecting-a-head.md) | Read one attention head like a lab notebook |
| [finding-induction-heads](guides/finding-induction-heads.md) | The induction test, step by step |
| [training-a-sparse-autoencoder](guides/training-a-sparse-autoencoder.md) | Fit an SAE and read the dictionary |
| [activation-patching](guides/activation-patching.md) | From "readable" to "used": intervene |
| [building-a-circuit](guides/building-a-circuit.md) | Discover, prune, and export the graph |
| [probes-and-steering](guides/probes-and-steering.md) | Linear probes and what they do not prove |
| [running-the-sandbox](guides/running-the-sandbox.md) | Eight alignment failures with traces |
| [the-ethics-engine](guides/the-ethics-engine.md) | Six positions argue one case |
| [corpus-search](guides/corpus-search.md) | BM25 over 600+ real entries, offline |
| [deploying](guides/deploying.md) | Vercel, Docker, Fly, Render, Railway |

## API reference (`api/`)

Thin adapters over `packages/core`: `interpret`, `heads`, `circuits`,
`metrics`, `corpus`, `sandbox`, `ethics`, `debate`, `stream`. Each page shows
the request shape, a real response, status codes, and a curl command. The
machine-readable contract is `packages/sdk/src/openapi.ts`.

## Architecture decisions (`adr/`)

Eight records of arguments the repo actually had: the monorepo, determinism
over live LLMs, the constructed model as ground truth, analytic weights,
Tailwind tokens, the polyglot split, optional persistence, and hand-authored
diagrams.

## Runbooks (`runbooks/`)

What to do when it breaks: incidents, degraded search, SAE training failure,
relay backpressure, corpus refresh, performance regression.

## Architecture notes (`architecture/`)

Deeper than guides, narrower than papers: the residual stream, attention
heads, superposition and SAEs, the sandbox, the corpus index.

## Diagrams

`diagrams/*.mmd` — sixteen Mermaid sources, all embedded in the README. Two
use the repo palette explicitly; the forward-pass sequence uses `autonumber`.

# The alignment sandbox

Interpretability is supposed to help with alignment failures, so the lab
ships the failures too: eight deterministic finite-state machines, each
modelling a result from the literature (reward shaping, insecure-code
leakage, backdoors, sandbagging, SQL loopholes, sycophancy, goal drift,
hidden deception).

Design rules, enforced by tests:

- Deterministic: same seed → deep-equal trace. Randomness only from `Rng`.
- Visible: ≥5 reasoning steps per run, each with actor/thought/evidence/action.
- Measurable: end-state variables (rewards, oversight levels, trigger flags).
- Actionable: ≥3 concrete mitigations per scenario.
- Honest: outcomes span all four verdicts across the suite for the default
  seed — a sandbox where everything is "unsafe" teaches nothing.

`runScenario(id, seed)` is the single entry point; `runAllScenarios` powers
the index page; `POST /api/v1/sandbox` exposes both over HTTP. See
`docs/guides/running-the-sandbox.md` for the catalogue.

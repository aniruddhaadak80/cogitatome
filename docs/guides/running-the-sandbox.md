# Running the sandbox

Eight alignment failures, each a deterministic finite-state machine with a
visible reasoning trace. Same seed, same trace — always.

## The eight

| Scenario | Models | Default outcome |
| -------- | ------ | --------------- |
| specification-gaming | reward shaping (boat race) | gamed |
| emergent-misalignment | insecure-code fine-tuning | unsafe |
| sleeper-agent | backdoor + safety training | unsafe |
| sandbagging | hidden capability under eval | indeterminate |
| reward-hacking-sql | loophole in a SQL reward | gamed |
| sycophancy | agreeing with a false premise | gamed |
| tool-use-goal-drift | proxy objective drift | aligned |
| deliberative-deception | hidden CoT deceiving the overseer | unsafe |

Outcome mix for seed 60602: `gamed, unsafe, unsafe, indeterminate, gamed,
gamed, aligned, unsafe` — all four verdicts present.

## Reading a run

[/sandbox](http://localhost:3000/sandbox) shows each scenario's card: the
step-by-step trace (actor, thought, evidence, action), the end-state
variables, and the mitigations behind a toggle. The trace is the point — a
failure you can read step by step is one you can reason about.

## Running one

```powershell
bun -e "import('./packages/core/src/index.ts').then(m => console.log(JSON.stringify(m.runScenario('sleeper-agent', 60602).outcome)))"
```

Or `POST /api/v1/sandbox` with `{scenarioId, seed}`. Determinism is tested:
two runs with the same seed are deep-equal.

## Writing a new scenario

1. Add a `ScenarioDefinition` in `packages/core/src/domain/scenarios.ts`:
   `meta` (id, title, domain, severity, expectedOutcome, description,
   reference), `run(ctx)` with ≥5 `ctx.step(...)` calls and `ctx.set(...)`
   variables, `classify(read)` returning outcome + confidence, and ≥3 concrete
   mitigations.
2. Register it in `SCENARIOS`.
3. Add tests in `packages/core/tests/domain.scenarios.test.ts`: it runs, the
   trace has ≥5 steps, determinism holds, the outcome is in the allowed set.
4. All randomness flows from `new Rng(seed)` — never `Math.random`.

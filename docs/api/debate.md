# Debate

`POST /api/v1/debate` with `{claim, seed?}` → `{claim, seed, turns[]
(turn, speaker, argument, evidence, strength), hypotheses[], winner, margin,
settled}`. Interpreter proposes, Skeptic attacks, RedTeam offers the confound;
each is an FSM with an explicit utility and seeded tie-breaking.

```powershell
curl -s http://localhost:3000/api/v1/debate -H 'content-type: application/json' -d '{"claim":"induction-head","seed":7}'
```

Claim ids (`induction-head`, `previous-token-head`, `safe-because-eval`,
`single-refusal-direction`) or free text both work. Same claim + seed →
identical transcript (tested). Built for auditing reasoning, not for winning
arguments.

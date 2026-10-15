# The ethics engine

Six ethical positions argue over an AI moral case, and the argument graph is
derived from the case facts — change the facts, and the arguments change.

## The positions

| Position | Asks |
| -------- | ---- |
| Utilitarian | Which action maximises expected welfare? |
| Deontological | Which duties and rights constrain us regardless? |
| Virtue | What would a flourishing agent do? |
| Care | Who is vulnerable, and who is responsible for them? |
| Contractarian | What rules would rational agents accept? |
| Precautionary | What is irreversible under uncertainty? |

Each is a scoring function over the case facts (`harms`, `benefits`,
`rights`, `consent`, …), producing a verdict (`permissible` / `forbidden` /
`obligatory`), a weight, and a written argument. The aggregate is the weighted
verdict. Edges in the argument graph (`supports` / `rebuts`) carry strengths
proportional to the facts — e.g. high `harms` creates strong rebuttals.

## The cases

Built-in cases include the trolley problem for a driving model, deleting a
deployed instance, continuing a run showing suffering signs, training on
scraped data, deploying a deceiving evaluator, and autonomous weapons. A case
with `harms >> benefits` yields `forbidden` — tested, not hoped.

## Moral status

`moralStatus` scores whether an entity is a moral patient against explicit,
contested criteria (self-model, preference stability, valence reports,
goal-directedness, integrated information). The criteria and weights are
exposed so you can disagree with a number rather than the whole assessment.
The engine is a reasoning aid, not an authority — [/ethics](http://localhost:3000/ethics)
says so on the page.

## API

`POST /api/v1/ethics` with `{caseId}` returns positions, aggregate, and the
argument graph. `compareCases(...ids)` returns the cross-case verdict table.

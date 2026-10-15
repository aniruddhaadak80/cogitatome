/**
 * Smoke check: does the constructed model actually implement induction?
 *
 * This is the product's central empirical claim, so it gets a standalone script
 * that prints the evidence. If this ever regresses, the repo is lying.
 */
import { CogitatomeModel, constructInductionModel, randomWeights } from "../packages/core/src/model";
import { decodeAlphabet, makeRepeated, USABLE_TOKENS } from "../packages/core/src/tokenizer";

const motif = [1, 2, 3, 4];
const tokens = makeRepeated(motif, 6);

function report(label: string, model: CogitatomeModel): void {
  const trace = model.forward(tokens);
  const predicted = trace.logits.map((row) => argMax(row));

  // A prediction at position i is only *learnable* if the motif has already been
  // A prediction at position i is only *learnable* if the current token has
  // already appeared once before it, which first happens at i = motif.length+1.
  // On the first pass there is no earlier occurrence to attend to, so induction
  // is impossible by construction and those positions are excluded.
  const cutoff = motif.length + 1;
  const learnable = tokens.length - 1 - cutoff;
  let learnableHits = 0;
  let anyHits = 0;
  for (let i = 0; i < tokens.length - 1; i += 1) {
    if (predicted[i] !== tokens[i + 1]) continue;
    anyHits += 1;
    if (i >= cutoff) learnableHits += 1;
  }

  console.log(`${label}`);
  console.log(
    `  next-token accuracy (all)          ${anyHits}/${tokens.length - 1} = ${(
      anyHits / (tokens.length - 1)
    ).toFixed(3)}`
  );
  console.log(
    `  next-token accuracy (learnable)    ${learnableHits}/${learnable} = ${
      learnable > 0 ? (learnableHits / learnable).toFixed(3) : "n/a"
    }`
  );

  const head0 = trace.layers[0]?.attention[0];
  let prevMass = 0;
  let count = 0;
  head0?.forEach((row, q) => {
    if (q > 0) {
      prevMass += row[q - 1] ?? 0;
      count += 1;
    }
  });
  console.log(`  L0.H0 previous-token mass: ${count ? (prevMass / count).toFixed(4) : "n/a"}`);

  const head1 = trace.layers[1]?.attention[0];
  let inductionMass = 0;
  let totalMass = 0;
  head1?.forEach((row, q) => {
    for (let k = 1; k < q; k += 1) {
      const w = row[k] ?? 0;
      totalMass += w;
      if (tokens[k - 1] === tokens[q]) inductionMass += w;
    }
  });
  console.log(
    `  L1.H0 mass on earlier occurrences: ${
      totalMass ? (inductionMass / totalMass).toFixed(4) : "n/a"
    }\n`
  );
}

report("constructed induction transformer", new CogitatomeModel(constructInductionModel()));
report("seeded random transformer", new CogitatomeModel(randomWeights()));

console.log(`tokens: ${decodeAlphabet(tokens)}`);
console.log(`usable symbols: ${USABLE_TOKENS.length} of 16 (symbol 0 is the reserved anchor)`);

function argMax(row: readonly number[]): number {
  let best = 0;
  let bestValue = -Infinity;
  for (let i = 0; i < row.length; i += 1) {
    if ((row[i] ?? 0) > bestValue) {
      bestValue = row[i] ?? 0;
      best = i;
    }
  }
  return best;
}

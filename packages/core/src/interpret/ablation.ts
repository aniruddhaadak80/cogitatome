/**
 * Ablation sweep — remove every head, one at a time, and rank them.
 *
 * `heads.ts` provides `ablationEffect` for a single head. This module runs the
 * full sweep over every (layer, head) pair and produces a ranking, which is
 * the standard first-pass causal analysis: which heads does the model actually
 * need for this computation?
 *
 * Importance is measured as the drop in top logit at the final position when
 * the head is removed. A large negative delta means the head was carrying the
 * answer; a delta near zero means it was decorative. The ranking is normalised
 * so the most important head has importance 1.0.
 *
 * The sweep is deterministic: the same model and tokens always produce the
 * same ranking.
 */
import type { CogitatomeModel } from "../model";
import { type NumberVector } from "../math";
import type { AblationRow, AblationSweep } from "../types";

/**
 * Run the full ablation sweep over every head in the model.
 *
 * For each head, the model is run with that head's output gain zeroed. The
 * effect is measured as the change in top logit at the final position, plus
 * how many positions changed their greedy prediction.
 *
 * @param model The model to ablate.
 * @param tokens The input sequence.
 * @param cutoff Positions before this are not learnable (motif hasn't repeated).
 */
export function ablationSweep(
  model: CogitatomeModel,
  tokens: readonly number[],
  cutoff = 0
): AblationSweep {
  const baseline = model.forward(tokens);
  const baselineArgmax = baseline.logits.map((row) => argMax(row));
  const baselineTop = topLogit(baseline.logits[baseline.logits.length - 1] ?? []);

  const rows: AblationRow[] = [];
  for (let l = 0; l < model.config.nLayers; l += 1) {
    for (let h = 0; h < model.config.nHeads; h += 1) {
      const ablated = model.ablateHead(tokens, l, h);
      const ablatedArgmax = ablated.logits.map((row) => argMax(row));
      const ablatedTop = topLogit(ablated.logits[ablated.logits.length - 1] ?? []);
      const delta = ablatedTop - baselineTop;

      let positionsChanged = 0;
      let learnableFlipped = 0;
      for (let i = 0; i < baselineArgmax.length; i += 1) {
        if (baselineArgmax[i] !== ablatedArgmax[i]) {
          positionsChanged += 1;
          if (i >= cutoff && baselineArgmax[i] === tokens[i + 1]) {
            learnableFlipped += 1;
          }
        }
      }

      rows.push({
        layer: l,
        head: h,
        baselineTopLogit: baselineTop,
        ablatedTopLogit: ablatedTop,
        delta,
        positionsChanged,
        learnableFlipped,
        importance: 0 // filled below
      });
    }
  }

  // Normalise importance so the most damaging ablation has importance 1.0.
  let maxAbs = 0;
  for (const row of rows) {
    if (Math.abs(row.delta) > maxAbs) maxAbs = Math.abs(row.delta);
  }
  const normalised = rows.map((row) => ({
    ...row,
    importance: maxAbs > 0 ? Math.abs(row.delta) / maxAbs : 0
  }));

  // Sort by importance descending.
  const sorted = [...normalised].sort((a, b) => b.importance - a.importance);
  const mostImportant = sorted.length > 0 ? { layer: sorted[0]!.layer, head: sorted[0]!.head } : null;
  const leastImportant =
    sorted.length > 0
      ? { layer: sorted[sorted.length - 1]!.layer, head: sorted[sorted.length - 1]!.head }
      : null;

  return { rows: normalised, mostImportant, leastImportant };
}

/** Rank heads by ablation importance, most important first. */
export function rankByImportance(
  sweep: AblationSweep
): readonly { readonly layer: number; readonly head: number; readonly importance: number }[] {
  return [...sweep.rows]
    .sort((a, b) => b.importance - a.importance)
    .map((r) => ({ layer: r.layer, head: r.head, importance: r.importance }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function argMax(row: NumberVector): number {
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

function topLogit(logits: NumberVector): number {
  let best = -Infinity;
  for (const value of logits) if (value > best) best = value;
  return best === -Infinity ? 0 : best;
}

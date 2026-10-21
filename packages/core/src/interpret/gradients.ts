/**
 * Token attribution — which input tokens matter for the prediction.
 *
 * Traditional integrated gradients (Sundararajan et al., 2017) require a
 * continuous input space. A transformer's input is discrete token IDs, so the
 * technique is adapted: for each position, the token is replaced with a
 * baseline and the change in the target logit is measured. This is the discrete
 * analog of a gradient — "how much does this token contribute to the answer?"
 *
 * The baseline is token 0 (the reserved anchor symbol), which is the natural
 * "null" input for this model. The importance score is the absolute change in
 * target logit, normalised so the most important position scores 1.0.
 *
 * This complements the ablation sweep (which removes *heads*) and the logit
 * attribution (which splits the *residual stream*): token attribution isolates
 * the input side of the computation.
 */
import type { CogitatomeModel } from "../model";
import type { GradientAttribution, GradientReport } from "../types";

/**
 * Compute token attribution for a target prediction.
 *
 * For each position `i`, the model is run with `tokens[i]` replaced by the
 * baseline token (0). The importance of position `i` is the absolute change in
 * the target logit at the target position. Positions whose replacement has a
 * large effect are the ones the model is "reading" to make its prediction.
 *
 * @param model The model to attribute.
 * @param tokens The input sequence.
 * @param targetToken The token whose logit we attribute.
 * @param targetPosition The position to read the logit from (default: last).
 * @param baseline The replacement token (default: 0, the anchor).
 */
export function tokenAttribution(
  model: CogitatomeModel,
  tokens: readonly number[],
  targetToken: number,
  targetPosition: number = tokens.length - 1,
  baseline: number = 0
): GradientReport {
  const original = model.forward(tokens);
  const baselineLogit = original.logits[targetPosition]?.[targetToken] ?? 0;

  const attributions: GradientAttribution[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const modified = tokens.map((t, idx) => (idx === i ? baseline : t));
    const trace = model.forward(modified);
    const logit = trace.logits[targetPosition]?.[targetToken] ?? 0;
    attributions.push({
      token: tokens[i] ?? -1,
      position: i,
      importance: Math.abs(logit - baselineLogit),
      normalised: 0
    });
  }

  // Normalise so the most important position has importance 1.0.
  let maxImportance = 0;
  for (const attr of attributions) {
    if (attr.importance > maxImportance) maxImportance = attr.importance;
  }
  const normalised = attributions.map((attr) => ({
    ...attr,
    normalised: maxImportance > 0 ? attr.importance / maxImportance : 0
  }));

  return {
    targetToken,
    targetPosition,
    attributions: normalised,
    steps: 1
  };
}

/**
 * The positions ranked by attribution importance, most important first.
 */
export function rankByAttribution(
  report: GradientReport
): readonly { readonly position: number; readonly token: number; readonly importance: number }[] {
  return [...report.attributions]
    .sort((a, b) => b.importance - a.importance)
    .map((a) => ({ position: a.position, token: a.token, importance: a.importance }));
}

/**
 * A human-readable summary: "position P (token T) contributes X% of the signal".
 */
export function attributionSummary(report: GradientReport): string[] {
  const ranked = rankByAttribution(report);
  const total = ranked.reduce((s, r) => s + r.importance, 0);
  if (total === 0) return ["No position contributes measurably to this prediction."];
  return ranked.slice(0, 5).map((r) => {
    const pct = ((r.importance / total) * 100).toFixed(1);
    return `Position ${r.position} (token ${r.token}): ${pct}% of the signal`;
  });
}

import {
  CogitatomeModel,
  constructInductionModel,
  decodeAlphabet,
  makeRepeated
} from "@repo/core";
import { attributionSummary, tokenAttribution } from "@repo/core";

/**
 * Token attribution — which input tokens matter for the prediction.
 *
 * Discrete analog of integrated gradients: replace each token with the baseline
 * (the reserved anchor symbol 0) and measure the change in the target logit.
 * Positions whose replacement changes the answer most are the ones the model
 * is "reading" to predict.
 */
export const dynamic = "force-dynamic";

const MOTIF = [1, 2, 3, 4];

function fmt(n: number): string {
  return n.toFixed(3);
}

function bar(width: number): string {
  return width.toFixed(2);
}

export default function AttributionPage() {
  const model = new CogitatomeModel(constructInductionModel());
  const tokens = makeRepeated(MOTIF, 6);
  const targetPosition = tokens.length - 1;
  const targetToken = tokens[targetPosition] ?? 0;
  const report = tokenAttribution(model, tokens, targetToken, targetPosition);
  const ranked = attributionSummary(report);

  return (
    <div className="gutter py-10">
      <header className="max-w-3xl">
        <p className="mono-label">attribution</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          Token attribution — what the model reads to predict
        </h1>
        <p className="mt-3 text-ink-dim">
          Discrete analog of integrated gradients: replace each token with the
          reserved anchor symbol 0 and measure how much the target logit moves.
          A position whose replacement changes the logit a lot is one the model
          is &quot;reading&quot; to make its prediction; a position near zero is ignored.
        </p>
      </header>

      <dl className="mt-6 flex flex-wrap gap-3">
        <div className="panel px-3 py-2">
          <dt className="mono-label">target</dt>
          <dd className={`font-display text-xl font-semibold text-cyan`}>
            position {targetPosition} · token {targetToken} ({decodeAlphabet([targetToken]).trim()})
          </dd>
        </div>
        <div className="panel px-3 py-2">
          <dt className="mono-label">positions that matter</dt>
          <dd className="font-display text-xl font-semibold text-ink">
            {report.attributions.filter((a) => a.importance > 0.05).length}
          </dd>
        </div>
      </dl>

      <section className="mt-10 overflow-x-auto panel p-4">
        <table className="w-full min-w-[44rem] border-collapse text-sm">
          <caption className="sr-only">Token attribution ranked by importance</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase text-slate">
              <th className="py-2 pr-4 font-medium">Rank</th>
              <th className="py-2 pr-4 font-medium">Position</th>
              <th className="py-2 pr-4 font-medium">Token</th>
              <th className="py-2 font-medium">Importance</th>
            </tr>
          </thead>
          <tbody>
            {report.attributions.map((a, i) => (
              <tr key={a.position} className="border-b border-line/60">
                <td className="py-2.5 pr-4 font-mono text-xs text-ink-dim">{i + 1}</td>
                <td className="py-2.5 pr-4 font-mono text-xs text-ink">
                  Position {a.position}
                </td>
                <td className="py-2.5 pr-4 font-mono text-xs text-ink-dim">
                  {decodeAlphabet([a.token]).trim()}
                </td>
                <td className="py-2.5 pr-4">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-[120px] rounded-full bg-indigo/20 overflow-hidden">
                      <div className="h-full rounded-full bg-cyan" style={{ width: bar(a.normalised * 100) + "%" }} />
                    </div>
                    <span className="font-mono text-xs tabular-nums text-ink">{fmt(a.normalised)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-10" aria-labelledby="summary">
        <h2 id="summary" className="font-display text-lg font-semibold">Readout</h2>
        <ul className="mt-3 space-y-2 font-mono text-sm text-ink-dim">
          {ranked.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </section>

      <p className="mt-6 text-xs text-ink-dim">
        The equivalent report is at <code className="font-mono">/api/v1/attribution</code>,
        and the ablation sweep that isolates head-level causation is at
        <code className="font-mono">/api/v1/ablation</code>.
      </p>
    </div>
  );
}

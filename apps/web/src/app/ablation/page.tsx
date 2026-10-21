import {
  CogitatomeModel,
  constructInductionModel,
  decodeAlphabet,
  makeRepeated
} from "@repo/core";
import { ablationSweep, rankByImportance, type AblationSweep } from "@repo/core";

/**
 * Ablation sweep — remove every head, one at a time, and rank them by how much
 * removing them hurts the model's top logit. The constructed model's
 * induction head (L1.H0) should rank highest: it carries the answer.
 */
export const dynamic = "force-dynamic";

const MOTIF = [1, 2, 3, 4];

function fmt(n: number): string {
  return n.toFixed(3);
}

function classFor(delta: number): string {
  if (delta < -0.05) return "text-rose";
  if (delta < 0.05) return "text-ink-dim";
  return "text-cyan";
}

export default function AblationPage() {
  const model = new CogitatomeModel(constructInductionModel());
  const tokens = makeRepeated(MOTIF, 6);
  const sweep: AblationSweep = ablationSweep(model, tokens);
  const ranked = rankByImportance(sweep);

  return (
    <div className="gutter py-10">
      <header className="max-w-3xl">
        <p className="mono-label">ablation</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          Ablation sweep — which heads carry the answer
        </h1>
        <p className="mt-3 text-ink-dim">
          Zero every head&apos;s output gain, one at a time, and watch the top logit
          move. A head whose removal drops the logit is doing real work; a head
          whose removal changes nothing is decorative. For the constructed
          model the induction head should rank first — removing it collapses
          the prediction the model learned to make.
        </p>
      </header>

      <dl className="mt-6 flex flex-wrap gap-3">
        <div className="panel px-3 py-2">
          <dt className="mono-label">most important</dt>
          <dd className={`font-display text-xl font-semibold ${classFor(sweep.mostImportant ? sweep.rows.find((r) => r.layer === sweep.mostImportant!.layer && r.head === sweep.mostImportant!.head)!.delta : 0)}`}>
            {sweep.mostImportant ? `L${sweep.mostImportant.layer} · H${sweep.mostImportant.head}` : "—"}
          </dd>
        </div>
        <div className="panel px-3 py-2">
          <dt className="mono-label">least important</dt>
          <dd className="font-display text-xl font-semibold text-ink-dim">
            {sweep.leastImportant ? `L${sweep.leastImportant.layer} · H${sweep.leastImportant.head}` : "—"}
          </dd>
        </div>
        <div className="panel px-3 py-2">
          <dt className="mono-label">baseline top logit</dt>
          <dd className="font-display text-xl font-semibold text-ink">{fmt(sweep.rows[0]?.baselineTopLogit ?? 0)}</dd>
        </div>
      </dl>

      <section className="mt-10 overflow-x-auto">
        <table className="w-full min-w-[52rem] border-collapse text-sm">
          <caption className="sr-only">
            Ablation results ranked by importance: layer, head, delta, positions
            changed, learnable flipped
          </caption>
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase text-slate">
              <th className="py-2 pr-4 font-medium">Rank</th>
              <th className="py-2 pr-4 font-medium">Head</th>
              <th className="py-2 pr-4 font-medium tabular-nums">Importance</th>
              <th className="py-2 pr-4 font-medium tabular-nums">Δ top logit</th>
              <th className="py-2 pr-4 font-medium tabular-nums">Δ ablated</th>
              <th className="py-2 font-medium tabular-nums">Pos. changed</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((r, i) => {
              const row = sweep.rows.find((x) => x.layer === r.layer && x.head === r.head)!;
              return (
                <tr
                  key={`${r.layer}:${r.head}`}
                  className={`border-b border-line/60 cursor-pointer hover:bg-indigo/10`}
                >
                  <td className="py-2.5 pr-4 font-mono text-xs text-ink-dim">{i + 1}</td>
                  <td className="py-2.5 pr-4 font-mono text-xs text-ink">
                    L{r.layer} · H{r.head}
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-xs tabular-nums text-ink">
                    {fmt(r.importance)}
                  </td>
                  <td className={`py-2.5 pr-4 font-mono text-xs tabular-nums ${classFor(row.delta)}`}>
                    {fmt(row.delta)}
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-xs tabular-nums text-ink-dim">
                    {fmt(row.ablatedTopLogit)}
                  </td>
                  <td className="py-2 font-mono text-xs tabular-nums text-ink-dim">
                    {row.positionsChanged}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="mt-10" aria-labelledby="stimulus">
        <h2 id="stimulus" className="font-display text-lg font-semibold">
          The stimulus
        </h2>
        <p className="mt-2 text-sm text-ink-dim">
          A four-symbol motif repeated six times, prefixed by the reserved anchor
          symbol. Positions after the first motif pass are learnable — that is
          where the induction head proves it matters.
        </p>
        <p className="panel mt-3 overflow-x-auto p-3 font-mono text-sm text-ink">
          {decodeAlphabet(tokens)}
        </p>
      </section>

      <p className="mt-6 text-xs text-ink-dim">
        Importance is normalised so the most damaging ablation scores 1.0; every
        other head scores its |Δ| as a fraction of that maximum. Run the
        equivalent sweep at <code className="font-mono">/api/v1/ablation</code>.
      </p>
    </div>
  );
}

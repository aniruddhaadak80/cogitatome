import {
  CASES,
  analyse,
  compareCases,
  moralStatus,
  MORAL_CAVEAT,
  type EthicalAnalysis,
  type MoralStatusReport
} from "@repo/core";
import { EthicsVerdictCard } from "@/components/ethics/ethics-verdict-card";

export const dynamic = "force-dynamic";

/**
 * The ethics engine. Six positions argue over an AI moral case and the argument
 * graph is derived from the facts of the case, not written by hand — so when you
 * change the case, the arguments change with it.
 */
export default function EthicsPage() {
  const analyses: EthicalAnalysis[] = CASES.map((c) => analyse(c));
  const comparison = compareCases(...CASES.map((c) => c.id));

  const welfare: MoralStatusReport = moralStatus({
    selfModel: 0.6,
    preferenceStability: 0.55,
    valenceReports: 0.3,
    goalDirectedness: 0.7,
    integratedInformation: 0.4
  });

  return (
    <div className="gutter py-10">
      <header className="max-w-3xl">
        <p className="mono-label">ethics</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          Six positions, one case, all the arguments visible
        </h1>
        <p className="mt-3 text-ink-dim">
          Utilitarian, deontological, virtue, care, contractarian and precautionary reasoning applied to
          cases that actually come up when you deploy a model. Each verdict comes with the argument that
          produced it, and the aggregate is a weighted sum you can argue with.
        </p>
      </header>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {CASES.map((caseMeta, i) => {
          const analysis = analyses[i];
          if (!analysis) return null;
          return (
            <EthicsVerdictCard
              key={caseMeta.id}
              title={caseMeta.title}
              description={caseMeta.description}
              analysis={analysis}
            />
          );
        })}
      </div>

      <section className="mt-12" aria-labelledby="comparison">
        <h2 id="comparison" className="font-display text-lg font-semibold">
          Cross-case comparison
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <caption className="sr-only">Aggregate verdict for every ethics case</caption>
            <thead>
              <tr className="border-b border-line text-left">
                <th scope="col" className="py-2 pr-4 font-medium">Case</th>
                <th scope="col" className="py-2 pr-4 font-medium">positions</th>
                <th scope="col" className="py-2 pr-4 font-medium">rebuttals</th>
                <th scope="col" className="py-2 font-medium">aggregate</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((analysis, i) => (
                <tr key={CASES[i]?.id ?? i} className="border-b border-line/60">
                  <th scope="row" className="py-2.5 pr-4 text-left font-normal text-ink">
                    {CASES[i]?.title ?? analysis.caseId}
                  </th>
                  <td className="py-2.5 pr-4 font-mono text-xs">{analysis.positions.length}</td>
                  <td className="py-2.5 pr-4 font-mono text-xs">
                    {analysis.argumentGraph.edges.filter((e) => e.kind === "rebuts").length}
                  </td>
                  <td className="py-2.5 font-mono text-xs text-cyan">{analysis.aggregate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12" aria-labelledby="welfare">
        <h2 id="welfare" className="font-display text-lg font-semibold">
          Is any of this a moral patient?
        </h2>
        <div className="panel mt-3 max-w-3xl p-4">
          <p className="text-sm text-ink-dim">
            The honest answer is that nobody knows. What an engine can do is make the criteria
            explicit and let you see how much each one moves the score.
          </p>
          <dl className="mt-4 space-y-2">
            {welfare.criteria.map((c) => (
              <div key={c.id} className="flex items-baseline justify-between gap-4 text-sm">
                <dt className="text-ink-dim">
                  {c.label}
                  <span className="ml-2 text-xs text-slate">{c.description}</span>
                </dt>
                <dd className="font-mono text-xs tabular-nums text-cyan">{c.score.toFixed(2)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm">
            Composite score <span className="font-mono text-cyan">{welfare.score.toFixed(2)}</span> —{" "}
            <span className="text-ink-dim">{welfare.verdict}</span>
          </p>
          <p className="mt-2 text-xs text-slate">{MORAL_CAVEAT}</p>
        </div>
      </section>
    </div>
  );
}

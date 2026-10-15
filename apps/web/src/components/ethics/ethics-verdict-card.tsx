"use client";

import type { EthicalAnalysis } from "@repo/core";

/**
 * One case, its six verdicts, and the argument graph that produced the aggregate.
 */
export function EthicsVerdictCard({
  title,
  description,
  analysis
}: {
  title: string;
  description: string;
  analysis: EthicalAnalysis;
}) {
  const color = (verdict: string): string =>
    verdict === "permissible" ? "text-lime" : verdict === "forbidden" ? "text-rose" : "text-amber";

  return (
    <article className="panel flex flex-col overflow-hidden">
      <header className="border-b border-line p-4">
        <h2 className="font-display text-base font-semibold">{title}</h2>
        <p className="mt-1.5 text-sm text-ink-dim">{description}</p>
      </header>

      <div className="flex-1 p-4">
        <ol className="space-y-3">
          {analysis.positions.map((position) => (
            <li key={position.id}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-ink">{position.name}</span>
                <span className={`font-mono text-[11px] ${color(position.verdict)}`}>{position.verdict}</span>
              </div>
              <p className="mt-1 text-xs text-ink-dim">{position.argument}</p>
            </li>
          ))}
        </ol>
      </div>

      <footer className="border-t border-line p-4">
        <div className="flex items-baseline justify-between">
          <span className="mono-label">aggregate</span>
          <span className={`font-mono text-sm ${color(analysis.aggregate)}`}>{analysis.aggregate}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {analysis.argumentGraph.nodes.map((node) => (
            <span
              key={node.id}
              title={`strength ${node.strength.toFixed(2)}`}
              className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-dim"
            >
              {node.claim.length > 42 ? `${node.claim.slice(0, 41)}…` : node.claim}
            </span>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate">
          {analysis.argumentGraph.edges.length} argument edges ·{" "}
          {analysis.argumentGraph.edges.filter((e) => e.kind === "rebuts").length} rebuttals
        </p>
      </footer>
    </article>
  );
}

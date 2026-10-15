"use client";

import { useMemo, useState } from "react";
import type { ForwardTrace } from "@repo/core";

/**
 * The interactive half of the dissection bench: position selector, per-layer
 * attention matrices, and the residual stream decomposition at the chosen
 * position.
 */
export function DissectView({ trace, tokens }: { trace: ForwardTrace; tokens: readonly number[] }) {
  const [position, setPosition] = useState<number>(Math.max(0, tokens.length - 2));

  const rows = useMemo(() => decompose(trace, position), [trace, position]);

  return (
    <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section aria-labelledby="layers" className="min-w-0">
        <h2 id="layers" className="mono-label">
          per-layer attention
        </h2>
        <div className="mt-2 grid gap-4">
          {trace.layers.map((layer) => (
            <div key={layer.index} className="panel p-4">
              <div className="flex items-baseline justify-between">
                <h3 className="font-display text-sm font-semibold">layer {layer.index}</h3>
                <span className="mono-label">{layer.attention.length} heads</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-4">
                {layer.attention.map((pattern, head) => (
                  <AttentionMatrix
                    key={`${layer.index}-${head}`}
                    rows={pattern}
                    active={head === 0}
                    label={`layer ${layer.index} head ${head}`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <aside className="min-w-0" aria-labelledby="residual">
        <h2 id="residual" className="mono-label">
          residual stream at position {position}
        </h2>
        <div className="panel mt-2 p-4">
          <label htmlFor="position" className="mono-label">
            position
          </label>
          <input
            id="position"
            type="range"
            min={0}
            max={tokens.length - 1}
            value={position}
            onChange={(e) => setPosition(Number(e.target.value))}
            className="mt-2 w-full accent-cyan"
          />
          <p className="mt-1 font-mono text-xs text-ink-dim">
            token {tokens[position] ?? "?"} of {tokens.length}
          </p>

          <ul className="mt-4 space-y-2">
            {rows.map((row) => (
              <li key={row.source}>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-ink">{row.source}</span>
                  <span className="font-mono text-ink-dim">{(row.share * 100).toFixed(1)}%</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-indigo">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.max(1, row.share * 100)}%`, backgroundColor: row.color }}
                  />
                </div>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-xs text-ink-dim">
            Shares are ‖contribution‖ / Σ‖contribution‖. The head written brightest is the one the next
            layer will read — and on the constructed model, that is the induction head.
          </p>
        </div>
      </aside>
    </div>
  );
}

interface DecompositionRow {
  readonly source: string;
  readonly share: number;
  readonly color: string;
}

function decompose(trace: ForwardTrace, position: number): DecompositionRow[] {
  const row = trace.finalResidual[position];
  if (!row) return [];
  const sources: { name: string; vector: Float64Array | undefined; color: string }[] = [
    { name: "token + position embedding", vector: trace.ids[position], color: "#8b93b0" }
  ];
  for (const layer of trace.layers) {
    sources.push({
      name: `L${layer.index} attention`,
      vector: layer.attnOut[position],
      color: layer.index === 0 ? "#5ef1ff" : "#ffb347"
    });
    sources.push({ name: `L${layer.index} MLP`, vector: layer.mlpOut[position], color: "#a78bfa" });
  }
  const total = sources.reduce((sum, s) => sum + normOf(s.vector), 0);
  if (total === 0) return [];
  return sources
    .filter((s) => s.vector !== undefined)
    .map((s) => ({ source: s.name, share: normOf(s.vector) / total, color: s.color }));
}

function normOf(v: Float64Array | undefined): number {
  if (!v) return 0;
  let sum = 0;
  for (const x of v) sum += x * x;
  return Math.sqrt(sum);
}

function AttentionMatrix({
  rows,
  active,
  label
}: {
  rows: readonly Float64Array[];
  active: boolean;
  label: string;
}) {
  const size = rows.length;
  const cell = Math.max(8, Math.min(18, 160 / Math.max(1, size)));
  return (
    <figure className="m-0">
      <svg
        width={size * cell + 2}
        height={size * cell + 2}
        viewBox={`0 0 ${size * cell + 2} ${size * cell + 2}`}
        role="img"
        aria-label={`${label} attention pattern`}
        className={active ? "rounded" : "rounded opacity-60"}
      >
        <title>{`${label} attention pattern, ${size} query positions`}</title>
        {rows.map((row, q) =>
          Array.from(row).map((p, k) => (
            <rect
              key={`${q}-${k}`}
              x={k * cell + 1}
              y={q * cell + 1}
              width={cell - 1}
              height={cell - 1}
              fill={active ? "#ffb347" : "#5ef1ff"}
              opacity={Math.max(0.04, p)}
              rx={1}
            >
              <title>{`q=${q} attends to k=${k} with weight ${p.toFixed(3)}`}</title>
            </rect>
          ))
        )}
      </svg>
      <figcaption className="mono-label mt-1">{label}</figcaption>
    </figure>
  );
}

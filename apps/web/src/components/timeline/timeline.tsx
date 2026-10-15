"use client";

import { useState } from "react";
import type { ForwardTrace } from "@repo/core";

/**
 * A scrubber over the recorded layers. Picking a layer renders that layer's
 * final residual stream as a subspace histogram, so the reader can watch the
 * token lane, the shifted lane and the position lane separate and recombine.
 */
export function Timeline({
  snapshots,
  trace,
  tokens
}: {
  snapshots: readonly { index: number; label: string; checksum: string }[];
  trace: ForwardTrace;
  tokens: readonly number[];
}) {
  const [layer, setLayer] = useState(Math.max(0, trace.layers.length - 1));
  const record = trace.layers[Math.min(layer, trace.layers.length - 1)];
  const last = tokens.length - 1;
  const residual = record?.residual[last] ?? [];

  const buckets = [
    { name: "token", from: 0, to: 16, color: "#5ef1ff" },
    { name: "shifted", from: 16, to: 32, color: "#ffb347" },
    { name: "position", from: 32, to: 48, color: "#a78bfa" },
    { name: "noise", from: 48, to: 64, color: "#8b93b0" }
  ];

  return (
    <section className="mt-10" aria-labelledby="layers">
      <h2 id="layers" className="mono-label">
        layers
      </h2>
      <div className="panel mt-2 p-4">
        <div className="flex flex-wrap gap-2">
          {snapshots.map((s) => (
            <button
              key={s.index}
              type="button"
              onClick={() => setLayer(s.index)}
              aria-pressed={layer === s.index}
              className={`rounded border px-3 py-1.5 font-mono text-xs transition-colors ${
                layer === s.index
                  ? "border-cyan/40 bg-cyan/10 text-cyan"
                  : "border-line text-ink-dim hover:text-ink"
              }`}
            >
              {s.label}
              <span className="ml-2 text-[10px] opacity-60">{s.checksum}</span>
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mono-label">
              residual stream at final position, layer {record?.index ?? 0}
            </h3>
            <svg
              viewBox="0 0 320 120"
              width="100%"
              height={120}
              role="img"
              aria-label="Subspace energy of the residual stream"
            >
              <title>Residual stream subspace energy</title>
              {buckets.map((bucket, i) => {
                const slice = Array.from(residual.slice(bucket.from, bucket.to));
                const energy = Math.sqrt(slice.reduce((s, v) => s + v * v, 0));
                const scaled = Math.min(1, energy / Math.sqrt(16));
                return (
                  <g key={bucket.name} transform={`translate(${i * 80 + 10}, 0)`}>
                    <rect x={0} y={90} width={56} height={Math.max(1, scaled * 80)} fill={bucket.color} opacity={0.7} />
                    <text x={28} y={108} textAnchor="middle" fontSize={9} fontFamily="var(--font-mono)" fill="#8b93b0">
                      {bucket.name}
                    </text>
                    <text x={28} y={84 - scaled * 80} textAnchor="middle" fontSize={8} fontFamily="var(--font-mono)" fill="#f4f6fb">
                      {energy.toFixed(2)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div>
            <h3 className="mono-label">who wrote to the stream</h3>
            <ul className="mt-2 space-y-2 text-xs">
              {sources.map((source) => {
                const vector = source.read(record, trace, last);
                const energy = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
                const total = Math.max(
                  1e-6,
                  ...sources.map((s2) => Math.sqrt(s2.read(record, trace, last).reduce((s, v) => s + v * v, 0)))
                );
                return (
                  <li key={source.name}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-ink-dim">{source.name}</span>
                      <span className="font-mono text-slate">{(energy / total * 100).toFixed(1)}%</span>
                    </div>
                    <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-indigo">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(energy / total) * 100}%`, backgroundColor: source.color }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

const sources: readonly {
  name: string;
  color: string;
  read: (
    record: ForwardTrace["layers"][number] | undefined,
    trace: ForwardTrace,
    position: number
  ) => number[];
}[] = [
  {
    name: "attention (this layer)",
    color: "#5ef1ff",
    read: (record, _trace, position) => Array.from(record?.attnOut[position] ?? [])
  },
  {
    name: "MLP (this layer)",
    color: "#a78bfa",
    read: (record, _trace, position) => Array.from(record?.mlpOut[position] ?? [])
  },
  {
    name: "residual (final)",
    color: "#ffb347",
    read: (record, _trace, position) => Array.from(record?.residual[position] ?? [])
  }
];

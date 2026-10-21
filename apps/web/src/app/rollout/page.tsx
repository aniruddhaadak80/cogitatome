import {
  CogitatomeModel,
  constructInductionModel,
  decodeAlphabet,
  makeRepeated
} from "@repo/core";
import { attentionRollout, topRolloutSources } from "@repo/core";

/**
 * Attention rollout — compose attention matrices across layers to answer: if
 * token A attends to B in layer 0, and B attends to C in layer 1, what is the
 * effective A→C flow? Thick lines carry the signal; thin ones are pruned.
 */
export const dynamic = "force-dynamic";

const MOTIF = [1, 2, 3, 4];

function fmt(n: number): string {
  return n.toFixed(3);
}

function opacity(w: number): string {
  const o = Math.min(1, Math.max(0.08, w * 1.5));
  return o.toFixed(2);
}

export default function RolloutPage() {
  const model = new CogitatomeModel(constructInductionModel());
  const tokens = makeRepeated(MOTIF, 6);
  const trace = model.forward(tokens);
  const graph = attentionRollout(trace, 0.05);
  const lastPosition = tokens.length - 1;
  const intoLast = topRolloutSources(graph, lastPosition, 6);

  return (
    <div className="gutter py-10">
      <header className="max-w-3xl">
        <p className="mono-label">rollout</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          Attention rollout — how information flows across layers
        </h1>
        <p className="mt-3 text-ink-dim">
          Attention rollout composes per-head attention matrices across layers
          (A₁·A₀). The entry [i][j] is the effective attention from position j
          to position i after all layers — information flow, not just one head&apos;s
          pattern. Lines below 0.05 are pruned; what remains is the skeleton of
          the circuit.
        </p>
      </header>

      <dl className="mt-6 flex flex-wrap gap-3">
        <div className="panel px-3 py-2">
          <dt className="mono-label">edges</dt>
          <dd className="font-display text-xl font-semibold text-cyan">
            {graph.edges.length}
          </dd>
        </div>
        <div className="panel px-3 py-2">
          <dt className="mono-label">pruned (≥ 0.05)</dt>
          <dd className="font-display text-xl font-semibold text-ink">
            {graph.prunedEdges.length}
          </dd>
        </div>
        <div className="panel px-3 py-2">
          <dt className="mono-label">nodes</dt>
          <dd className="font-display text-xl font-semibold text-ink-dim">
            {graph.nodes.length}
          </dd>
        </div>
      </dl>

      <section className="mt-10 overflow-x-auto panel p-4">
        <svg viewBox="0 0 640 360" className="w-full h-[360px] max-h-[60vh]" role="img">
          <title>attention rollout graph</title>
          {/* Draw edges first so they sit behind the nodes */}
          {graph.prunedEdges.map((edge, i) => {
            const fromNode = graph.nodes.find((n) => n.id === edge.from);
            const toNode = graph.nodes.find((n) => n.id === edge.to);
            if (!fromNode || !toNode) return null;
            const fx = 100 + fromNode.position * 90;
            const fy = 80 + fromNode.layer * 120;
            const tx = 100 + toNode.position * 90;
            const ty = 80 + toNode.layer * 120;
            return (
              <path
                key={`e-${i}`}
                d={`M ${fx + 8} ${fy} C ${(fx + tx) / 2 + 20} ${fy}, ${(fx + tx) / 2 + 20} ${ty}, ${tx - 8} ${ty}`}
                fill="none"
                stroke="#ffb347"
                strokeWidth={Math.max(0.75, edge.weight * 6)}
                opacity={opacity(edge.weight)}
                strokeLinecap="round"
              />
            );
          })}
          {/* Nodes: layer 0 at bottom, last layer at top */}
          {graph.nodes.map((n) => {
            const cx = 100 + n.position * 90;
            const cy = 80 + n.layer * 120;
            return (
              <g key={n.id}>
                <circle cx={cx} cy={cy} r={10} fill="#0b1130" stroke="#5ef1ff" strokeWidth="1.5" />
                <text x={cx} y={cy + 28} textAnchor="middle" fontFamily="monospace" fontSize="9" fill="#8b93b0">
                  P{n.position}
                </text>
              </g>
            );
          })}
        </svg>
        <p className="mt-2 text-xs text-ink-dim">
          Left→right = position, bottom→top = layer. Circles are positions at
          each layer; amber lines are effective attention flow after rollout.
          Opacity encodes weight — the thickest line into the final position is
          what the model &quot;reads&quot; to make its prediction.
        </p>
      </section>

      <section className="mt-10" aria-labelledby="sources">
        <h2 id="sources" className="font-display text-lg font-semibold">
          What position {lastPosition} actually reads
        </h2>
        <p className="mt-2 text-sm text-ink-dim">
          Top sources by rollout weight into the final position — the
          composition of every head&apos;s pattern across both layers.
        </p>
        <ul className="mt-3 space-y-2 font-mono text-sm">
          {intoLast.map((s) => (
            <li key={s.position} className="panel px-3 py-2 flex justify-between items-center">
              <span className="text-ink">
                Position {s.position} ({decodeAlphabet([tokens[s.position] ?? 0]).trim()})
              </span>
              <span className={`text-xs tabular-nums ${s.weight > 0.3 ? "text-cyan" : "text-ink-dim"}`}>
                {fmt(s.weight)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-6 text-xs text-ink-dim">
        The equivalent JSON graph is at <code className="font-mono">/api/v1/rollout</code>,
        with <code className="font-mono">topRolloutSources</code> exposing &quot;what does this position read?&quot;
        on demand.
      </p>
    </div>
  );
}

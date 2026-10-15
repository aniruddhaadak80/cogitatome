import Link from "next/link";
import {
  CogitatomeModel,
  circuitToJson,
  constructInductionModel,
  discoverCircuit,
  makeRepeated,
  pruneCircuit
} from "@repo/core";
import { CircuitGraph } from "@/components/circuit/circuit-graph";

export const dynamic = "force-dynamic";

const MOTIF = [1, 2, 3, 4];

/**
 * The circuit explorer. On the constructed model the true circuit is known, so
 * the discovered graph can be compared against it — which is the whole point.
 */
export default function CircuitsPage() {
  const model = new CogitatomeModel(constructInductionModel());
  const tokens = makeRepeated(MOTIF, 6);
  const graph = discoverCircuit(model, tokens, 1);
  const pruned = pruneCircuit(graph, 0.05);

  const json = circuitToJson(pruned);

  return (
    <div className="gutter py-10">
      <header className="max-w-3xl">
        <p className="mono-label">circuits</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Discover the circuit</h1>
        <p className="mt-3 text-ink-dim">
          A circuit is the subgraph of the model that actually carries out a computation. This page
          builds the graph from measured attention and attribution, prunes the edges that carry less
          than 5% of the signal, and draws what is left. On the constructed model the ground truth is{" "}
          <span className="font-mono text-ink">L0.H0 → L1.H0 → logit</span>: a previous-token head feeds a
          K-composed induction head.
        </p>
      </header>

      <dl className="mt-6 flex flex-wrap gap-3">
        <Pill label="nodes" value={String(pruned.nodes.length)} />
        <Pill label="edges" value={String(pruned.edges.length)} />
        <Pill label="pruned edges" value={String(graph.edges.length - pruned.edges.length)} />
        <Pill label="target token" value={String(graph.targetToken)} accent />
      </dl>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="graph" className="min-w-0">
          <h2 id="graph" className="mono-label">
            attributed graph
          </h2>
          <div className="panel mt-2 p-4">
            <CircuitGraph graph={pruned} />
          </div>
        </section>

        <aside className="min-w-0">
          <h2 className="mono-label">export</h2>
          <div className="panel mt-2 p-4">
            <p className="text-xs text-ink-dim">
              The same graph, serialised.{" "}
              <Link href="/api/v1/circuits?format=dot" className="text-cyan underline-offset-4 hover:underline">
                Graphviz
              </Link>{" "}
              is also available for tooling that is not this app.
            </p>
            <pre className="mt-3 max-h-96 overflow-auto font-mono text-[11px] leading-relaxed text-ink-dim">
              {JSON.stringify(json, null, 1)}
            </pre>
          </div>
        </aside>
      </div>

      <section className="mt-10" aria-labelledby="truth">
        <h2 id="truth" className="font-display text-lg font-semibold">
          Checking the discovery against the truth
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-ink-dim">
          Because the weights are set analytically, the real circuit is known before any analysis runs.
          That turns this page into a test: if edge discovery stops finding the L0.H0 → L1.H0
          composition, the tool is broken, not the model.
        </p>
        <ol className="mt-4 grid gap-3 text-sm text-ink-dim md:grid-cols-3">
          <li className="panel p-4">
            <span className="mono-label">step 1</span>
            <p>Layer 0 head 0 attends to the previous token and writes its identity into the shifted lane.</p>
          </li>
          <li className="panel p-4">
            <span className="mono-label">step 2</span>
            <p>
              Layer 1 head 0 reads that lane as its key, so it matches &ldquo;who came before me&rdquo;
              against &ldquo;who came before you&rdquo;.
            </p>
          </li>
          <li className="panel p-4">
            <span className="mono-label">step 3</span>
            <p>On a match it copies forward the token that followed the earlier occurrence, and the unembedding reads it.</p>
          </li>
        </ol>
      </section>
    </div>
  );
}

function Pill({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="panel px-3 py-2">
      <dt className="mono-label">{label}</dt>
      <dd className={`font-display text-xl font-semibold ${accent ? "text-cyan" : ""}`}>{value}</dd>
    </div>
  );
}

import Link from "next/link";
import {
  CogitatomeModel,
  constructInductionModel,
  decodeAlphabet,
  makeRepeated,
  type ForwardTrace
} from "@repo/core";
import { Timeline } from "@/components/timeline/timeline";

export const dynamic = "force-dynamic";

const MOTIF = [1, 2, 3, 4];

/**
 * The time machine. Every forward pass is a sequence of states, and every state
 * is a pure function of the tokens — so any of them can be recomputed, diffed
 * against another, and explained.
 */
export default function TimelinePage() {
  const model = new CogitatomeModel(constructInductionModel());
  const tokens = makeRepeated(MOTIF, 6);
  const trace: ForwardTrace = model.forward(tokens);

  const snapshots = trace.layers.map((layer) => ({
    index: layer.index,
    label: `layer ${layer.index}`,
    checksum: checksum(Array.from(layer.residual[tokens.length - 1] ?? []))
  }));

  const predicted = trace.logits.map((row) => argMax(Array.from(row)));
  const perStep = tokens.map((token, i) => ({
    step: i,
    symbol: decodeAlphabet([token]).trim(),
    predictedNext: predicted[i] ?? 0,
    truth: tokens[i + 1] ?? null,
    correct: tokens[i + 1] !== undefined && predicted[i] === tokens[i + 1]
  }));

  return (
    <div className="gutter py-10">
      <header className="max-w-3xl">
        <p className="mono-label">timeline</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          Every state, rewindable
        </h1>
        <p className="mt-3 text-ink-dim">
          A deterministic simulation has a valuable property: any state can be recomputed from the
          inputs, so &ldquo;what happened at step 7&rdquo; is always a well-defined question. This page
          walks the run token by token and layer by layer, and fingerprints each state so you can see
          that two runs really are identical.
        </p>
      </header>

      <section className="mt-8" aria-labelledby="run">
        <h2 id="run" className="mono-label">
          run · {tokens.length} tokens · {trace.layers.length} layers
        </h2>
        <div className="panel mt-2 overflow-x-auto p-4">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <caption className="sr-only">Per-token prediction and correctness across the run</caption>
            <thead>
              <tr className="border-b border-line text-left">
                <th scope="col" className="py-2 pr-4 font-medium">step</th>
                <th scope="col" className="py-2 pr-4 font-medium">symbol</th>
                <th scope="col" className="py-2 pr-4 font-medium">predicted next</th>
                <th scope="col" className="py-2 pr-4 font-medium">actual next</th>
                <th scope="col" className="py-2 font-medium">verdict</th>
              </tr>
            </thead>
            <tbody>
              {perStep.map((row) => (
                <tr key={row.step} className="border-b border-line/60">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-dim">{row.step}</td>
                  <td className="py-2 pr-4 font-mono text-sm text-ink">{row.symbol}</td>
                  <td className="py-2 pr-4 font-mono text-sm text-ink">{row.predictedNext}</td>
                  <td className="py-2 pr-4 font-mono text-sm text-ink-dim">
                    {row.truth === null ? "—" : row.truth}
                  </td>
                  <td className="py-2">
                    {row.truth === null ? (
                      <span className="text-slate">end</span>
                    ) : row.correct ? (
                      <span className="text-lime">correct</span>
                    ) : (
                      <span className="text-rose">wrong</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Timeline snapshots={snapshots} trace={trace} tokens={tokens} />

      <section className="mt-10" aria-labelledby="replay">
        <h2 id="replay" className="font-display text-lg font-semibold">
          Reproducing a state
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-ink-dim">
          Because the forward pass is a pure function of the token sequence and the seed, the same
          request to{" "}
          <Link href="/api/v1/interpret" className="font-mono text-cyan underline-offset-4 hover:underline">
            /api/v1/interpret
          </Link>{" "}
          always returns the same trace. The fingerprint under each layer is a 32-bit checksum of the
          final residual stream — if two runs disagree anywhere, the checksums differ.
        </p>
        <pre className="panel mt-3 overflow-x-auto p-4 font-mono text-xs leading-relaxed text-ink-dim">
          {`curl -s http://localhost:3000/api/v1/interpret \\
  -H 'content-type: application/json' \\
  -d '{"tokens":[0,1,2,3,4,1,2,3,4,1,2,3,4,1,2,3,4,1,2,3,4,1,2,3,4],"model":"induction"}' | \\
  jq '{predicted, inductionAccuracy, heads: [.heads[] | {layer, head, role}]}'`}
        </pre>
      </section>
    </div>
  );
}

function argMax(row: readonly number[]): number {
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

function checksum(values: readonly number[]): string {
  let h = 2166136261;
  for (const v of values) {
    h ^= Math.round(v * 1e6) & 0xffff;
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

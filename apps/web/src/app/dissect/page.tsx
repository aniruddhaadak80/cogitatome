import { CogitatomeModel, constructInductionModel, randomWeights } from "@repo/core";
import { DissectView } from "@/components/dissect-view";
import { TokenStrip } from "@/components/viz/token-strip";

export const dynamic = "force-dynamic";

/**
 * The dissection bench. Two models are selectable and the difference matters:
 * the random model has no known structure, the constructed model has a genuine
 * induction circuit hidden inside it that the analysis tools are supposed to
 * find.
 */
export default async function DissectPage({
  searchParams
}: {
  searchParams: Promise<{ model?: string }>;
}) {
  const params = await searchParams;
  const modelId = params.model === "random" ? "random" : "induction";
  const model =
    modelId === "random" ? new CogitatomeModel(randomWeights()) : new CogitatomeModel(constructInductionModel());

  const tokens = [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3];
  const trace = model.forward(tokens);
  const predicted = trace.logits.map((row) => argMax(Array.from(row)));
  const continued = tokens.slice(1).map((t, i) => predicted[i] === t);

  return (
    <div className="gutter py-10">
      <header className="max-w-3xl">
        <p className="mono-label">dissect</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          Step through a forward pass
        </h1>
        <p className="mt-3 text-ink-dim">
          Every layer, every head, every MLP neuron of a real transformer, recorded. Pick a position and
          read where its residual stream went. This is the same engine the API routes use, running
          server-side with deterministic weights.
        </p>
      </header>

      <div className="mt-6 flex flex-wrap gap-2 text-sm">
        <ModelLink href="/dissect" active={modelId === "induction"} label="constructed induction model" />
        <ModelLink href="/dissect?model=random" active={modelId === "random"} label="seeded random model" />
      </div>

      <section className="mt-8" aria-labelledby="run">
        <h2 id="run" className="mono-label">
          run · {model.weights.label}
        </h2>
        <div className="panel mt-2 p-4">
          <TokenStrip
            tokens={tokens}
            predicted={predicted}
            continued={continued}
            vocabSize={model.config.vocabSize}
          />
        </div>
      </section>

      <DissectView trace={trace} tokens={tokens} />

      <section className="mt-10" aria-labelledby="notes">
        <h2 id="notes" className="font-display text-lg font-semibold">
          What you are looking at
        </h2>
        <dl className="mt-3 grid gap-4 text-sm text-ink-dim md:grid-cols-3">
          <div>
            <dt className="text-ink">The residual stream</dt>
            <dd>
              A transformer adds, it does not overwrite. Every head and every MLP writes into the same
              stream, and the unembedding reads the sum. The bar under each token is that sum, split by
              who contributed it.
            </dd>
          </div>
          <div>
            <dt className="text-ink">Attention</dt>
            <dd>
              Each head routes information from earlier positions. A head that always attends one token
              back is doing something specific; a head that attends to earlier occurrences of the current
              token is doing induction.
            </dd>
          </div>
          <div>
            <dt className="text-ink">Determinism</dt>
            <dd>
              No API key, no sampling, no network. The same input gives the same trace on every machine,
              which is what makes the claims checkable.
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function ModelLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <a
      href={href}
      className={`rounded border px-3 py-1.5 font-mono text-xs transition-colors ${
        active ? "border-cyan/40 bg-cyan/10 text-cyan" : "border-line text-ink-dim hover:text-ink"
      }`}
    >
      {label}
    </a>
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

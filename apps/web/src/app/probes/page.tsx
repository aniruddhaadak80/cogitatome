import {
  CogitatomeModel,
  constructInductionModel,
  makeRepeated,
  probeLayers
} from "@repo/core";
import { ProbeTable } from "@/components/probes/probe-table";

export const dynamic = "force-dynamic";

const MOTIF = [1, 2, 3, 4];

/**
 * Linear probes. A probe asks: "is this property linearly readable from the
 * activations at layer L?" If the answer is yes at layer 0 and no at layer 2, the
 * model computed it somewhere in between — which is a real, if coarse, claim.
 */
export default function ProbesPage() {
  const model = new CogitatomeModel(constructInductionModel());
  const tokens = makeRepeated(MOTIF, 6);

  // The property we probe for: "is this token the same as the one immediately
  // before it?" — the exact signal an induction head would need to be reading.
  const probes = probeLayers(model, tokens, (token, index, sequence) =>
    index > 0 && sequence[index - 1] === token ? 1 : 0
  );

  // A control property: "is this token symbol 1?" — which carries no induction
  // structure and should not improve with depth in any interesting way.
  const control = probeLayers(model, tokens, (token) => (token === 1 ? 1 : 0));

  return (
    <div className="gutter py-10">
      <header className="max-w-3xl">
        <p className="mono-label">probes</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          What is linearly readable from each layer
        </h1>
        <p className="mt-3 text-ink-dim">
          A probe is a linear classifier trained on the activations. It is not a window into the
          computation — it is a lower bound on what is easy to read out. But a property that goes from
          unreadable to readable between two layers was computed somewhere in between.
        </p>
      </header>

      <section className="mt-8" aria-labelledby="target">
        <h2 id="target" className="mono-label">
          target property · &ldquo;same as the previous token&rdquo;
        </h2>
        <div className="panel mt-2 p-4">
          <ProbeTable probes={probes} />
        </div>
      </section>

      <section className="mt-10" aria-labelledby="control">
        <h2 id="control" className="mono-label">
          control property · &ldquo;is symbol 1&rdquo;
        </h2>
        <div className="panel mt-2 p-4">
          <ProbeTable probes={control} />
        </div>
        <p className="mt-2 text-xs text-ink-dim">
          The control is a token identity, which is present from the embedding and should not improve
          with depth. Comparing the two tables is the point of the page.
        </p>
      </section>

      <section className="mt-10" aria-labelledby="patching">
        <h2 id="patching" className="font-display text-lg font-semibold">
          From probing to intervening
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-ink-dim">
          A probe tells you a property is <em>readable</em>. To claim it is <em>used</em>, you have to
          intervene — patch the activation from one run into another and watch the output change. The
          API exposes both:{" "}
          <code className="font-mono text-cyan">/api/v1/probes</code> for the probe suite and{" "}
          <code className="font-mono text-cyan">/api/v1/patch</code> for the patching sweep.
        </p>
      </section>
    </div>
  );
}

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  CogitatomeModel,
  constructInductionModel,
  deadFeatureRate,
  DEFAULT_SAE_OPTIONS,
  explainedVariance,
  featureAtlas,
  makeRepeated,
  sparsityL0,
  trainSae,
  type SaeAtlasEntry,
  type TrainedSae
} from "@repo/core";

export const dynamic = "force-dynamic";

const MOTIF = [1, 2, 3, 4];

/** The MLP pre-activations of the constructed model at every stimulus position. */
function collectActivations(): { activations: Float64Array[]; tokenIds: number[] } {
  const model = new CogitatomeModel(constructInductionModel());
  const tokens = makeRepeated(MOTIF, 6);
  const trace = model.forward(tokens);
  const activations: Float64Array[] = [];
  const tokenIds: number[] = [];
  for (const layer of trace.layers) {
    for (let p = 0; p < layer.mlpPre.length; p += 1) {
      const row = layer.mlpPre[p];
      if (!row) continue;
      activations.push(Float64Array.from(row));
      tokenIds.push(tokens[p] ?? 0);
    }
  }
  return { activations, tokenIds };
}

/**
 * The sparse-autoencoder page. The MLP is the part of a transformer that stores
 * facts rather than moving them, and an SAE is the tool that turns a handful of
 * polysemantic neurons into a dictionary of features.
 */
export default function FeaturesPage() {
  const { activations, tokenIds } = collectActivations();

  // Deterministic, seeded training — the same corpus, the same seed, the same
  // dictionary on every machine, which is the only way the numbers below mean
  // anything.
  const sae: TrainedSae = trainSae(activations, {
    ...DEFAULT_SAE_OPTIONS,
    nFeatures: 48,
    epochs: 220,
    seed: 60602,
    l1: 0.02
  });

  const atlas: SaeAtlasEntry[] = featureAtlas(sae, activations, tokenIds, 6);
  const dead = deadFeatureRate(sae);
  const ev = explainedVariance(activations, sae);
  const l0 = sparsityL0(sae, activations);

  return (
    <div className="gutter py-10">
      <header className="max-w-3xl">
        <p className="mono-label">features</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          Train a sparse autoencoder over the MLP
        </h1>
        <p className="mt-3 text-ink-dim">
          A single MLP neuron is rarely one thing — it is a superposition of many. A sparse autoencoder
          forces its dictionary to be sparse, so each learned direction tends to mean something. This
          page trains one for real, on the constructed model&rsquo;s MLP pre-activations, and shows the
          dictionary it recovered.
        </p>
      </header>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="training samples" value={String(activations.length)} />
        <Stat label="features" value={String(sae.features.length)} />
        <Stat label="L0" value={l0.toFixed(2)} accent />
        <Stat label="explained variance" value={`${(ev * 100).toFixed(1)}%`} accent />
      </dl>

      <div className="panel mt-6 p-4">
        <h2 className="mono-label">loss curve</h2>
        <svg
          viewBox={`0 0 600 160`}
          width="100%"
          height={160}
          role="img"
          aria-label={`Sparse autoencoder loss over ${sae.lossCurve.length} epochs`}
          className="mt-2"
        >
          <title>{`final loss ${sae.finalLoss.toFixed(4)}`}</title>
          <line x1={0} y1={140} x2={600} y2={140} stroke="#1e2a6b" strokeWidth={1} />
          <path d={lossPath(sae.lossCurve)} fill="none" stroke="#ffb347" strokeWidth={1.75} />
        </svg>
        <p className="mt-1 font-mono text-[11px] text-slate">
          {sae.lossCurve.length} epochs · final {sae.finalLoss.toFixed(4)} · dead features{" "}
          {(dead * 100).toFixed(0)}%
        </p>
      </div>

      <section className="mt-10" aria-labelledby="dictionary">
        <h2 id="dictionary" className="font-display text-lg font-semibold">
          The dictionary
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-ink-dim">
          Each row is one learned feature: how often it fires, how hard, and which stimulus symbols
          wake it up. A feature that fires on one symbol is the kind of thing you can name.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <caption className="sr-only">Sparse autoencoder feature dictionary</caption>
            <thead>
              <tr className="border-b border-line text-left">
                <th scope="col" className="py-2 pr-4 font-medium">#</th>
                <th scope="col" className="py-2 pr-4 font-medium">firing rate</th>
                <th scope="col" className="py-2 pr-4 font-medium">max activation</th>
                <th scope="col" className="py-2 pr-4 font-medium">mean</th>
                <th scope="col" className="py-2 font-medium">activating symbols</th>
              </tr>
            </thead>
            <tbody>
              {sae.features.map((feature, i) => {
                const entry = atlas[i];
                const cells = entry?.populatingTokens ?? [];
                return (
                  <tr
                    key={feature.index}
                    className={`border-b border-line/60 ${feature.dead ? "opacity-50" : ""}`}
                  >
                    <td className="py-2.5 pr-4 font-mono text-xs text-ink">{feature.index}</td>
                    <td className="py-2.5 pr-4">
                      <Bar value={feature.firingRate} />
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs tabular-nums">
                      {feature.maxActivation.toFixed(3)}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs tabular-nums">
                      {feature.meanActivation.toFixed(4)}
                    </td>
                    <td className="py-2.5">
                      {feature.dead ? (
                        <span className="font-mono text-[11px] text-rose">dead</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {cells.map((cell) => (
                            <span
                              key={`${feature.index}-${cell.tokenIndex}`}
                              className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-dim"
                              title={`activation ${cell.activation.toFixed(3)}`}
                            >
                              {cell.token}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="honesty">
        <h2 id="honesty" className="font-display text-lg font-semibold">
          What this SAE does and does not prove
        </h2>
        <div className="mt-3 grid gap-4 text-sm text-ink-dim md:grid-cols-2">
          <p>
            It proves that a sparse dictionary can be fit to this model&rsquo;s MLP with{" "}
            <span className="font-mono text-ink">L0 = {l0.toFixed(2)}</span> active features per sample
            and recover <span className="font-mono text-ink">{(ev * 100).toFixed(1)}%</span> of the
            variance. That is the mechanism, working end to end, in this repo.
          </p>
          <p>
            It does not prove that the recovered features are interpretable in the way a language
            model&rsquo;s are. Superposition in a 32-dimensional MLP is much easier than in a
            production model, and dead features here are a property of this training run, not a claim
            about the field.
          </p>
        </div>
      </section>
    </div>
  );
}

function lossPath(curve: readonly number[]): string {
  if (curve.length === 0) return "";
  const max = Math.max(...curve, 1e-6);
  return curve
    .map((value, i) => {
      const x = (i / Math.max(1, curve.length - 1)) * 600;
      const y = 140 - (value / max) * 130;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function Bar({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-indigo">
        <span className="block h-full rounded-full bg-cyan" style={{ width: `${value * 100}%` }} />
      </span>
      <span className="font-mono text-xs tabular-nums">{value.toFixed(3)}</span>
    </span>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="panel p-3">
      <dt className="mono-label">{label}</dt>
      <dd className={`mt-1 font-display text-2xl font-semibold ${accent ? "text-cyan" : ""}`}>{value}</dd>
    </div>
  );
}

// Kept for future datasets; the deterministic generator writes this file in a
// `bun run seed` pass and it is committed, so the demo never needs the network.
const ACTIVATION_DATA = resolve(process.cwd(), "packages/seed/data/activations.jsonl");
export const hasSeedDataset = (): boolean => existsSync(ACTIVATION_DATA);

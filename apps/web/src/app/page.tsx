import Link from "next/link";
import { CogitatomeModel, constructInductionModel, decodeAlphabet, makeRepeated } from "@repo/core";
import { NAV_SECTIONS } from "@/lib/nav";
import { CorpusTeaser } from "@/components/corpus-teaser";

export const revalidate = false;

/**
 * The landing page runs a *real* forward pass so the hero shows numbers the
 * product actually produced — not a stock chart.
 */
export default function LandingPage() {
  const model = new CogitatomeModel(constructInductionModel());
  const motif = [1, 2, 3, 4];
  const tokens = makeRepeated(motif, 5);
  const trace = model.forward(tokens);
  const predicted = trace.logits.map((row) => argMax(Array.from(row)));
  const hits = predicted.slice(0, -1).filter((p, i) => p === tokens[i + 1]).length;
  const accuracy = hits / Math.max(1, predicted.length - 1);

  return (
    <div className="gutter">
      <Hero tokens={tokens} predicted={predicted} accuracy={accuracy} />

      <section className="mt-20" aria-labelledby="what">
        <h2 id="what" className="font-display text-2xl font-semibold">
          What is cogitatome?
        </h2>
        <div className="mt-4 grid gap-6 text-ink-dim md:grid-cols-3">
          <p>
            Mechanistic interpretability is the project of reverse-engineering a trained network the way
            you would reverse-engineer a binary: find the features, find the circuits, and find out what
            the model is actually computing. It is the only branch of AI safety that promises an answer
            to{" "}
            <em className="text-ink">what is happening inside the brain</em> rather than a statistical
            summary of its behaviour.
          </p>
          <p>
            The catch is that the real models are enormous, so the whole literature is taught on toy
            models — two-layer transformers you can hold in your head. cogitatome ships one of those
            toys, but a *known quantity*: its weights are constructed analytically so that a genuine
            induction circuit is inside it, and the analysis tools have to find it. That turns the demos
            into tests.
          </p>
          <p>
            Around it sit the alignment problems that interpretability is supposed to help with —
            specification gaming, sandbagging, sleeper agents, hidden reasoning — as deterministic
            sandboxes you can run and inspect, plus an ethics engine that argues a case from six
            philosophical positions and shows you the argument graph. Everything runs locally. No keys.
          </p>
        </div>
      </section>

      <CorpusTeaser />

      <section className="mt-20" aria-labelledby="capabilities">
        <h2 id="capabilities" className="font-display text-2xl font-semibold">
          What you can do with it
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[42rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="py-2 pr-4 font-medium">I want to…</th>
                <th className="py-2 pr-4 font-medium">Open</th>
                <th className="py-2 font-medium">And get</th>
              </tr>
            </thead>
            <tbody className="text-ink-dim">
              {CAPABILITIES.map((row) => (
                <tr key={row.want} className="border-b border-line/60 align-top">
                  <td className="py-2.5 pr-4 text-ink">{row.want}</td>
                  <td className="py-2.5 pr-4">
                    <Link href={row.href} className="text-cyan underline-offset-4 hover:underline">
                      {row.href}
                    </Link>
                  </td>
                  <td className="py-2.5">{row.get}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-20" aria-labelledby="routes">
        <h2 id="routes" className="font-display text-2xl font-semibold">
          nine routes into the brain
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {NAV_SECTIONS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="panel p-4 transition-colors hover:border-cyan/50"
            >
              <h3 className="font-display text-sm font-semibold">{s.label}</h3>
              <p className="mt-1 text-xs text-ink-dim">{s.blurb}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-20" aria-labelledby="quickstart">
        <h2 id="quickstart" className="font-display text-2xl font-semibold">
          Quickstart
        </h2>
        <pre className="panel mt-4 overflow-x-auto p-4 font-mono text-xs leading-relaxed text-ink-dim">
          {`git clone https://github.com/aniruddhaadak80/cogitatome.git
cd cogitatome
bun install
bun run dev          # http://localhost:3000

# no API keys, no database, no network access required`}
        </pre>
      </section>
    </div>
  );
}

const CAPABILITIES: readonly { want: string; href: string; get: string }[] = [
  {
    want: "see a forward pass token by token",
    href: "/dissect",
    get: "the residual stream at every layer, with the per-layer attention and MLP contributions"
  },
  {
    want: "classify every attention head",
    href: "/heads",
    get: "previous-token / induction / positional / sink labels with the evidence behind each"
  },
  {
    want: "find the induction circuit",
    href: "/circuits",
    get: "a pruned attribution graph with QK and OV composition edges"
  },
  {
    want: "decompose the MLP into features",
    href: "/features",
    get: "an L1 sparse autoencoder trained in the browser-service, with firing rates and dead units"
  },
  {
    want: "know what is linearly readable",
    href: "/probes",
    get: "per-layer probe accuracy and AUC for any property you define"
  },
  {
    want: "test a causal claim",
    href: "/probes",
    get: "activation patching and head ablations with the effect on the target logit"
  },
  {
    want: "watch a model fail to be honest",
    href: "/sandbox",
    get: "eight alignment scenarios, each with a step-by-step reasoning trace"
  },
  {
    want: "argue an AI ethics case",
    href: "/ethics",
    get: "utilitarian, deontological, virtue, care, contractarian and precautionary verdicts plus an argument graph"
  },
  {
    want: "find the real literature",
    href: "/corpus",
    get: "573 arXiv papers plus talks, blog posts and threads, searchable offline with BM25"
  },
  {
    want: "rewind a run",
    href: "/timeline",
    get: "any simulation state, diffed against any other"
  },
  {
    want: "audit the engine itself",
    href: "/api/v1/metrics",
    get: "the same metrics the UI renders, as JSON"
  },
  {
    want: "read the reasoning out loud",
    href: "/api/v1/debate",
    get: "a deterministic interpreter/skeptic/red-team debate over a claim"
  }
];

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

/** A compact real-data strip: the actual tokens, what the model predicted, and the hit rate. */
function Hero({
  tokens,
  predicted,
  accuracy
}: {
  tokens: readonly number[];
  predicted: readonly number[];
  accuracy: number;
}) {
  return (
    <section className="pt-14" aria-labelledby="hero">
      <p className="mono-label">interpretability observatory · alignment laboratory</p>
      <h1 id="hero" className="mt-3 max-w-3xl font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
        Open the brain.
        <br />
        <span className="text-cyan">Read the circuit.</span>
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-ink-dim">
        cogitatome is a working interpretability lab. It runs a deterministic transformer you can
        dissect layer by layer, discovers the induction circuit hiding inside it, trains sparse
        autoencoders over its neurons, and puts the whole alignment literature — papers, talks, posts —
        into one searchable index.
      </p>

      <dl className="mt-8 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="tokens run" value={String(tokens.length)} />
        <Stat label="layers" value="2" />
        <Stat label="heads profiled" value="2" />
        <Stat label="next-token accuracy" value={`${Math.round(accuracy * 100)}%`} accent />
      </dl>

      <div className="panel mt-6 max-w-3xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-2">
          <span className="mono-label">live forward pass · constructed induction model</span>
          <span className="mono-label text-cyan">seed 60602</span>
        </div>
        <div className="flex flex-wrap gap-1.5 p-4">
          {tokens.map((t, i) => {
            const correct = i + 1 < tokens.length && predicted[i] === tokens[i + 1];
            return (
              <span key={`${t}-${i}`} className="flex flex-col items-center gap-1">
                <span className="font-mono text-sm text-ink">{decodeAlphabet([t]).trim()}</span>
                <span
                  className={`h-1 w-6 rounded-full ${correct ? "bg-cyan" : "bg-rose"}`}
                  aria-hidden
                />
                <span className="font-mono text-[10px] text-ink-dim">
                  {predicted[i] === tokens[i + 1] ? "✓" : "·"}
                </span>
              </span>
            );
          })}
        </div>
        <p className="border-t border-line px-4 py-2 text-xs text-ink-dim">
          Each token the model correctly continued is a small induction result: after seeing{" "}
          <span className="font-mono text-ink">a b c d</span> repeat, the second layer attends back to
          the earlier occurrence of the current token and copies what followed it. Go and check.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/dissect"
          className="rounded border border-cyan/40 bg-cyan/10 px-4 py-2 text-sm font-medium text-cyan transition-colors hover:bg-cyan/20"
        >
          Dissect it now →
        </Link>
        <Link
          href="/corpus"
          className="rounded border border-line px-4 py-2 text-sm font-medium text-ink-dim transition-colors hover:text-ink"
        >
          Search 573 real papers
        </Link>
      </div>
    </section>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="panel p-3">
      <dt className="mono-label">{label}</dt>
      <dd className={`mt-1 font-display text-xl font-semibold ${accent ? "text-cyan" : ""}`}>{value}</dd>
    </div>
  );
}

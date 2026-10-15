import {
  CogitatomeModel,
  constructInductionModel,
  decodeAlphabet,
  inductionScore,
  makeRepeated,
  profileHeads,
  type HeadProfile,
  type InductionScore
} from "@repo/core";
import { HeadTable } from "@/components/heads/head-table";

export const dynamic = "force-dynamic";

const MOTIF = [1, 2, 3, 4];

/**
 * Every attention head, profiled. The constructed model makes this page a test
 * rather than a demo: a previous-token head in layer 0 and an induction head in
 * layer 1 are known to be in there, and the table should say so.
 */
export default function HeadsPage() {
  const model = new CogitatomeModel(constructInductionModel());
  const tokens = makeRepeated(MOTIF, 6);
  const trace = model.forward(tokens);

  const heads: HeadProfile[] = profileHeads(trace);
  const induction: InductionScore[] = inductionScore(model, trace);
  const inductionByRef = new Map(induction.map((i) => [`${i.layer}:${i.head}`, i]));

  const predicted = trace.logits.map((row) => argMax(Array.from(row)));
  const cutoff = MOTIF.length + 1;
  const learnable = tokens.length - 1 - cutoff;
  const hits = predicted.filter((p, i) => i >= cutoff && p === tokens[i + 1]).length;

  return (
    <div className="gutter py-10">
      <header className="max-w-3xl">
        <p className="mono-label">heads</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          Every attention head, profiled
        </h1>
        <p className="mt-3 text-ink-dim">
          Attention is the only part of a transformer that moves information between positions, and a
          head is the unit of that movement. This page classifies all four heads of the constructed
          model — two previous-token-adjacent, one inductive, one deliberate distractor — and shows the
          evidence for each label.
        </p>
      </header>

      <dl className="mt-6 flex flex-wrap gap-3">
        <Pill label="heads" value={String(heads.length)} />
        <Pill label="previous-token" value={String(heads.filter((h) => h.role === "previous-token").length)} accent />
        <Pill label="induction" value={String(heads.filter((h) => h.role === "induction").length)} accent />
        <Pill label="learnable accuracy" value={`${hits}/${learnable}`} />
      </dl>

      <HeadTable heads={heads} induction={inductionByRef} />

      <section className="mt-10 grid gap-4 md:grid-cols-3" aria-labelledby="classes">
        <h2 id="classes" className="sr-only">
          How a head gets its label
        </h2>
        {ROLE_NOTES.map((note) => (
          <article key={note.role} className="panel p-4">
            <h3 className="font-display text-sm font-semibold">{note.role}</h3>
            <p className="mt-1 text-xs text-ink-dim">{note.text}</p>
          </article>
        ))}
      </section>

      <section className="mt-10" aria-labelledby="stimulus">
        <h2 id="stimulus" className="font-display text-lg font-semibold">
          The stimulus
        </h2>
        <p className="mt-2 text-sm text-ink-dim">
          A four-symbol motif repeated six times, prefixed by the reserved anchor symbol. The first
          pass through the motif carries no induction signal — there is nothing to attend back to — so
          only the positions after it count as learnable.
        </p>
        <p className="panel mt-3 overflow-x-auto p-3 font-mono text-sm text-ink">
          {decodeAlphabet(tokens)}
        </p>
      </section>
    </div>
  );
}

const ROLE_NOTES: readonly { role: string; text: string }[] = [
  {
    role: "previous-token",
    text: "The head puts most of its mass on j = i-1. In the constructed model this is engineered with a relative-distance bias, and it is what makes the induction head possible: it writes the previous token's identity somewhere the next layer can read."
  },
  {
    role: "induction",
    text: "The head's attention lands on earlier positions where the token *before* them matches the current token. Layer 1 head 0 needs this, because its key reads the lane layer 0 wrote."
  },
  {
    role: "attention-sink",
    text: "The head spends a large share of its mass on the first token. Sinks are boring individually and important collectively — they absorb attention that would otherwise be spent on content."
  }
];

function Pill({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="panel px-3 py-2">
      <dt className="mono-label">{label}</dt>
      <dd className={`font-display text-xl font-semibold ${accent ? "text-cyan" : ""}`}>{value}</dd>
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

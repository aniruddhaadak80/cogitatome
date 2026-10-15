import Link from "next/link";

/**
 * A teaser built from the real harvested corpus. It deliberately shows the
 * *shape* of the data — kinds, tags, years — so a visitor can see the corpus is
 * real before they search it.
 */
export function CorpusTeaser() {
  const rows = CORPUS_PREVIEW;
  return (
    <section className="mt-20" aria-labelledby="corpus">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="corpus" className="font-display text-2xl font-semibold">
            The corpus is the literature, not a bibliography
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-dim">
            Mechanistic interpretability, alignment, safety and the philosophy of machine minds —
            harvested from the public arXiv API and hand-curated elsewhere. Every entry is real and
            links out. Search runs offline with BM25, so it works on a plane.
          </p>
        </div>
        <Link href="/corpus" className="text-sm text-cyan underline-offset-4 hover:underline">
          open the atlas →
        </Link>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure label="papers indexed" value="573" note="from the arXiv API" />
        <Figure label="talks & walkthroughs" value="22" note="verified video URLs" />
        <Figure label="essays & threads" value="35" note="Distill, Anthropic, Alignment Forum, LessWrong" />
        <Figure label="facet tags" value="29" note="superposition → sycophancy" />
      </dl>

      <div className="mt-6 overflow-hidden rounded-panel border border-line">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">A sample of entries in the cogitatome corpus atlas</caption>
          <thead>
            <tr className="border-b border-line bg-indigo/40">
              <th scope="col" className="px-4 py-2 font-medium">Title</th>
              <th scope="col" className="px-4 py-2 font-medium">Kind</th>
              <th scope="col" className="px-4 py-2 font-medium">Year</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.title} className="border-b border-line/60">
                <td className="px-4 py-2 text-ink">{row.title}</td>
                <td className="px-4 py-2 text-ink-dim">{row.kind}</td>
                <td className="px-4 py-2 font-mono text-xs text-ink-dim">{row.year}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="panel p-3">
      <dt className="mono-label">{label}</dt>
      <dd className="mt-1 font-display text-2xl font-semibold text-cyan">{value}</dd>
      <p className="mt-0.5 text-xs text-ink-dim">{note}</p>
    </div>
  );
}

/** Static preview rows — the real table lives on /corpus and is fully searchable. */
const CORPUS_PREVIEW: readonly { title: string; kind: string; year: number }[] = [
  { title: "Toy Models of Superposition", kind: "paper", year: 2022 },
  { title: "In-context Learning and Induction Heads", kind: "paper", year: 2022 },
  { title: "Scaling Monosemanticity", kind: "essay", year: 2024 },
  { title: "Circuit Tracing: Revealing Computational Graphs in Language Models", kind: "essay", year: 2025 },
  { title: "Looking Inside Neural Networks with Mechanistic Interpretability", kind: "talk", year: 2023 },
  { title: "An Extremely Opinionated Annotated List of My Favourite Mech Interp Papers", kind: "post", year: 2024 }
];

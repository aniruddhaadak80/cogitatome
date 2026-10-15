import { CORPUS, corpusFacets, corpusStats, searchCorpus, type CorpusKind } from "@repo/core";
import { CorpusSearch } from "@/components/corpus/corpus-search";
import { CorpusFacetRail } from "@/components/corpus/corpus-facet-rail";

export const dynamic = "force-dynamic";

interface CorpusPageProps {
  searchParams: Promise<{ q?: string; kind?: string; tag?: string; page?: string }>;
}

const KINDS: readonly (CorpusKind | undefined)[] = [undefined, "paper", "talk", "post"];

function asKind(value: string | undefined): CorpusKind | undefined {
  return KINDS.find((k) => k === (value ?? undefined));
}

/**
 * The corpus atlas. Everything here is real and links out: 573 harvested arXiv
 * papers, plus talks, essays and threads that were verified individually.
 */
export default async function CorpusPage({ searchParams }: CorpusPageProps) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const kind = asKind(params.kind);
  const tag = params.tag ?? "";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const limit = 25;

  const stats = corpusStats();
  const facets = corpusFacets(CORPUS, 32);
  const result = searchCorpus(q, {
    limit,
    offset: (page - 1) * limit,
    kind,
    tags: tag ? [tag] : undefined
  });

  const totalPages = Math.max(1, Math.ceil(result.total / limit));

  return (
    <div className="gutter py-10">
      <header className="max-w-3xl">
        <p className="mono-label">corpus</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          The interpretability literature, searchable offline
        </h1>
        <p className="mt-3 text-ink-dim">
          Mechanistic interpretability, alignment, safety, ethics and the philosophy of machine minds.
          Harvested from the public arXiv API by a script in this repo, so the corpus can be refreshed
          rather than trusted. Search is BM25 over title, summary, tags and abstract — it runs entirely
          in this process, with no network.
        </p>
      </header>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="entries" value={String(stats.total)} />
        <Stat label="papers" value={String(stats.byKind.paper ?? 0)} />
        <Stat label="talks" value={String(stats.byKind.talk ?? 0)} />
        <Stat label="tags" value={String(facets.length)} accent />
      </dl>

      <div className="mt-8 grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <CorpusFacetRail facets={facets} activeTag={tag} activeKind={params.kind ?? ""} />

        <div className="min-w-0">
          <CorpusSearch initialQuery={q} />

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            {q ? (
              <span className="rounded border border-cyan/40 bg-cyan/10 px-2 py-1 text-cyan">
                {result.total} results for &ldquo;{q}&rdquo;
              </span>
            ) : (
              <span className="text-ink-dim">{result.total} entries</span>
            )}
            {(kind || tag) && (
              <a href="/corpus" className="rounded border border-line px-2 py-1 text-ink-dim hover:text-ink">
                clear filters
              </a>
            )}
          </div>

          <ol className="mt-4 space-y-3">
            {result.entries.map((entry) => (
              <li key={entry.id}>
                <article className="panel p-4 transition-colors hover:border-cyan/40">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="mono-label">{entry.kind}</span>
                    {entry.year > 0 && <span className="mono-label">{entry.year}</span>}
                    <span className="mono-label text-ink-dim">{entry.venue}</span>
                  </div>
                  <h2 className="mt-1 font-display text-base font-semibold leading-snug">
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="underline-offset-4 hover:underline"
                    >
                      {entry.title}
                    </a>
                  </h2>
                  {entry.oneLiner && (
                    <p className="mt-1.5 line-clamp-3 text-sm text-ink-dim">{entry.oneLiner}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {entry.tags.slice(0, 6).map((t) => (
                      <a
                        key={t}
                        href={`/corpus?tag=${encodeURIComponent(t)}`}
                        className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-dim hover:border-cyan/40 hover:text-cyan"
                      >
                        {t}
                      </a>
                    ))}
                  </div>
                  {entry.authors.length > 0 && (
                    <p className="mt-2 text-xs text-ink-dim">
                      {entry.authors.slice(0, 4).join(", ")}
                      {entry.authors.length > 4 ? " et al." : ""}
                    </p>
                  )}
                </article>
              </li>
            ))}
          </ol>

          {result.entries.length === 0 && (
            <p className="panel mt-4 p-8 text-center text-sm text-ink-dim">
              Nothing matched that query. Try a broader term, or clear the filters.
            </p>
          )}

          {totalPages > 1 && (
            <nav className="mt-6 flex items-center justify-between text-sm" aria-label="corpus pages">
              {page > 1 ? (
                <a href={`/corpus?q=${encodeURIComponent(q)}&page=${page - 1}`} className="text-cyan hover:underline">
                  ← previous
                </a>
              ) : (
                <span />
              )}
              <span className="font-mono text-xs text-ink-dim">
                page {page} of {totalPages}
              </span>
              {page < totalPages ? (
                <a href={`/corpus?q=${encodeURIComponent(q)}&page=${page + 1}`} className="text-cyan hover:underline">
                  next →
                </a>
              ) : (
                <span />
              )}
            </nav>
          )}
        </div>
      </div>
    </div>
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

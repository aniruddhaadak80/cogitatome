import type { CorpusFacet } from "@repo/core";

/** The facet rail: tag counts and kind filters, all plain links so they are shareable. */
export function CorpusFacetRail({
  facets,
  activeTag,
  activeKind
}: {
  facets: readonly CorpusFacet[];
  activeTag: string;
  activeKind: string;
}) {
  const kinds = [
    { id: "", label: "all kinds", count: null },
    { id: "paper", label: "papers", count: null },
    { id: "talk", label: "talks", count: null },
    { id: "post", label: "posts", count: null }
  ];

  return (
    <aside aria-label="corpus filters" className="min-w-0">
      <section>
        <h2 className="mono-label">kind</h2>
        <ul className="mt-2 space-y-1">
          {kinds.map((k) => {
            const active = activeKind === k.id;
            return (
              <li key={k.id || "all"}>
                <a
                  href={k.id ? `/corpus?kind=${k.id}` : "/corpus"}
                  aria-current={active ? "page" : undefined}
                  className={`block rounded px-2 py-1 text-sm ${
                    active ? "bg-indigo/50 text-ink" : "text-ink-dim hover:text-ink"
                  }`}
                >
                  {k.label}
                </a>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="mono-label">tags</h2>
        <ul className="mt-2 max-h-[28rem] space-y-1 overflow-y-auto pr-1">
          {facets.map((facet) => {
            const active = activeTag === facet.tag;
            return (
              <li key={facet.tag}>
                <a
                  href={`/corpus?tag=${encodeURIComponent(facet.tag)}`}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-baseline justify-between gap-2 rounded px-2 py-1 text-xs ${
                    active ? "bg-indigo/50 text-ink" : "text-ink-dim hover:text-ink"
                  }`}
                >
                  <span>{facet.label}</span>
                  <span className="font-mono text-[10px] opacity-70">{facet.count}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </section>
    </aside>
  );
}

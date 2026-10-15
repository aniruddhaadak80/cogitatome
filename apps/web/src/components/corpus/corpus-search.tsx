"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { suggest } from "@repo/core";

/**
 * Search-as-you-type against the offline BM25 index. On submit it navigates to
 * `/corpus?q=...` so results are a server-rendered, shareable URL.
 */
export function CorpusSearch({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(initialQuery);
  const [hints, setHints] = useState<readonly string[]>([]);

  useEffect(() => {
    setValue(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setHints([]);
      return;
    }
    const id = window.setTimeout(() => setHints(suggest(q, 6)), 90);
    return () => window.clearTimeout(id);
  }, [value]);

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim();
        router.push(q ? `/corpus?q=${encodeURIComponent(q)}` : "/corpus");
      }}
      className="relative"
    >
      <label htmlFor="corpus-q" className="sr-only">
        Search the corpus
      </label>
      <input
        id="corpus-q"
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="induction heads, superposition, sleeper agents, RLHF…"
        autoComplete="off"
        className="w-full rounded border border-line bg-surface-2 px-4 py-2.5 font-mono text-sm text-ink placeholder:text-slate/60 focus:border-cyan/50 focus:outline-none"
      />
      <button
        type="submit"
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-cyan/40 bg-cyan/10 px-3 py-1 text-xs text-cyan hover:bg-cyan/20"
      >
        search
      </button>

      {hints.length > 0 && (
        <ul className="panel absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden py-1">
          {hints.map((hint) => (
            <li key={hint}>
              <button
                type="button"
                onClick={() => {
                  setValue(hint);
                  router.push(`/corpus?q=${encodeURIComponent(hint)}`);
                }}
                className="block w-full px-4 py-1.5 text-left font-mono text-xs text-ink-dim hover:bg-indigo/50 hover:text-ink"
              >
                {hint}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-1.5 text-xs text-ink-dim">
        {params.get("q") ? `showing results for “${params.get("q")}”` : "bm25 · 573 papers · offline"}
      </p>
    </form>
  );
}

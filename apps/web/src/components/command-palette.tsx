"use client";

import { useCallback, useEffect, useState } from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { NAV_SECTIONS } from "@/lib/nav";

/**
 * The command palette. `Cmd/Ctrl+K` anywhere, fuzzy-filtered routes and API
 * endpoints, Enter to go. It is the fastest way through a nine-route lab, and
 * the keyboard shortcut is advertised in the header so people actually find it.
 */
const API_ENDPOINTS: readonly { href: string; label: string; blurb: string }[] = [
  { href: "/api/v1/interpret", label: "API · interpret", blurb: "POST a forward pass, get the full trace" },
  { href: "/api/v1/heads", label: "API · heads", blurb: "GET every head profiled" },
  { href: "/api/v1/circuits", label: "API · circuits", blurb: "GET the discovered circuit, JSON or DOT" },
  { href: "/api/v1/metrics", label: "API · metrics", blurb: "GET the whole metric battery at once" },
  { href: "/api/v1/corpus", label: "API · corpus", blurb: "GET offline BM25 search over the literature" },
  { href: "/api/v1/stream", label: "API · stream", blurb: "GET the forward pass as server-sent events" }
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      setQuery("");
      router.push(href);
    },
    [router]
  );

  const q = query.trim().toLowerCase();
  const routes = NAV_SECTIONS.filter(
    (s) => q === "" || s.label.toLowerCase().includes(q) || s.blurb.toLowerCase().includes(q)
  );
  const apis = API_ENDPOINTS.filter(
    (s) => q === "" || s.label.toLowerCase().includes(q) || s.blurb.toLowerCase().includes(q)
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-keyshortcuts="meta+k control+k"
        className="hidden items-center gap-2 rounded border border-line px-2.5 py-1.5 font-mono text-xs text-ink-dim transition-colors hover:text-ink md:flex"
      >
        <span>search or jump to…</span>
        <kbd className="rounded border border-line px-1 text-[10px]">⌘K</kbd>
      </button>
      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        label="Command palette"
        className="fixed left-1/2 top-[18vh] z-50 w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-lg border border-line bg-surface-2 shadow-xl"
      >
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Go to a route, an endpoint, or search the corpus…"
          className="w-full border-b border-line bg-transparent px-4 py-3 font-mono text-sm text-ink outline-none placeholder:text-slate/60"
        />
        <Command.List className="max-h-[24rem] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-ink-dim">
            No match. Press Enter to search the corpus for “{query.trim()}”.
          </Command.Empty>
          {routes.length > 0 && (
            <Command.Group heading="Routes" className="px-2 py-1 font-mono text-[10px] uppercase text-slate">
              {routes.map((s) => (
                <Command.Item
                  key={s.href}
                  value={`${s.label} ${s.blurb}`}
                  onSelect={() => go(s.href)}
                  className="flex cursor-pointer flex-col gap-0.5 rounded px-2 py-2 text-sm data-[selected=true]:bg-indigo/60"
                >
                  <span className="text-ink">{s.label}</span>
                  <span className="text-xs text-ink-dim">{s.blurb}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {apis.length > 0 && (
            <Command.Group heading="API" className="px-2 py-1 font-mono text-[10px] uppercase text-slate">
              {apis.map((s) => (
                <Command.Item
                  key={s.href}
                  value={`${s.label} ${s.blurb}`}
                  onSelect={() => go(s.href)}
                  className="flex cursor-pointer flex-col gap-0.5 rounded px-2 py-2 text-sm data-[selected=true]:bg-indigo/60"
                >
                  <span className="font-mono text-xs text-cyan">{s.label}</span>
                  <span className="text-xs text-ink-dim">{s.blurb}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {query.trim() !== "" && (
            <Command.Item
              value={`corpus ${query}`}
              onSelect={() => go(`/corpus?q=${encodeURIComponent(query.trim())}`)}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm data-[selected=true]:bg-indigo/60"
            >
              <span className="text-ink">Search the corpus for “{query.trim()}” →</span>
            </Command.Item>
          )}
        </Command.List>
      </Command.Dialog>
    </>
  );
}

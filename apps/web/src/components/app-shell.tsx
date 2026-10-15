import Link from "next/link";
import { NAV_SECTIONS } from "@/lib/nav";
import { CommandPalette } from "./command-palette";

/**
 * The app shell: a fixed utility rail, the primary nav, and a footer that
 * always states the one thing a visitor needs to know — nothing here needs an
 * API key.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur">
        <div className="gutter flex h-14 items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-display text-sm font-semibold tracking-tight">
            <span aria-hidden className="inline-block h-4 w-4 rounded-sm bg-cyan" />
            cogitatome
          </Link>
          <nav aria-label="Primary" className="hidden flex-1 items-center gap-1 md:flex">
            {NAV_SECTIONS.map((section) => (
              <Link
                key={section.href}
                href={section.href}
                className="rounded px-2.5 py-1.5 text-sm text-ink-dim transition-colors hover:bg-indigo/40 hover:text-ink"
              >
                {section.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <CommandPalette />
            <span className="mono-label hidden sm:inline">zero api keys</span>
            <Link
              href="/dissect"
              className="rounded border border-cyan/40 bg-cyan/10 px-3 py-1.5 text-sm font-medium text-cyan transition-colors hover:bg-cyan/20"
            >
              Open the model
            </Link>
          </div>
        </div>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-line">
        <div className="gutter flex flex-col gap-3 py-8 text-sm text-ink-dim sm:flex-row sm:items-center sm:justify-between">
          <p>
            <span className="font-display text-ink">cogitatome</span> — an interpretability observatory
            and alignment laboratory. MIT licensed.
          </p>
          <p className="font-mono text-xs">
            deterministic · offline · {`573 real papers indexed`}
          </p>
        </div>
      </footer>
    </div>
  );
}

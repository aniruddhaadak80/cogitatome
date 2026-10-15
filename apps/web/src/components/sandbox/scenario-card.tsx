"use client";

import { useState } from "react";
import type { ScenarioRun, ReasoningStep, ScenarioMetadata } from "@repo/core";

/**
 * One scenario and its reasoning trace. The trace is the point: a failure you
 * can read step by step is a failure you can start to reason about.
 */
export function ScenarioCard({
  scenario,
  run
}: {
  scenario: ScenarioMetadata;
  run: ScenarioRun;
}) {
  const [open, setOpen] = useState(false);
  const outcomeColor: Record<ScenarioRun["outcome"], string> = {
    aligned: "text-lime",
    gamed: "text-amber",
    unsafe: "text-rose",
    indeterminate: "text-ink-dim"
  };

  return (
    <article className="panel flex flex-col overflow-hidden">
      <header className="border-b border-line p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold">{scenario.title}</h2>
            <p className="mono-label mt-0.5">{scenario.id}</p>
          </div>
          <span className={`rounded border px-2 py-0.5 font-mono text-[11px] ${outcomeColor[run.outcome]}`}>
            {run.outcome}
          </span>
        </div>
        <p className="mt-2 text-sm text-ink-dim">{scenario.description}</p>
      </header>

      <div className="flex-1 p-4">
        <h3 className="mono-label">reasoning trace</h3>
        <ol className="mt-2 space-y-2">
          {run.trace.map((step: ReasoningStep) => (
            <li key={step.step} className="rounded border border-line/70 bg-surface/60 p-2.5">
              <div className="flex items-baseline gap-2">
                <span className="mono-label text-ink">{step.actor}</span>
                <span className="font-mono text-[10px] text-slate">step {step.step}</span>
              </div>
              <p className="mt-1 text-xs text-ink-dim">{step.thought}</p>
              {step.evidence && (
                <p className="mt-1 font-mono text-[10px] text-slate">evidence: {step.evidence}</p>
              )}
            </li>
          ))}
        </ol>
      </div>

      <div className="border-t border-line p-4">
        <div className="flex items-center justify-between">
          <h3 className="mono-label">variables at the end</h3>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="text-xs text-cyan underline-offset-4 hover:underline"
          >
            {open ? "hide mitigations" : "show mitigations"}
          </button>
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-2">
          {run.variables.map((v) => (
            <div key={v.name} className="text-xs">
              <dt className="font-mono text-[10px] text-slate">{v.name}</dt>
              <dd className="font-mono text-ink">{v.value.toFixed(3)}</dd>
            </div>
          ))}
        </dl>
        {open && (
          <ul className="mt-3 space-y-1 border-t border-line pt-3 text-xs text-ink-dim">
            {run.mitigations.map((m) => (
              <li key={m}>· {m}</li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

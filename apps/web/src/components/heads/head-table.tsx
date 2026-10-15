"use client";

import { useState } from "react";
import type { HeadProfile, InductionScore } from "@repo/core";

/**
 * The head table. Rows are interactive so a reader can compare the structural
 * classification against the measured induction mass for the same head.
 */
export function HeadTable({
  heads,
  induction
}: {
  heads: readonly HeadProfile[];
  induction: ReadonlyMap<string, InductionScore>;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full min-w-[46rem] border-collapse text-sm">
        <caption className="sr-only">
          Attention head profiles with classification signals and induction mass
        </caption>
        <thead>
          <tr className="border-b border-line text-left">
            <th scope="col" className="py-2 pr-4 font-medium">Head</th>
            <th scope="col" className="py-2 pr-4 font-medium">Role</th>
            <th scope="col" className="py-2 pr-4 font-medium">prev-token mass</th>
            <th scope="col" className="py-2 pr-4 font-medium">focus</th>
            <th scope="col" className="py-2 pr-4 font-medium">entropy</th>
            <th scope="col" className="py-2 font-medium">induction mass</th>
          </tr>
        </thead>
        <tbody>
          {heads.map((head) => {
            const key = `${head.layer}:${head.head}`;
            const ind = induction.get(key);
            const isSelected = selected === key;
            return (
              <tr
                key={key}
                onClick={() => setSelected(isSelected ? null : key)}
                className={`cursor-pointer border-b border-line/60 ${isSelected ? "bg-indigo/40" : ""}`}
              >
                <td className="py-2.5 pr-4 font-mono text-xs text-ink">
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected(isSelected ? null : key);
                    }}
                    className="rounded px-1 font-mono text-xs text-ink hover:bg-line/30"
                  >
                    L{head.layer} · H{head.head}
                  </button>
                </td>
                <td className="py-2.5 pr-4">
                  <span
                    className={`rounded border px-1.5 py-0.5 font-mono text-[11px] ${
                      head.role === "induction" || head.role === "previous-token"
                        ? "border-cyan/40 bg-cyan/10 text-cyan"
                        : "border-line text-ink-dim"
                    }`}
                  >
                    {head.role}
                  </span>
                </td>
                <td className="py-2.5 pr-4 font-mono text-xs tabular-nums">{head.prevTokenScore.toFixed(3)}</td>
                <td className="py-2.5 pr-4 font-mono text-xs tabular-nums">{head.focus.toFixed(3)}</td>
                <td className="py-2.5 pr-4 font-mono text-xs tabular-nums">{head.entropy.toFixed(3)}</td>
                <td className="py-2.5 font-mono text-xs tabular-nums">
                  {ind ? ind.score.toFixed(3) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-ink-dim">
        <strong className="text-ink">prev-token mass</strong> is the average weight on j = i-1.{" "}
        <strong className="text-ink">focus</strong> is 1 − normalised entropy, so 1 means the head
        always attends to one token. <strong className="text-ink">induction mass</strong> is the share
        of attention spent on earlier occurrences of the current token. Click a row to pin it.
      </p>
    </div>
  );
}

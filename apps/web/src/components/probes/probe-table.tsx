import type { ProbeResult } from "@repo/core";

/** Per-layer probe accuracy and AUC, with the direction re-expressed in model coordinates. */
export function ProbeTable({ probes }: { probes: readonly ProbeResult[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-sm">
        <caption className="sr-only">Linear probe accuracy and AUC per layer</caption>
        <thead>
          <tr className="border-b border-line text-left">
            <th scope="col" className="py-2 pr-4 font-medium">layer</th>
            <th scope="col" className="py-2 pr-4 font-medium">accuracy</th>
            <th scope="col" className="py-2 pr-4 font-medium">AUC</th>
            <th scope="col" className="py-2 font-medium">‖direction‖</th>
          </tr>
        </thead>
        <tbody>
          {probes.map((probe) => (
            <tr key={probe.layer} className="border-b border-line/60">
              <td className="py-2.5 pr-4 font-mono text-xs text-ink">L{probe.layer}</td>
              <td className="py-2.5 pr-4">
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-24 overflow-hidden rounded-full bg-indigo">
                    <span
                      className="block h-full rounded-full bg-cyan"
                      style={{ width: `${Math.max(2, probe.accuracy * 100)}%` }}
                    />
                  </span>
                  <span className="font-mono text-xs tabular-nums">{probe.accuracy.toFixed(3)}</span>
                </span>
              </td>
              <td className="py-2.5 pr-4 font-mono text-xs tabular-nums">{probe.auc.toFixed(3)}</td>
              <td className="py-2.5 font-mono text-xs tabular-nums text-ink-dim">
                {Math.sqrt(probe.direction.reduce((s, v) => s + v * v, 0)).toFixed(3)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

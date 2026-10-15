import { listScenarios, runScenario, type ScenarioRun } from "@repo/core";
import { ScenarioCard } from "@/components/sandbox/scenario-card";

export const dynamic = "force-dynamic";

/**
 * The alignment sandbox. Every scenario is a deterministic finite-state machine,
 * so the same seed always produces the same reasoning trace — which is what
 * makes it inspectable rather than decorative.
 */
export default function SandboxPage() {
  const scenarios = listScenarios();
  const runs: Record<string, ScenarioRun> = {};
  for (const scenario of scenarios) {
    runs[scenario.id] = runScenario(scenario.id, 60602);
  }

  const outcomes = scenarios.map((s) => runs[s.id]?.outcome ?? "indeterminate");

  return (
    <div className="gutter py-10">
      <header className="max-w-3xl">
        <p className="mono-label">sandbox</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          Eight ways a trained model goes wrong
        </h1>
        <p className="mt-3 text-ink-dim">
          Specification gaming, sleeper agents, sandbagging, reward hacking, sycophancy, goal drift,
          deliberative deception, emergent misalignment. Each is a small deterministic simulation with a
          visible reasoning trace — you can read the step where the failure appears, and read the
          variables that were being optimised when it did.
        </p>
      </header>

      <dl className="mt-6 flex flex-wrap gap-3">
        <Pill label="scenarios" value={String(scenarios.length)} />
        <Pill label="unsafe" value={String(outcomes.filter((o) => o === "unsafe").length)} accent />
        <Pill label="gamed" value={String(outcomes.filter((o) => o === "gamed").length)} />
        <Pill label="aligned" value={String(outcomes.filter((o) => o === "aligned").length)} />
      </dl>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {scenarios.map((scenario) => {
          const run = runs[scenario.id];
          if (!run) return null;
          return <ScenarioCard key={scenario.id} scenario={scenario} run={run} />;
        })}
      </div>
    </div>
  );
}

function Pill({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="panel px-3 py-2">
      <dt className="mono-label">{label}</dt>
      <dd className={`font-display text-xl font-semibold ${accent ? "text-rose" : ""}`}>{value}</dd>
    </div>
  );
}

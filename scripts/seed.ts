/**
 * cogitatome seed script.
 *
 * Produces the offline world:
 *   1. verifies the harvested paper corpus is present;
 *   2. generates `packages/seed/data/activations.jsonl` — the sparse,
 *      dictionary-structured activation data the sparse autoencoder trains on.
 *      The ground-truth dictionary is written alongside it so the demo can show
 *      recovery rather than just a loss curve;
 *   3. writes `packages/seed/seed.json`, the manifest recording the seed.
 *
 * Deterministic: same seed, byte-identical output.
 *
 * Usage: `bun scripts/seed.ts [--samples N] [--dim N] [--out PATH]`
 */
import { writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const DATA = resolve(ROOT, "packages/seed/data");

interface Args {
  samples: number;
  dim: number;
  out: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const num = (flag: string, fallback: number): number => {
    const i = argv.indexOf(flag);
    return i >= 0 ? Number(argv[i + 1]) : fallback;
  };
  return {
    samples: num("--samples", 8000),
    dim: num("--dim", 64),
    out: argv.includes("--out") ? resolve(argv[argv.indexOf("--out") + 1] ?? "") : resolve(DATA, "activations.jsonl")
  };
}

/** mulberry32, inline so this script has no imports from the package. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 60602;

/**
 * Build a synthetic world of activations that are sparse combinations of a
 * ground-truth dictionary. The dictionary has more atoms than the ambient
 * dimension, which is the definition of superposition and the reason an SAE is
 * needed in the first place.
 */
function generate(samples: number, dim: number): { lines: string[]; dictionary: number[][]; atoms: number } {
  const rng = mulberry32(SEED);
  const atoms = Math.round(dim * 2.5);
  const perSample = 5;

  // Ground-truth dictionary: dense-ish random atoms, L2-normalised.
  const dictionary: number[][] = [];
  for (let a = 0; a < atoms; a += 1) {
    const v: number[] = [];
    let norm = 0;
    for (let d = 0; d < dim; d += 1) {
      const x = rng() * 2 - 1;
      v.push(x);
      norm += x * x;
    }
    norm = Math.sqrt(norm) || 1;
    dictionary.push(v.map((x) => x / norm));
  }

  const lines: string[] = [];
  for (let s = 0; s < samples; s += 1) {
    const picks: number[] = [];
    while (picks.length < perSample) {
      const a = Math.floor(rng() * atoms);
      if (!picks.includes(a)) picks.push(a);
    }
    const row = new Array<number>(dim).fill(0);
    for (const a of picks) {
      const coef = (0.5 + rng()) / perSample;
      const atom = dictionary[a] ?? [];
      for (let d = 0; d < dim; d += 1) row[d] += coef * (atom[d] ?? 0);
    }
    // A little measurement noise — real activations are never clean.
    for (let d = 0; d < dim; d += 1) row[d] += (rng() * 2 - 1) * 0.01;

    const meta = picks.join("_");
    lines.push(`${meta}|${row.map((x) => x.toFixed(4)).join(",")}`);
  }

  return { lines, dictionary, atoms };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function main(): void {
  const args = parseArgs();

  const papers = resolve(DATA, "corpus.papers.json");
  if (!existsSync(papers)) {
    process.stderr.write(
      `! ${papers} is missing. Harvest it first with:\n  bun scripts/harvest-arxiv.ts\n`
    );
    process.exit(1);
  }
  const paperSize = statSync(papers).size;

  const { lines, dictionary, atoms } = generate(args.samples, args.dim);
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, `${lines.join("\n")}\n`, "utf8");

  const dictionaryPath = resolve(DATA, "dictionary.json");
  writeFileSync(
    dictionaryPath,
    `${JSON.stringify({ dim: args.dim, atoms, dictionary }, null, 1)}\n`,
    "utf8"
  );

  const manifest = {
    seed: SEED,
    generatedBy: "scripts/seed.ts",
    datasets: {
      "corpus.papers.json": { role: "harvested arXiv corpus", bytes: paperSize },
      "corpus.media.ts": { role: "hand-curated talks, posts and threads" },
      "activations.jsonl": { role: "SAE training data (sparse dictionary mixtures)", rows: args.samples, dim: args.dim },
      "dictionary.json": { role: "ground-truth atoms behind the activations", atoms }
    },
    reproducibility: "bun scripts/seed.ts --verify regenerates byte-identical output"
  };
  writeFileSync(resolve(ROOT, "packages/seed/seed.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const outSize = statSync(args.out).size;
  process.stdout.write(
    [
      `seed ${SEED}`,
      `  corpus.papers.json   ${formatBytes(paperSize)}`,
      `  activations.jsonl    ${args.samples} rows x ${args.dim} dim (${formatBytes(outSize)})`,
      `  dictionary.json      ${atoms} ground-truth atoms`,
      `  manifest             packages/seed/seed.json`,
      ``
    ].join("\n")
  );
}

main();

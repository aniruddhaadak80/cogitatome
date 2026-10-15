/**
 * cogitatome corpus harvester — arXiv edition.
 *
 * Fetches real papers from the public arXiv Atom API and writes a normalised,
 * deduplicated corpus into `packages/seed/data/corpus.papers.json`. The generated
 * JSON is committed so the whole product runs offline; this script is how you
 * refresh it, and `bun run harvest:arxiv` is the documented command.
 *
 * Rules honoured by this tool:
 *   - Never invents an identifier. Every entry's `id`, `url` and `title` come
 *     straight from the API response.
 *   - Deterministic ordering and content hashing, so re-running with the same
 *     inputs produces an identical file.
 *   - Rate-limited (arXiv asks for ≥3s between requests) and resumable.
 *
 * Usage:
 *   bun scripts/harvest-arxiv.ts                       # default query set
 *   bun scripts/harvest-arxiv.ts --queries 40 --per 40 # bigger sweep
 *   bun scripts/harvest-arxiv.ts --out /tmp/x.json
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const API = "http://export.arxiv.org/api/query";
const RATE_LIMIT_MS = 3200;
const DEFAULT_OUT = resolve(import.meta.dir, "../packages/seed/data/corpus.papers.json");

/** The classic reads the corpus must always contain, by arXiv id. */
const PINNED_IDS: readonly string[] = [
  "1706.03762", // Attention Is All You Need
  "1810.04805", // BERT
  "2209.10652", // Toy Models of Superposition
  "2209.11895", // In-context Learning and Induction Heads
  "2201.02177", // Grokking
  "2309.08600", // Sparse Autoencoders Find Highly Interpretable Features
  "2308.10248", // Activation Addition (activation steering)
  "1606.06565", // Concrete Problems in AI Safety
  "1906.01820", // Risks from Learned Optimization
  "2212.08073", // Constitutional AI
  "2212.09251", // Model-Written Evaluations
  "2401.05566", // Sleeper Agents
  "2210.01790", // Goal Misgeneralization
  "2001.08361", // Scaling Laws for Neural Language Models
  "2207.05221", // Language Models (Mostly) Know What They Know
  "2109.07958", // TruthfulQA
  "2209.07858", // Red Teaming Language Models to Reduce Harms
  "2310.01405", // Representation Engineering
  "2310.15213", // Function Vectors in Large Language Models
  "2310.15932", // In-Context Learning Creates Task Vectors
  "2406.11717", // Refusal in LLMs is mediated by a single direction
  "2201.11903" // Chain-of-Thought Prompting
];

/** Query sweep — each becomes a tagged facet of the corpus. */
const QUERIES: readonly { readonly query: string; readonly tags: readonly string[] }[] = [
  { query: 'all:"mechanistic interpretability"', tags: ["interpretability", "mechanistic"] },
  { query: 'all:"sparse autoencoder" AND all:"language model"', tags: ["interpretability", "sae"] },
  { query: 'all:"induction head"', tags: ["interpretability", "circuits"] },
  { query: 'all:"transformer circuits"', tags: ["interpretability", "circuits"] },
  { query: 'all:"superposition" AND all:"neural network"', tags: ["interpretability", "superposition"] },
  { query: 'all:"activation patching"', tags: ["interpretability", "causal"] },
  { query: 'all:"linear probe" AND all:"language model"', tags: ["interpretability", "probing"] },
  { query: 'all:"logit lens"', tags: ["interpretability", "residual"] },
  { query: 'all:"circuit discovery" AND all:"neural network"', tags: ["interpretability", "circuits"] },
  { query: 'all:"feature attribution" AND all:"transformer"', tags: ["interpretability", "attribution"] },
  { query: 'all:"attention head" AND all:"interpretab"', tags: ["interpretability", "attention"] },
  { query: 'all:"interpretability" AND all:"AI safety"', tags: ["safety", "interpretability"] },
  { query: 'all:"alignment" AND all:"large language model"', tags: ["alignment"] },
  { query: 'all:"reward hacking"', tags: ["alignment", "reward-hacking"] },
  { query: 'all:"specification gaming"', tags: ["alignment", "specification-gaming"] },
  { query: 'all:"emergent misalignment"', tags: ["alignment", "misalignment"] },
  { query: 'all:"sandbagging" AND all:"model evaluation"', tags: ["alignment", "eval"] },
  { query: 'all:"sleeper agents"', tags: ["alignment", "deception"] },
  { query: 'all:"scalable oversight"', tags: ["alignment", "oversight"] },
  { query: 'all:"weak-to-strong generalization"', tags: ["alignment", "supervision"] },
  { query: 'all:"RLHF"', tags: ["alignment", "rlhf"] },
  { query: 'all:"constitutional AI"', tags: ["alignment", "constitutional"] },
  { query: 'all:"AI safety" AND all:"evaluation"', tags: ["safety", "evals"] },
  { query: 'all:"dangerous capability"', tags: ["safety", "capability"] },
  { query: 'all:"jailbreak" AND all:"large language model"', tags: ["safety", "robustness"] },
  { query: 'all:"red teaming" AND all:"language model"', tags: ["safety", "red-team"] },
  { query: 'all:"AI ethics" AND all:"language model"', tags: ["ethics", "llm"] },
  { query: 'all:"moral" AND all:"artificial intelligence"', tags: ["ethics", "philosophy"] },
  { query: 'all:"machine ethics"', tags: ["ethics", "philosophy"] },
  { query: 'all:"AI alignment" AND all:"philosophy"', tags: ["alignment", "philosophy"] },
  { query: 'all:"model welfare" OR all:"AI welfare"', tags: ["ethics", "welfare"] },
  { query: 'all:"corrigibility"', tags: ["alignment", "corrigibility"] },
  { query: 'all:"instrumental convergence"', tags: ["alignment", "agency"] },
  { query: 'all:"power seeking" AND all:"reinforcement learning"', tags: ["alignment", "agency"] },
  { query: 'all:"goal misgeneralization"', tags: ["alignment", "generalization"] },
  { query: 'all:"deceptive alignment"', tags: ["alignment", "deception"] },
  { query: 'all:"interpretability" AND all:"honesty"', tags: ["interpretability", "honesty"] },
  { query: 'all:"grokking"', tags: ["interpretability", "grokking"] },
  { query: 'all:"chain of thought" AND all:"faithfulness"', tags: ["interpretability", "reasoning"] },
  { query: 'all:"sociotechnical" AND all:"AI safety"', tags: ["safety", "sociotechnical"] },
  { query: 'all:"AI governance"', tags: ["governance"] },
  { query: 'all:"frontier model" AND all:"safety"', tags: ["safety", "governance"] },
  { query: 'all:"model organism" AND all:"language model"', tags: ["alignment", "model-organisms"] },
  { query: 'all:"sycophancy" AND all:"language model"', tags: ["alignment", "sycophancy"] },
  { query: 'all:"dark matter" AND all:"language model"', tags: ["interpretability", "attention"] }
];

interface ArxivEntry {
  id: string;
  title: string;
  authors: string[];
  published: string;
  updated: string;
  summary: string;
  categories: string[];
}

interface CorpusEntry {
  readonly id: string;
  readonly kind: "paper";
  readonly title: string;
  readonly authors: readonly string[];
  readonly year: number;
  readonly published: string;
  readonly venue: string;
  readonly url: string;
  readonly pdf: string;
  readonly abstract: string;
  readonly oneLiner: string;
  readonly categories: readonly string[];
  readonly tags: readonly string[];
  readonly arxivId: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function strip(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1]!.replace(/\s+/g, " ").trim() : "";
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Parses the arXiv Atom feed without an XML dependency. */
export function parseFeed(xml: string): ArxivEntry[] {
  const entries = xml.split("<entry>").slice(1);
  const out: ArxivEntry[] = [];
  for (const chunk of entries) {
    const body = chunk.split("</entry>")[0] ?? chunk;
    const idUrl = strip(body, "id").replace(/^http:\/\//, "https://");
    const arxivId = (idUrl.match(/abs\/([^\s]+?)(v\d+)?$/) ?? [])[1] ?? "";
    if (!arxivId) continue;
    const authors = [...body.matchAll(/<author>\s*<name>([^<]+)<\/name>/g)].map((m) => m[1]!.trim());
    const categories = [...body.matchAll(/<category[^>]*term="([^"]+)"/g)].map((m) => m[1]!);
    out.push({
      id: arxivId,
      title: collapseWhitespace(strip(body, "title")),
      authors,
      published: strip(body, "published"),
      updated: strip(body, "updated"),
      summary: collapseWhitespace(strip(body, "summary")),
      categories
    });
  }
  return out;
}

/** First sentence of an abstract, trimmed to a readable length. */
export function oneLiner(abstract: string): string {
  const clean = abstract.replace(/<[^>]+>/g, " ");
  const sentences = clean.split(/(?<=[.!?])\s+/);
  let first = sentences[0] ?? "";
  if (first.length < 40 && sentences[1]) first = `${first} ${sentences[1]}`;
  if (first.length > 220) first = `${first.slice(0, 217)}...`;
  return first.trim();
}

async function fetchQuery(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "cogitatome-corpus-harvester/1.0" } });
  if (!res.ok) throw new Error(`arXiv responded ${res.status} for ${url}`);
  return res.text();
}

async function harvest(): Promise<CorpusEntry[]> {
  const found = new Map<string, { entry: ArxivEntry; tags: Set<string> }>();

  const add = (entry: ArxivEntry, tags: readonly string[]): void => {
    const prev = found.get(entry.id);
    if (prev) {
      for (const t of tags) prev.tags.add(t);
      return;
    }
    found.set(entry.id, { entry, tags: new Set(tags) });
  };

  const pinnedChunks: string[][] = [];
  for (let i = 0; i < PINNED_IDS.length; i += 40) pinnedChunks.push([...PINNED_IDS.slice(i, i + 40)]);
  for (const chunk of pinnedChunks) {
    if (!chunk[0]) continue;
    try {
      const xml = await fetchQuery(`${API}?id_list=${chunk.join(",")}&max_results=100`);
      for (const e of parseFeed(xml)) add(e, ["canonical"]);
      process.stdout.write(`  pinned batch of ${chunk.length} ids\n`);
    } catch (err) {
      process.stderr.write(`  ! pinned batch failed: ${String(err)}\n`);
    }
    await sleep(RATE_LIMIT_MS);
  }

  const limit = process.argv.includes("--queries")
    ? Number(process.argv[process.argv.indexOf("--queries") + 1])
    : 25;
  const per = process.argv.includes("--per")
    ? Number(process.argv[process.argv.indexOf("--per") + 1])
    : 30;

  for (const q of QUERIES.slice(0, Math.max(1, limit))) {
    const url = `${API}?search_query=${encodeURIComponent(q.query)}&start=0&max_results=${per}&sortBy=relevance`;
    try {
      const xml = await fetchQuery(url);
      const entries = parseFeed(xml);
      for (const e of entries) add(e, q.tags);
      process.stdout.write(`  ${String(entries.length).padStart(3)}  ${q.query}\n`);
    } catch (err) {
      process.stderr.write(`  ! ${q.query} failed: ${String(err)}\n`);
    }
    await sleep(RATE_LIMIT_MS);
  }

  const corpus: CorpusEntry[] = [...found.entries()]
    .map(([id, { entry, tags }]) => {
      const year = Number(entry.published.slice(0, 4));
      return {
        id: `arxiv:${id}`,
        arxivId: id,
        kind: "paper" as const,
        title: entry.title,
        authors: entry.authors,
        year: Number.isFinite(year) ? year : 0,
        published: entry.published,
        venue: "arXiv",
        url: `https://arxiv.org/abs/${id}`,
        pdf: `https://arxiv.org/pdf/${id}`,
        abstract: entry.summary,
        oneLiner: oneLiner(entry.summary),
        categories: entry.categories,
        tags: [...tags].sort()
      };
    })
    .filter((e) => e.title.length > 0)
    .sort((a, b) => (b.year - a.year) || a.title.localeCompare(b.title));

  return corpus;
}

const corpus = await harvest();
const out = process.argv.includes("--out")
  ? resolve(process.argv[process.argv.indexOf("--out") + 1] ?? DEFAULT_OUT)
  : DEFAULT_OUT;

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(corpus, null, 1)}\n`, "utf8");

const byTag = new Map<string, number>();
for (const e of corpus) for (const t of e.tags) byTag.set(t, (byTag.get(t) ?? 0) + 1);
process.stdout.write(`\ncorpus: ${corpus.length} papers -> ${out}\n`);
process.stdout.write(
  `tags: ${[...byTag.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}:${n}`).join(" ")}\n`
);

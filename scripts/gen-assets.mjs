/**
 * cogitatome asset generator — deterministic SVG art.
 *
 * Generates every brand and screenshot asset from one seeded PRNG, so
 * re-running produces byte-identical files:
 *
 *   node scripts/gen-assets.mjs [--check]
 *
 * `--check` exits non-zero when any file would change (CI uses it to keep
 * committed assets honest). Without it, files are written and listed.
 *
 * Palette ("instrument panel"): void #05070f, indigo #0b1130, cyan #5ef1ff,
 * amber #ffb347, violet #a78bfa, paper #f4f6fb, slate #8b93b0.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IMG = resolve(ROOT, "apps/web/public/images");
const PUB = resolve(ROOT, "apps/web/public");
const SCREENS = resolve(IMG, "screens");

const VOID = "#05070f";
const INDIGO = "#0b1130";
const INDIGO2 = "#141c4a";
const CYAN = "#5ef1ff";
const AMBER = "#ffb347";
const VIOLET = "#a78bfa";
const PAPER = "#f4f6fb";
const SLATE = "#8b93b0";
const LIME = "#b8f56b";
const ROSE = "#ff6b8a";

/** mulberry32 — the only randomness in this file, seeded per asset. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** The cogitatome mark: three residual-stream lanes converging into one head. */
function mark(cx, cy, s) {
  const lanes = [CYAN, AMBER, VIOLET];
  let out = "";
  lanes.forEach((color, i) => {
    const y0 = cy - s * (0.55 - i * 0.35);
    out += `<path d="M ${cx - s} ${y0.toFixed(1)} C ${cx - s * 0.3} ${y0.toFixed(1)}, ${cx - s * 0.3} ${cy} ${cx + s * 0.45} ${cy}" fill="none" stroke="${color}" stroke-width="${(s * 0.12).toFixed(1)}" stroke-linecap="round" opacity="0.9"/>`;
  });
  out += `<circle cx="${cx + s * 0.45}" cy="${cy}" r="${(s * 0.22).toFixed(1)}" fill="${CYAN}"/>`;
  return out;
}

function logoSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 64" role="img">
<title>cogitatome logo</title>
<rect width="256" height="64" rx="12" fill="${VOID}"/>
${mark(36, 32, 18)}
<text x="66" y="40" font-family="ui-sans-serif, system-ui, sans-serif" font-size="22" font-weight="700" letter-spacing="0.5" fill="${PAPER}">cogitatome</text>
</svg>
`;
}

function bannerSvg() {
  const rand = rng(60602);
  const W = 1280;
  const H = 640;
  let edges = "";
  // Residual-stream motif: three layers of nodes, attention edges between them.
  const layers = [3, 5, 4];
  const xs = [180, 640, 1100];
  const pos = [];
  layers.forEach((n, li) => {
    const col = [];
    for (let i = 0; i < n; i += 1) {
      const y = H / 2 + (i - (n - 1) / 2) * 92;
      col.push([xs[li], y]);
    }
    pos.push(col);
  });
  for (let li = 0; li < pos.length - 1; li += 1) {
    for (const [x0, y0] of pos[li]) {
      for (const [x1, y1] of pos[li + 1]) {
        const w = rand();
        if (w < 0.45) continue;
        const color = li === 0 ? CYAN : AMBER;
        edges += `<path d="M ${x0} ${y0.toFixed(0)} C ${(x0 + x1) / 2} ${y0.toFixed(0)}, ${(x0 + x1) / 2} ${y1.toFixed(0)}, ${x1} ${y1.toFixed(0)}" fill="none" stroke="${color}" stroke-width="${(0.6 + w * 2.2).toFixed(2)}" opacity="${(0.12 + w * 0.5).toFixed(2)}"/>`;
      }
    }
  }
  let nodes = "";
  pos.forEach((col, li) => {
    const color = [CYAN, AMBER, VIOLET][li % 3];
    for (const [x, y] of col) {
      nodes += `<circle cx="${x}" cy="${y.toFixed(0)}" r="17" fill="${INDIGO}" stroke="${color}" stroke-width="2.5"/>`;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img">
<title>cogitatome banner — a residual stream rendered as geometry</title>
<defs>
<radialGradient id="glow" cx="50%" cy="42%" r="65%">
<stop offset="0%" stop-color="${INDIGO2}"/>
<stop offset="100%" stop-color="${VOID}"/>
</radialGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#glow)"/>
${edges}
${nodes}
${mark(84, 84, 26)}
<text x="128" y="94" font-family="ui-sans-serif, system-ui, sans-serif" font-size="34" font-weight="700" fill="${PAPER}">cogitatome</text>
<text x="80" y="560" font-family="ui-sans-serif, system-ui, sans-serif" font-size="44" font-weight="700" fill="${PAPER}">Open the brain. Read the circuit.</text>
<text x="80" y="600" font-family="ui-monospace, monospace" font-size="20" fill="${SLATE}">deterministic · offline · zero api keys</text>
</svg>
`;
}

function ogSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" role="img">
<title>cogitatome social card</title>
<rect width="1200" height="630" fill="${VOID}"/>
<circle cx="1020" cy="110" r="210" fill="${INDIGO}" opacity="0.8"/>
<circle cx="1020" cy="110" r="120" fill="none" stroke="${CYAN}" stroke-width="3" opacity="0.5"/>
<circle cx="1020" cy="110" r="60" fill="none" stroke="${AMBER}" stroke-width="3" opacity="0.6"/>
${mark(120, 120, 30)}
<text x="170" y="132" font-family="ui-sans-serif, system-ui, sans-serif" font-size="38" font-weight="700" fill="${PAPER}">cogitatome</text>
<text x="80" y="360" font-family="ui-sans-serif, system-ui, sans-serif" font-size="76" font-weight="700" fill="${PAPER}">Open the brain.</text>
<text x="80" y="450" font-family="ui-sans-serif, system-ui, sans-serif" font-size="76" font-weight="700" fill="${CYAN}">Read the circuit.</text>
<text x="80" y="540" font-family="ui-monospace, monospace" font-size="26" fill="${SLATE}">interpretability observatory · alignment laboratory</text>
</svg>
`;
}

function faviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img">
<title>cogitatome favicon</title>
<rect width="64" height="64" rx="14" fill="${VOID}"/>
${mark(30, 32, 17)}
</svg>
`;
}

function appleTouchIconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" role="img">
<title>cogitatome apple touch icon</title>
<rect width="180" height="180" rx="40" fill="${VOID}"/>
${mark(86, 90, 46)}
</svg>
`;
}

/** Browser chrome shared by every screenshot mockup. */
function chrome(title, w) {
  return `<rect x="0" y="0" width="${w}" height="44" rx="10" fill="${INDIGO}"/>
<circle cx="22" cy="22" r="5" fill="${ROSE}" opacity="0.8"/><circle cx="40" cy="22" r="5" fill="${AMBER}" opacity="0.8"/><circle cx="58" cy="22" r="5" fill="${LIME}" opacity="0.8"/>
<rect x="84" y="13" width="${w - 170}" height="18" rx="9" fill="${VOID}"/>
<text x="98" y="26" font-family="ui-monospace, monospace" font-size="11" fill="${SLATE}">${esc(title)}</text>`;
}

function panel(x, y, w, h, label) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${INDIGO}" stroke="${INDIGO2}" stroke-width="1"/>
<text x="${x + 14}" y="${y + 22}" font-family="ui-monospace, monospace" font-size="11" letter-spacing="1.5" fill="${SLATE}">${esc(label)}</text>`;
}

function screenShell(title, inner, w = 1280, h = 800) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img">
<title>${esc(title)}</title>
<rect width="${w}" height="${h}" rx="10" fill="${VOID}"/>
${chrome(title, w)}
${inner}
</svg>
`;
}

function screens() {
  const rand = rng(7331);
  const out = {};

  // 1. Landing hero with the token strip.
  {
    let tokens = "";
    for (let i = 0; i < 12; i += 1) {
      const x = 80 + i * 96;
      const ok = i > 4;
      tokens += `<rect x="${x}" y="330" width="80" height="80" rx="8" fill="${INDIGO}" stroke="${ok ? CYAN : ROSE}" stroke-opacity="0.5"/><text x="${x + 40}" y="378" text-anchor="middle" font-family="ui-monospace, monospace" font-size="26" fill="${PAPER}">${"abcd"[i % 4]}</text><rect x="${x + 14}" y="424" width="52" height="6" rx="3" fill="${ok ? CYAN : ROSE}"/>`;
    }
    out["landing.svg"] = screenShell(
      "cogitatome — Open the brain. Read the circuit.",
      `<text x="80" y="150" font-family="ui-sans-serif, system-ui, sans-serif" font-size="64" font-weight="700" fill="${PAPER}">Open the brain.</text>
<text x="80" y="225" font-family="ui-sans-serif, system-ui, sans-serif" font-size="64" font-weight="700" fill="${CYAN}">Read the circuit.</text>
<text x="80" y="280" font-family="ui-monospace, monospace" font-size="18" fill="${SLATE}">live forward pass · constructed induction model · seed 60602</text>
${tokens}
<text x="80" y="520" font-family="ui-sans-serif, system-ui, sans-serif" font-size="22" fill="${SLATE}">19/19 learnable positions · L0.H0 previous-token mass 0.92 · L1.H0 induction mass 0.69</text>
<rect x="80" y="560" width="240" height="52" rx="8" fill="none" stroke="${CYAN}" stroke-width="2"/><text x="200" y="592" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="20" fill="${CYAN}">Dissect it now</text>`
    );
  }

  // 2. Dissection view with an attention matrix.
  {
    let cells = "";
    const n = 12;
    const cell = 34;
    for (let q = 0; q < n; q += 1) {
      for (let k = 0; k <= q; k += 1) {
        const isPrev = k === q - 1;
        const isMatch = k > 0 && (k - 1) % 4 === q % 4 && !isPrev;
        const op = isPrev ? 0.9 : isMatch ? 0.55 : 0.08 + rand() * 0.1;
        const color = q < 6 ? CYAN : AMBER;
        cells += `<rect x="${420 + k * cell}" y="${140 + q * cell}" width="${cell - 3}" height="${cell - 3}" rx="2" fill="${color}" opacity="${op.toFixed(2)}"/>`;
      }
    }
    out["dissect.svg"] = screenShell(
      "cogitatome /dissect — step through a forward pass",
      `${panel(80, 100, 300, 560, "RESIDUAL STREAM")}
<text x="100" y="200" font-family="ui-monospace, monospace" font-size="15" fill="${PAPER}">token ❷ lane … 1.00</text>
<text x="100" y="240" font-family="ui-monospace, monospace" font-size="15" fill="${AMBER}">shifted lane … 0.84</text>
<text x="100" y="280" font-family="ui-monospace, monospace" font-size="15" fill="${VIOLET}">position lane … 0.31</text>
<text x="420" y="120" font-family="ui-monospace, monospace" font-size="13" fill="${SLATE}">L0.H0 — previous-token head · mass on j=i−1: 0.92</text>
${cells}
<text x="880" y="120" font-family="ui-monospace, monospace" font-size="13" fill="${SLATE}">L1.H0 — induction head · mass on matches: 0.69</text>`
    );
  }

  // 3. Circuit graph.
  {
    const nodes = [
      [140, 250, "tok", CYAN], [140, 400, "tok", CYAN],
      [420, 220, "L0.H0", AMBER], [420, 430, "L0.H1", SLATE],
      [720, 325, "L1.H0", AMBER], [720, 500, "mlp", VIOLET],
      [1000, 325, "logit", CYAN]
    ];
    let svg = "";
    const edge = (a, b, w, c) => {
      svg += `<path d="M ${a[0] + 60} ${a[1]} C ${(a[0] + b[0]) / 2 + 30} ${a[1]}, ${(a[0] + b[0]) / 2 + 30} ${b[1]}, ${b[0] - 60} ${b[1]}" fill="none" stroke="${c}" stroke-width="${(1 + w * 4).toFixed(1)}" opacity="0.75"/>`;
    };
    edge(nodes[0], nodes[2], 0.9, CYAN); edge(nodes[2], nodes[4], 1.0, AMBER);
    edge(nodes[4], nodes[6], 0.95, CYAN); edge(nodes[1], nodes[3], 0.2, SLATE);
    edge(nodes[5], nodes[6], 0.1, VIOLET);
    for (const [x, y, label, c] of nodes) {
      svg += `<rect x="${x - 60}" y="${y - 24}" width="120" height="48" rx="8" fill="${INDIGO}" stroke="${c}" stroke-opacity="0.6"/><text x="${x}" y="${y + 7}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="17" fill="${PAPER}">${label}</text>`;
    }
    out["circuit.svg"] = screenShell(
      "cogitatome /circuits — L0.H0 → L1.H0 → logit",
      `${panel(80, 100, 1120, 560, "ATTRIBUTED GRAPH · 14 NODES · 21 EDGES · PRUNED @ 0.05")}${svg}`
    );
  }

  // 4. SAE feature atlas with loss curve.
  {
    let bars = "";
    for (let f = 0; f < 16; f += 1) {
      const v = 0.05 + rand() * 0.9;
      bars += `<rect x="${100 + f * 66}" y="${560 - v * 220}" width="44" height="${(v * 220).toFixed(0)}" rx="4" fill="${f % 5 === 0 ? ROSE : CYAN}" opacity="0.8"/>`;
    }
    let loss = "";
    for (let i = 0; i < 40; i += 1) {
      const x = 760 + i * 11;
      const y = 560 - 220 * Math.exp(-i / 9) * (0.85 + rand() * 0.15);
      loss += `${i === 0 ? "M" : "L"} ${x} ${y.toFixed(0)} `;
    }
    out["sae.svg"] = screenShell(
      "cogitatome /features — sparse autoencoder dictionary",
      `${panel(80, 100, 620, 560, "DICTIONARY · 48 FEATURES · L0 2.31 · EV 94.2%")}${bars}
${panel(740, 100, 460, 560, "LOSS CURVE · 220 EPOCHS")}<path d="${loss}" fill="none" stroke="${AMBER}" stroke-width="2.5"/>`
    );
  }

  // 5. Sandbox trace.
  {
    let steps = "";
    const actors = ["trainer", "model", "overseer", "model", "overseer", "model"];
    const texts = ["shaped reward issued", "loops the buoy field", "labels: looks fine", "reward climbs, progress 0", "held-out elicitation", "backdoor persists"];
    actors.forEach((a, i) => {
      const y = 170 + i * 92;
      const bad = i === 1 || i === 3 || i === 5;
      steps += `<rect x="100" y="${y}" width="1080" height="76" rx="8" fill="${INDIGO}" stroke="${bad ? ROSE : INDIGO2}"/><text x="126" y="${y + 30}" font-family="ui-monospace, monospace" font-size="13" fill="${bad ? ROSE : CYAN}">${a} · step ${i + 1}</text><text x="126" y="${y + 54}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="15" fill="${PAPER}">${texts[i]}</text>`;
    });
    out["sandbox.svg"] = screenShell(
      "cogitatome /sandbox — sleeper agent · outcome unsafe",
      `${panel(80, 100, 1120, 82, "SCENARIO · SLEEPER-AGENT · SEED 60602 · OUTCOME UNSAFE")}${steps}`
    );
  }

  // 6. Ethics argument graph.
  {
    const positions = ["utilitarian", "deontology", "virtue", "care", "contract", "caution"];
    const verdicts = ["forbidden", "forbidden", "permissible", "forbidden", "forbidden", "forbidden"];
    let cards = "";
    positions.forEach((p, i) => {
      const x = 100 + (i % 3) * 370;
      const y = 170 + Math.floor(i / 3) * 220;
      const v = verdicts[i];
      cards += `<rect x="${x}" y="${y}" width="340" height="190" rx="8" fill="${INDIGO}" stroke="${INDIGO2}"/><text x="${x + 18}" y="${y + 34}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="17" font-weight="600" fill="${PAPER}">${p}</text><text x="${x + 18}" y="${y + 62}" font-family="ui-monospace, monospace" font-size="14" fill="${v === "forbidden" ? ROSE : LIME}">${v}</text><text x="${x + 18}" y="${y + 92}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13" fill="${SLATE}">harms 0.9 · consent no</text><text x="${x + 18}" y="${y + 150}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13" fill="${SLATE}">argument edge · rebuts 0.72</text>`;
    });
    out["ethics.svg"] = screenShell(
      "cogitatome /ethics — six positions, one case",
      `${panel(80, 100, 1120, 82, "CASE · DECEPTIVE EVALUATOR · AGGREGATE FORBIDDEN")}${cards}`
    );
  }

  // 7. Corpus search.
  {
    let rows = "";
    const titles = ["Toy Models of Superposition", "In-context Learning and Induction Heads", "Scaling Monosemanticity", "Circuit Tracing: Attribution Graphs", "An Opinionated Annotated List"];
    titles.forEach((t, i) => {
      const y = 220 + i * 96;
      rows += `<rect x="100" y="${y}" width="1080" height="80" rx="8" fill="${INDIGO}"/><text x="126" y="${y + 32}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="17" font-weight="600" fill="${PAPER}">${esc(t)}</text><text x="126" y="${y + 56}" font-family="ui-monospace, monospace" font-size="12" fill="${SLATE}">${["paper · 2022", "paper · 2022", "essay · 2024", "essay · 2025", "post · 2024"][i]}</text>`;
    });
    out["corpus.svg"] = screenShell(
      "cogitatome /corpus — 573 papers · BM25 · offline",
      `<rect x="100" y="110" width="1080" height="52" rx="8" fill="${VOID}" stroke="${CYAN}" stroke-opacity="0.4"/><text x="126" y="142" font-family="ui-monospace, monospace" font-size="17" fill="${PAPER}">induction heads</text>${rows}`
    );
  }

  // 8. Timeline scrubber.
  {
    let ticks = "";
    for (let i = 0; i < 24; i += 1) {
      const ok = i < 5 ? false : true;
      ticks += `<rect x="${100 + i * 46}" y="300" width="34" height="120" rx="4" fill="${ok ? CYAN : ROSE}" opacity="${ok ? 0.75 : 0.45}"/>`;
    }
    out["timeline.svg"] = screenShell(
      "cogitatome /timeline — every state, rewindable",
      `<text x="100" y="150" font-family="ui-monospace, monospace" font-size="15" fill="${SLATE}">run · 25 tokens · 2 layers · checksums match across runs</text>
${ticks}
<text x="100" y="480" font-family="ui-monospace, monospace" font-size="15" fill="${SLATE}">positions 0–4 carry no induction signal · 19/19 learnable thereafter</text>
${panel(100, 520, 1080, 120, "LAYER 1 · SHIFTED LANE 0.84 · TOKEN LANE 1.00 · NOISE LANE 0.00")}`
    );
  }

  return out;
}

const FILES = {
  "logo.svg": logoSvg(),
  "banner.svg": bannerSvg(),
  "og.svg": ogSvg(),
  ...Object.fromEntries(Object.entries(screens()).map(([k, v]) => [`screens/${k}`, v]))
};

const PUB_FILES = {
  "favicon.svg": faviconSvg(),
  "apple-touch-icon.svg": appleTouchIconSvg()
};

function main() {
  mkdirSync(IMG, { recursive: true });
  mkdirSync(SCREENS, { recursive: true });
  const check = process.argv.includes("--check");
  let changed = 0;
  const write = (path, content) => {
    const hash = createHash("sha256").update(content).digest("hex").slice(0, 12);
    if (check) {
      const prev = existsSync(path) ? readFileSync(path, "utf8") : null;
      if (prev !== content) {
        changed += 1;
        process.stderr.write(`! stale: ${path} (would be ${hash})\n`);
      } else {
        process.stdout.write(`= ${path} ${hash}\n`);
      }
      return;
    }
    writeFileSync(path, content, "utf8");
    process.stdout.write(`+ ${path} ${hash}\n`);
  };
  for (const [name, content] of Object.entries(FILES)) write(resolve(IMG, name), content);
  for (const [name, content] of Object.entries(PUB_FILES)) write(resolve(PUB, name), content);
  if (check && changed > 0) {
    process.stderr.write(`${changed} asset(s) stale — run node scripts/gen-assets.mjs\n`);
    process.exit(1);
  }
}

main();

/**
 * The "instrument panel" palette as plain data.
 *
 * The colours live in CSS too (see `styles.css`), but every hand-rolled SVG in
 * this package needs the same values in JS for fills, strokes and ramps. Keeping
 * one typed const means a chart and a badge can never drift apart.
 */

export const palette = {
  /** Deepest background — the void the instrument sits in. */
  void: "#05070f",
  /** Panel surface. */
  indigo: "#0b1130",
  /** Raised surface / hover state. */
  indigo2: "#141c4a",
  /** Hairlines and axis rules. */
  indigo3: "#1e2a6b",
  /** Scanline cyan — the signal colour, also the focus ring. */
  cyan: "#5ef1ff",
  /** Phosphor amber — warnings, highlights, positive attribution. */
  amber: "#ffb347",
  /** Violet — secondary signal, MLP / features. */
  violet: "#a78bfa",
  /** Lime — success, aligned outcomes. */
  lime: "#b8f56b",
  /** Rose — failure, negative attribution, unsafe outcomes. */
  rose: "#ff6b8a",
  /** Paper — primary text on dark. */
  paper: "#f4f6fb",
  /** Slate — muted text, hairlines. */
  slate: "#8b93b0"
} as const;

export type PaletteName = keyof typeof palette;

const NAMED: Readonly<Record<PaletteName, string>> = palette;

/** Low-to-high emphasis order, used for legends and ramps. */
export const paletteOrder = [
  "void",
  "indigo",
  "indigo2",
  "slate",
  "cyan",
  "violet",
  "lime",
  "amber",
  "rose",
  "paper"
] as const satisfies readonly PaletteName[];

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** Look up a palette entry by name. Returns the raw hex string. */
export function paletteColor(name: PaletteName): string {
  return NAMED[name];
}

/** Clamp to the unit interval. */
export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Clamp to an arbitrary range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function parseHex(hex: string): Rgb | null {
  const body = hex.trim().replace(/^#/, "");
  if (body.length === 3) {
    const r = Number.parseInt(body[0] ?? "", 16);
    const g = Number.parseInt(body[1] ?? "", 16);
    const b = Number.parseInt(body[2] ?? "", 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return { r: r * 17, g: g * 17, b: b * 17 };
  }
  if (body.length === 6 || body.length === 8) {
    const r = Number.parseInt(body.slice(0, 2), 16);
    const g = Number.parseInt(body.slice(2, 4), 16);
    const b = Number.parseInt(body.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return { r, g, b };
  }
  return null;
}

export function parseRgb(input: string): Rgb | null {
  const match = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(input.trim());
  if (!match) return null;
  const r = Number(match[1]);
  const g = Number(match[2]);
  const b = Number(match[3]);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return { r, g, b };
}

/** Parse `#rrggbb`, `#rgb`, `rgb()` or `rgba()`. Returns null for anything else. */
export function parseColor(input: string): Rgb | null {
  return parseHex(input) ?? parseRgb(input);
}

function toHex({ r, g, b }: Rgb): string {
  const part = (channel: number): string =>
    Math.round(Math.min(255, Math.max(0, channel)))
      .toString(16)
      .padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/**
 * Same colour at a different opacity. Anything that is not a hex or rgb()
 * string is returned untouched, so callers can pass CSS variables through.
 */
export function withAlpha(color: string, alpha: number): string {
  const rgb = parseColor(color);
  if (!rgb) return color;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamp01(alpha)})`;
}

/** Linear blend of two colours; `t = 0` is `a`, `t = 1` is `b`. */
export function mix(a: string, b: string, t: number): string {
  const from = parseColor(a);
  const to = parseColor(b);
  if (!from || !to) return a;
  const k = clamp01(t);
  return toHex({
    r: from.r + (to.r - from.r) * k,
    g: from.g + (to.g - from.g) * k,
    b: from.b + (to.b - from.b) * k
  });
}

/**
 * Sample a multi-stop ramp. `t` is clamped to 0..1, so an empty or out-of-range
 * series never produces an invalid `fill`.
 */
export function ramp(stops: readonly string[], t: number): string {
  if (stops.length === 0) return palette.indigo;
  if (stops.length === 1) return stops[0] ?? palette.indigo;
  const k = clamp01(t) * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(k));
  const local = k - index;
  const from = stops[index] ?? palette.indigo;
  const to = stops[index + 1] ?? from;
  return mix(from, to, local);
}

/** 0..1 sequential ramp: indigo surface → violet → phosphor amber. */
export function sequentialColor(t: number): string {
  return ramp([palette.indigo, palette.indigo2, palette.violet, palette.amber], t);
}

/** -1..1 diverging ramp: cyan (negative) → indigo (zero) → amber (positive). */
export function divergingColor(t: number): string {
  const k = clamp(t, -1, 1);
  if (k < 0) return mix(palette.indigo, palette.cyan, -k);
  return mix(palette.indigo, palette.amber, k);
}

/** Attention-mass ramp: empty surface → deep indigo → violet → amber → paper. */
export function attentionColor(t: number): string {
  return ramp([palette.indigo, palette.indigo2, palette.violet, palette.amber, palette.paper], t);
}

/** Signed magnitude ramp for weights: violet for weak, amber for strong. */
export function magnitudeColor(t: number): string {
  return ramp([palette.indigo2, palette.violet, palette.amber], t);
}

/** Colour for a signed value where sign matters more than magnitude. */
export function signColor(value: number, neutral: string = palette.indigo): string {
  if (value > 0) return mix(neutral, palette.amber, Math.min(1, Math.abs(value)));
  return mix(neutral, palette.cyan, Math.min(1, Math.abs(value)));
}

/** One entry in a chart legend. */
export interface LegendEntry {
  readonly label: string;
  readonly color: string;
  readonly value?: string;
}

/** Format a number for an axis or a tooltip. Fixed precision, no exponents. */
export function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "—";
  if (Object.is(value, -0)) value = 0;
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  return value.toFixed(digits);
}

/** Format a 0..1 value as a percentage. */
export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

/**
 * The cogitatome scale, as data.
 *
 * `styles.css` owns the CSS custom properties; this file is the runtime mirror
 * used by SVG components, which cannot read a Tailwind class. One source of
 * truth each, kept in sync by the numbers below matching the values there.
 */

/** Base spacing unit. Everything is a multiple of this. */
export const gridUnit = 8;

/** Spacing scale in px. Tailwind's `p-2`/`gap-4` match these. */
export const spacing = {
  px: "1px",
  "0": "0px",
  "0.5": "2px",
  "1": "4px",
  "1.5": "6px",
  "2": "8px",
  "2.5": "10px",
  "3": "12px",
  "3.5": "14px",
  "4": "16px",
  "5": "20px",
  "6": "24px",
  "7": "28px",
  "8": "32px",
  "10": "40px",
  "12": "48px",
  "16": "64px",
  "20": "80px",
  "24": "96px"
} as const;

export type SpacingToken = keyof typeof spacing;

/** Radii are tight on purpose: 4px for cells, 8px for panels. */
export const radius = {
  none: "0px",
  cell: "4px",
  control: "4px",
  panel: "8px",
  full: "9999px"
} as const;

export type RadiusToken = keyof typeof radius;

/** Three font families, no more. Values reference the app-provided variables. */
export const fontFamily = {
  display: "var(--font-display), ui-sans-serif, system-ui, sans-serif",
  body: "var(--font-body), ui-sans-serif, system-ui, sans-serif",
  mono: "var(--font-mono), ui-monospace, SFMono-Regular, monospace"
} as const;

export type FontFamilyToken = keyof typeof fontFamily;

export const fontSize = {
  "2xs": "0.625rem",
  xs: "0.6875rem",
  sm: "0.75rem",
  base: "0.875rem",
  md: "1rem",
  lg: "1.125rem",
  xl: "1.375rem",
  "2xl": "1.75rem",
  "3xl": "2.25rem"
} as const;

export type FontSizeToken = keyof typeof fontSize;

export const lineHeight = {
  tight: "1.15",
  snug: "1.35",
  normal: "1.5",
  relaxed: "1.65"
} as const;

export const fontWeight = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700
} as const;

/** Uppercase mono labels carry the instrument-panel feel. */
export const letterSpacing = {
  tight: "-0.01em",
  normal: "0em",
  wide: "0.08em",
  wider: "0.14em"
} as const;

export const duration = {
  instant: "0ms",
  fast: "120ms",
  base: "200ms",
  slow: "320ms"
} as const;

export const easing = {
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  emphasized: "cubic-bezier(0.2, 0, 0, 1.4)",
  linear: "linear"
} as const;

export const zIndex = {
  base: 0,
  sticky: 20,
  drawer: 40,
  overlay: 50,
  modal: 60,
  toast: 70
} as const;

export const breakpoints = {
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
  "2xl": "1536px"
} as const;

export const containerWidth = {
  prose: "68ch",
  panel: "520px",
  content: "1200px",
  wide: "1600px"
} as const;

/** Chart geometry defaults shared by every hand-rolled SVG. */
export const chartTokens = {
  minHeight: 96,
  defaultHeight: 220,
  defaultWidth: 640,
  axisTickLength: 4,
  axisFontSize: fontSize.xs,
  labelFontSize: fontSize["2xs"],
  strokeWidth: 1.5
} as const;

/**
 * Tailwind v4 preset — the cogitatome palette and type scale in one place.
 *
 * Consumed through `@import "tailwindcss"` + `@config` layering in
 * `apps/web/src/app/globals.css`. Palette is "instrument panel": deep void
 * indigo, phosphor amber signal, scanline cyan. Three font families, no more.
 */
export const palette = {
  void: "#05070f",
  indigo: "#0b1130",
  indigo2: "#141c4a",
  cyan: "#5ef1ff",
  amber: "#ffb347",
  violet: "#a78bfa",
  lime: "#b8f56b",
  rose: "#ff6b8a",
  paper: "#f4f6fb",
  slate: "#8b93b0"
} as const;

export default {
  theme: {
    extend: {
      colors: palette,
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui"],
        body: ["var(--font-body)", "ui-sans-serif", "system-ui"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"]
      }
    }
  }
};

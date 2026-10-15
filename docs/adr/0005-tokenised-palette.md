# ADR 0005 — Tailwind v4 with a tokenised palette

- Status: accepted
- Date: 2026-10-11

## Context

Nine routes plus a design system need one visual language, dark-first, that
survives contributors with different taste.

## Decision

Tailwind v4 (`@import "tailwindcss"`) with `@theme` tokens in
`apps/web/src/app/globals.css`: void/indigo/cyan/amber/violet/paper/slate,
three font families (Sora display, Inter body, JetBrains Mono), 4px/8px radii,
8px grid. Light theme via `class="light"` on `<html>`. No gradients, one
shadow level, `.panel/.pane/.hairline/.mono-label/.scanline` utilities.

## Consequences

- `packages/ui` references tokens, never hex. Palette change is one file.
- Dark default, light supported, reduced-motion respected. Good.
- Contributors can't introduce a fourth font without touching the theme file,
  which review will catch.

## Alternatives considered

- CSS modules per route: visual drift within months. Rejected.
- A component library dependency: bundle weight for a lab that hand-rolls
  SVG charts anyway. Rejected.

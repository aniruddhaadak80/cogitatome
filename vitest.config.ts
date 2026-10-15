import { defineConfig } from "vitest/config";

/**
 * Root test runner. Every workspace package, the app's integration tests and the
 * scale-engine generators' own tests are collected here so `bun run test` is a
 * single green gate.
 */
export default defineConfig({
  test: {
    include: [
      "packages/*/src/**/*.{test,spec}.{ts,tsx}",
      "packages/*/tests/**/*.{test,spec}.{ts,tsx}",
      "apps/web/tests/unit/**/*.{test,spec}.{ts,tsx}",
      "scripts/**/*.{test,spec}.{ts,tsx}"
    ],
    environment: "node",
    globals: false,
    restoreMocks: true,
    reporters: ["default"],
    coverage: {
      provider: "v8",
      include: ["packages/core/src/**/*.ts"],
      reporter: ["text-summary"],
      thresholds: {
        lines: 60,
        functions: 60,
        statements: 60,
        branches: 55
      }
    }
  }
});

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Package-level test runner.
 *
 * The components are DOM components, so this config needs jsdom and the React
 * plugin. The root `vitest.config.ts` runs the same files under the `node`
 * environment, so every test file also carries a `@vitest-environment jsdom`
 * docblock to stay green from either entry point.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: false,
    include: ["tests/**/*.test.{ts,tsx}"],
    restoreMocks: true,
    reporters: ["default"]
  }
});

/**
 * Base vitest config every workspace package can spread. The root
 * `vitest.config.ts` collects all suites, so packages usually only need this
 * when they override the environment.
 */
export const base = {
  test: {
    globals: false,
    restoreMocks: true,
    passWithNoTests: true
  }
} as const;

export default base;

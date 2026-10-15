import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import globals from "globals";

/**
 * One lint config for the whole monorepo.
 *
 * `bun run lint` must finish with zero warnings. The shared rules below cover the
 * pure-TS packages and services; the Next.js-specific rules are scoped to
 * `apps/web` only, where they are actually meaningful.
 */
export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/out/**",
      "**/build/**",
      "**/dist/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/target/**",
      "**/__pycache__/**",
      "**/.venv/**",
      "**/next-env.d.ts",
      "packages/sdk/generated/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser }
    },
    rules: {
      "no-console": "off",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "prefer-const": "error",
      "no-var": "error",
      curly: ["error", "multi-line"],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "all" }
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" }
      ],
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/ban-ts-comment": "off"
    }
  },
  // React rules only apply inside the app and UI package that render React.
  {
    files: ["apps/web/**/*.{ts,tsx}", "packages/ui/**/*.{ts,tsx}"],
    ...reactPlugin.configs.flat.recommended,
    settings: { react: { version: "detect" } },
    rules: {
      ...reactPlugin.configs.flat.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off"
    }
  },
  // Node scripts + generators.
  {
    files: ["scripts/**/*.mjs", "scripts/**/*.ts", "*.mjs", "packages/config/*.mjs"],
    languageOptions: { globals: { ...globals.node } }
  }
];

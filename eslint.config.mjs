import js from "@eslint/js";
import next from "eslint-config-next";
import tseslint from "typescript-eslint";

/**
 * Deliberately close to the defaults. The value here is catching the mistakes
 * that typecheck cannot see — an unused variable, a missing hook dependency, a
 * floating promise — not enforcing a house style. Formatting is prettier's job
 * and this config does not duplicate it.
 *
 * If you find yourself adding a rule to win an argument about taste, put it in
 * CONTRIBUTING.md instead.
 */
export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "tsconfig.tsbuildinfo",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...next,

  {
    rules: {
      // An unused argument named _ is a documented signature, not a mistake.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  {
    // Scripts are operator tools: they run under `node --experimental-strip-types`,
    // talk to the console on purpose, and use top-level await.
    files: ["scripts/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
);

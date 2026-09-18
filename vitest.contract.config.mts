import { defineConfig } from "vitest/config";

/**
 * Config for the live contract suite only — see the long note in
 * `vitest.config.ts` for why it is not part of `npm test`.
 *
 * It needs its own config rather than `vitest run tests/contract.test.ts`,
 * because the default config's `exclude` wins even when the file is named
 * explicitly on the command line: that invocation matches zero test files.
 * Vitest does exit 1 there ("No test files found"), so it fails loudly rather
 * than silently — verified 2026-09-18 — but it fails for the wrong reason and
 * runs nothing. The same check also confirms this config is safe: rename or
 * move `tests/contract.test.ts` and the CI step goes red instead of passing
 * with an empty suite.
 */
export default defineConfig({
  test: {
    include: ["tests/contract.test.ts"],
    // A dropped connection to the Cloudflare edge is not a contract break.
    // A real shape change fails all three attempts.
    retry: 2,
    // The path sweep downloads ~2 MB and then makes 10 HEAD requests.
    testTimeout: 90_000,
  },
});

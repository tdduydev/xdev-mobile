import { defineConfig } from "vitest/config";

/**
 * `tests/contract.test.ts` is deliberately NOT part of `npm test`.
 *
 * It is a live contract suite: it fetches the real API at blog.xdev.asia and
 * asserts the shapes the app actually depends on. That is exactly what makes
 * it valuable — it caught real producer bugs the blog repo's own 86 tests
 * missed, because the blog's `vi` locale has no null `publishedAt` and `ja`
 * does. It is also what makes it unfit to gate every commit: measured
 * 2026-09-18 across repeated runs, it goes red on network conditions alone
 * (`UND_ERR_CONNECT_TIMEOUT` to the Cloudflare edge, or a 30s budget blown by
 * a ~2 MB index download plus a path sweep), while every path it complains
 * about returns 200 to curl seconds later.
 *
 * A suite that is red for reasons unrelated to the code trains you to ignore
 * red. So `npm test` stays deterministic and offline, and the live suite runs
 * as its own step (`npm run test:contract`) with retries, where a genuine
 * contract break is still a hard failure but a dropped connection is not.
 */
export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "tests/contract.test.ts"],
  },
});

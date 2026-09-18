import { describe, expect, it } from "vitest";
import { API_BASE, LOCALES } from "../src/api/config";
import { fetchIndex, fetchManifest, fetchQuiz, fetchQuizzes, fetchSeriesList, fetchTaxonomy } from "../src/api/client";
import type { IndexEntry } from "../src/api/schema";

// This suite hits the LIVE Content API (https://blog.xdev.asia/api/v1) on
// purpose. The API lives in a different repository and can change shape
// without this repo knowing — this suite is the tripwire for that. Network
// calls against a ~2MB index can be slow, so every test gets a longer
// timeout than vitest's 5s default.
const TIMEOUT = 30_000;
/** The live-path sweep alone downloads ~2 MB and then makes 10 HEAD requests
 * over the network; 30s is not a realistic budget for it. Measured 2026-09-18:
 * ~14s on a good run. */
const SWEEP_TIMEOUT = 90_000;

function sample<T>(items: readonly T[], count: number): T[] {
  if (items.length <= count) return [...items];
  const step = items.length / count;
  return Array.from({ length: count }, (_, i) => items[Math.floor(i * step)]);
}

// `index.json` is type-clustered (all `blog` entries, then all `lesson`
// entries) — an evenly-spaced `sample()` over the whole array can land
// entirely inside one type, leaving the other type's structurally different
// `path` shape (blog: `content/blog/...`; lesson:
// `content/series/.../chapters/.../lessons/....md`) completely untested.
// Sample within each type instead.
function sampleByType(index: readonly IndexEntry[], perType: number): IndexEntry[] {
  const blogs = index.filter((e) => e.type === "blog");
  const lessons = index.filter((e) => e.type === "lesson");
  return [...sample(blogs, perType), ...sample(lessons, perType)];
}

describe("contract: manifest", () => {
  it(
    "fetchManifest() lists exactly the four known locales",
    async () => {
      const manifest = await fetchManifest();
      expect(new Set(manifest.locales)).toEqual(new Set(LOCALES));
    },
    TIMEOUT,
  );
});

describe("contract: index", () => {
  it.each(LOCALES)(
    "fetchIndex(%s) matches IndexSchema",
    async (locale) => {
      // fetchIndex() parses with IndexSchema internally and rejects on a
      // schema mismatch, so a rejection here IS the schema-mismatch failure.
      const index = await fetchIndex(locale);
      expect(Array.isArray(index)).toBe(true);
      expect(index.length).toBeGreaterThan(0);
    },
    TIMEOUT,
  );

  // This test guards the one above: if the data ever changes so these
  // nullable branches are no longer covered, THIS test goes red instead of
  // the schema silently losing coverage. Measured 2026-09-18: `vi` and `en`
  // have ZERO null authors/categories and zero empty tag arrays — only `ja`
  // and `zh-tw` exercise those branches, so the suite must cover all four
  // locales for the assertion above to mean anything.
  it(
    "ja genuinely still has a null-author entry (and zh-tw a null-category one)",
    async () => {
      const ja = await fetchIndex("ja");
      expect(ja.filter((e) => e.author === null).length).toBeGreaterThan(0);
      expect(ja.filter((e) => e.category === null).length).toBeGreaterThan(0);
      expect(ja.filter((e) => e.tags.length === 0).length).toBeGreaterThan(0);

      const zhTw = await fetchIndex("zh-tw");
      expect(zhTw.filter((e) => e.author === null).length).toBeGreaterThan(0);
      expect(zhTw.filter((e) => e.category === null).length).toBeGreaterThan(0);
      expect(zhTw.filter((e) => e.tags.length === 0).length).toBeGreaterThan(0);
    },
    TIMEOUT,
  );

  // Measured 2026-09-18 morning (Task 2): `publishedAt` was entirely ABSENT
  // (not null) on 10 `ja` lessons and 30 `zh-tw` lessons — legacy content
  // the API never backfilled a date for. Reported as a producer bug; a fix
  // was dispatched blog-side.
  //
  // Re-measured 2026-09-18, later the same day (Task 3): the fix landed —
  // the key is now present on every entry, with an explicit `null` on the
  // affected ones, matching the API's own documented "always present,
  // explicit null when absent" invariant. This test now guards THAT shape
  // (schema.ts: `.nullish()`, so either representation still parses) rather
  // than the old bug's shape — reading the raw JSON directly still matters,
  // to see the true value before zod's `.nullish()` could mask a
  // regression back to "key absent" going unnoticed either way.
  it(
    "ja genuinely still has an entry with publishedAt explicitly null",
    async () => {
      const res = await fetch(`${API_BASE}/ja/index.json`);
      const body = (await res.json()) as Array<Record<string, unknown>>;
      expect(body.every((e) => "publishedAt" in e)).toBe(true);
      const nullValued = body.filter((e) => e.publishedAt === null);
      expect(nullValued.length).toBeGreaterThan(0);

      const parsed = await fetchIndex("ja");
      expect(parsed.some((e) => e.publishedAt === null)).toBe(true);
    },
    TIMEOUT,
  );

  it(
    "every path fetches over HTTP (both blog and lesson path shapes)",
    async () => {
      const index = await fetchIndex("vi");
      const sampled = sampleByType(index, 10);
      expect(sampled.some((e) => e.type === "blog")).toBe(true);
      expect(sampled.some((e) => e.type === "lesson")).toBe(true);
      // Three at a time, deliberately — not sequential, not all at once.
      //
      // Sequential (the original) put 10 HEADs plus the ~2 MB
      // `fetchIndex("vi")` above inside one 30s budget and went red on
      // latency alone: measured 2026-09-18, each HEAD takes 0.45-1.7s and the
      // whole file took ~60s.
      //
      // All 10 in one `Promise.all` is worse, and the failure is not obvious:
      // undici opens a connection per request, and 10 simultaneous TLS
      // handshakes to the same Cloudflare edge blew its 10s *connect* timeout
      // — `ConnectTimeoutError: attempted addresses 104.21.60.237:443,
      // 172.67.202.137:443`. That reads like the site is down when it is not;
      // every one of those paths returns 200 to curl.
      //
      // A flaky guard test is worse than no guard test — it trains you to
      // ignore the red.
      const CONCURRENCY = 3;
      const failures: { path: string; status: number }[] = [];
      for (let i = 0; i < sampled.length; i += CONCURRENCY) {
        const batch = await Promise.all(
          sampled.slice(i, i + CONCURRENCY).map(async (entry) => ({
            path: entry.path,
            status: (await fetch(`${API_BASE}/${entry.path}`, { method: "HEAD" })).status,
          })),
        );
        failures.push(...batch.filter((r) => r.status !== 200));
      }
      expect(failures).toEqual([]);
    },
    SWEEP_TIMEOUT,
  );

  // GitHub Pages only gzips when the client sends Accept-Encoding: gzip.
  // vi/index.json measured 2026-09-18: 2.07 MB raw, 283 KB gzipped (~7x).
  // These are raw `fetch` calls (not fetchIndex, which only returns parsed
  // data) because response headers/bytes are what's under test: it measures
  // the actual wire bytes for the exact request client.ts makes (plain
  // `fetch(url)`, no custom headers) rather than assuming the runtime
  // negotiates compression.
  //
  // The ratio (not an absolute byte ceiling) is asserted deliberately: `vi`
  // has 130 posts and 1,525 lessons today and the content grows continuously
  // in the blog repo. This suite runs on a daily CI cron — an absolute
  // ceiling close to today's measurement would eventually go red from
  // content growth, not from a real contract break, training people to
  // ignore the tripwire. `content-encoding: gzip` is the real signal; the
  // ratio check confirms compression is providing an actual order-of-
  // magnitude benefit rather than being silently disabled.
  it(
    "vi/index.json is actually transferred gzip-compressed",
    async () => {
      const compressed = await fetch(`${API_BASE}/vi/index.json`);
      expect(compressed.status).toBe(200);
      expect(compressed.headers.get("content-encoding")).toBe("gzip");
      const compressedBytes = Number(compressed.headers.get("content-length"));
      expect(compressedBytes).toBeGreaterThan(0);

      const raw = await fetch(`${API_BASE}/vi/index.json`, {
        headers: { "Accept-Encoding": "identity" },
      });
      const rawBytes = (await raw.arrayBuffer()).byteLength;

      expect(compressedBytes).toBeLessThan(rawBytes / 3);
    },
    TIMEOUT,
  );
});

describe("contract: series", () => {
  it.each(LOCALES)(
    "fetchSeriesList(%s) matches SeriesListSchema",
    async (locale) => {
      const list = await fetchSeriesList(locale);
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
    },
    TIMEOUT,
  );

  // Measured 2026-09-18 morning (Task 2): `level` and `lessonCount` were
  // entirely ABSENT on a handful of ja/zh-tw series — same shape of gap as
  // `publishedAt` above, and reported alongside it.
  //
  // Re-measured 2026-09-18, later the same day (Task 3): same fix, same
  // result — the keys are now always present, explicit `null` on the
  // affected series (schema.ts: `.nullish()` on both). `category`'s
  // nullability is unrelated to that bug (schema.ts always had it
  // `.nullable()`) and still holds.
  it(
    "ja genuinely still has a series with level/lessonCount explicitly null, and one with a null category",
    async () => {
      const res = await fetch(`${API_BASE}/ja/series.json`);
      const body = (await res.json()) as Array<Record<string, unknown>>;
      expect(body.every((s) => "level" in s)).toBe(true);
      expect(body.every((s) => "lessonCount" in s)).toBe(true);
      expect(body.some((s) => s.level === null)).toBe(true);
      expect(body.some((s) => s.lessonCount === null)).toBe(true);

      const parsed = await fetchSeriesList("ja");
      expect(parsed.some((s) => s.category === null)).toBe(true);
      expect(parsed.some((s) => s.level === null)).toBe(true);
    },
    TIMEOUT,
  );
});

describe("contract: taxonomy", () => {
  it.each(LOCALES)(
    "fetchTaxonomy(%s) matches TaxonomySchema",
    async (locale) => {
      const taxonomy = await fetchTaxonomy(locale);
      expect(taxonomy.categories.length).toBeGreaterThan(0);
      expect(taxonomy.tags.length).toBeGreaterThan(0);
      expect(taxonomy.authors.length).toBeGreaterThan(0);
    },
    TIMEOUT,
  );
});

// Task 12: quiz endpoints, added to the Content API alongside this task.
// Deployed to production mid-task (2026-09-18) — this repo measured them
// first against a local pre-deploy static build (see task-12-report.md) and
// re-confirmed identical shapes once `blog.xdev.asia` itself went live, so
// this tripwire runs against the real, deployed API like every other
// `describe("contract: …")` block above, not a fixture.
describe("contract: quizzes", () => {
  it(
    "fetchQuizzes() matches QuizListSchema and has no questions/domains (list-only fields)",
    async () => {
      const quizzes = await fetchQuizzes();
      expect(quizzes.length).toBeGreaterThan(0);
      for (const quiz of quizzes) {
        expect(quiz).not.toHaveProperty("questions");
        expect(quiz).not.toHaveProperty("domains");
      }
    },
    TIMEOUT,
  );

  // `passing_score` is measured NOT to be a single constant across quizzes
  // (66, 70, 75 all seen live 2026-09-18) — this guards against a future
  // regression to "every quiz passes at 70%" going unnoticed, since that
  // would still make every individual `fetchQuizzes()` call above pass.
  it(
    "passing_score genuinely varies across quizzes, not a single hardcoded value",
    async () => {
      const quizzes = await fetchQuizzes();
      const passingScores = new Set(quizzes.map((quiz) => quiz.passing_score));
      expect(passingScores.size).toBeGreaterThan(1);
    },
    TIMEOUT,
  );

  it(
    "fetchQuiz(slug) matches QuizDetailSchema for every quiz in the list, and questions_count matches the actual array length",
    async () => {
      const quizzes = await fetchQuizzes();
      for (const summary of quizzes) {
        const detail = await fetchQuiz(summary.slug);
        expect(detail.questions.length).toBe(summary.questions_count);
      }
    },
    TIMEOUT,
  );

  // aws-ml-specialty's `domains: null` was measured live pre-deploy
  // (task-12-report.md) — this guards that the deployed API still has at
  // least one quiz exercising the nullable branch, the same way the index
  // suite above guards `ja`'s null-author entry.
  it(
    "aws-ml-specialty genuinely still has domains: null, and its own questions_count is 15",
    async () => {
      const detail = await fetchQuiz("aws-ml-specialty");
      expect(detail.domains).toBeNull();
      expect(detail.questions).toHaveLength(15);
      expect(detail.questions.every((q) => q.domain === null)).toBe(true);
    },
    TIMEOUT,
  );
});

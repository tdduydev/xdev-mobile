import { describe, expect, it } from "vitest";
import { API_BASE, LOCALES } from "../src/api/config";
import { fetchIndex, fetchManifest, fetchSeriesList, fetchTaxonomy } from "../src/api/client";
import type { IndexEntry } from "../src/api/schema";

// This suite hits the LIVE Content API (https://blog.xdev.asia/api/v1) on
// purpose. The API lives in a different repository and can change shape
// without this repo knowing — this suite is the tripwire for that. Network
// calls against a ~2MB index can be slow, so every test gets a longer
// timeout than vitest's 5s default.
const TIMEOUT = 30_000;

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

  // Measured 2026-09-18: `publishedAt` is entirely ABSENT (not null) on 10
  // `ja` lessons and 30 `zh-tw` lessons — legacy content the API never
  // backfilled a date for. This is not in the brief's field-rule table; it
  // was found by fetching the live data. Guards schema.ts's `.optional()`
  // the same way the test above guards the nullable branches. Reads the raw
  // JSON directly (rather than through fetchIndex) because the whole point
  // is to see the key is ABSENT, before zod's optional-with-default masks it.
  it(
    "ja genuinely still has an entry with publishedAt entirely absent",
    async () => {
      const res = await fetch(`${API_BASE}/ja/index.json`);
      const body = (await res.json()) as Array<Record<string, unknown>>;
      const missing = body.filter((e) => !("publishedAt" in e));
      expect(missing.length).toBeGreaterThan(0);

      const parsed = await fetchIndex("ja");
      expect(parsed.some((e) => e.publishedAt === undefined)).toBe(true);
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
      for (const entry of sampled) {
        const head = await fetch(`${API_BASE}/${entry.path}`, { method: "HEAD" });
        expect(head.status).toBe(200);
      }
    },
    TIMEOUT,
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

  // Measured 2026-09-18: `level`, `lessonCount` and `category` can each be
  // absent/null on a handful of ja/zh-tw series — same shape of gap as the
  // index entries above, guarded the same way.
  it(
    "ja genuinely still has a series missing level/lessonCount and one with a null category",
    async () => {
      const res = await fetch(`${API_BASE}/ja/series.json`);
      const body = (await res.json()) as Array<Record<string, unknown>>;
      expect(body.some((s) => !("level" in s))).toBe(true);
      expect(body.some((s) => !("lessonCount" in s))).toBe(true);

      const parsed = await fetchSeriesList("ja");
      expect(parsed.some((s) => s.category === null)).toBe(true);
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

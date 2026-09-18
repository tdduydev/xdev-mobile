import { describe, expect, it } from "vitest";
import { formatPublishedDate, selectBlogEntries, sortByPublishedAtDesc } from "../src/content/feed";
import type { IndexEntry } from "../src/api/schema";

const base: IndexEntry = {
  id: "1",
  type: "blog",
  locale: "vi",
  slug: "hello",
  title: "Hello",
  excerpt: "…",
  featuredImage: null,
  readingTime: 1,
  publishedAt: "2026-01-01T00:00:00.000000Z",
  author: null,
  tags: [],
  category: null,
  series: null,
  path: "content/blog/hello.md",
  url: "https://blog.xdev.asia/blog/hello/",
};

const lesson: IndexEntry = {
  ...base,
  id: "lesson-1",
  type: "lesson",
  series: { slug: "series-1", chapter: "Chapter 1", order: 1 },
};

describe("selectBlogEntries", () => {
  it("keeps only type: blog entries — lessons live under Series, not the feed", () => {
    const result = selectBlogEntries([base, lesson]);
    expect(result).toEqual([base]);
  });
});

describe("sortByPublishedAtDesc", () => {
  it("sorts newest first", () => {
    const older = { ...base, id: "a", publishedAt: "2026-01-01T00:00:00.000000Z" };
    const newer = { ...base, id: "b", publishedAt: "2026-06-01T00:00:00.000000Z" };
    const result = sortByPublishedAtDesc([older, newer]);
    expect(result.map((e) => e.id)).toEqual(["b", "a"]);
  });

  // Live-measured (Task 2, 2026-09-18 morning): publishedAt was entirely
  // ABSENT (undefined) on some ja/zh-tw entries; re-measured later the same
  // day (Task 3), a producer-side fix now emits an explicit `null` instead
  // — schema.ts types it `string | null | undefined` (`.nullish()`) to
  // tolerate either. Both must sort the same way.
  it("sorts entries with no publishedAt (undefined) last, without crashing", () => {
    const dated = { ...base, id: "dated", publishedAt: "2026-01-01T00:00:00.000000Z" };
    const undated: IndexEntry = { ...base, id: "undated", publishedAt: undefined };
    const result = sortByPublishedAtDesc([undated, dated]);
    expect(result.map((e) => e.id)).toEqual(["dated", "undated"]);
  });

  it("sorts entries with publishedAt explicitly null last too", () => {
    const dated = { ...base, id: "dated", publishedAt: "2026-01-01T00:00:00.000000Z" };
    const nullDated: IndexEntry = { ...base, id: "null-dated", publishedAt: null };
    const result = sortByPublishedAtDesc([nullDated, dated]);
    expect(result.map((e) => e.id)).toEqual(["dated", "null-dated"]);
  });

  it("keeps undated entries in their original relative order", () => {
    const dated = { ...base, id: "dated", publishedAt: "2026-01-01T00:00:00.000000Z" };
    const undatedFirst: IndexEntry = { ...base, id: "undated-1", publishedAt: undefined };
    const undatedSecond: IndexEntry = { ...base, id: "undated-2", publishedAt: undefined };
    const result = sortByPublishedAtDesc([undatedFirst, dated, undatedSecond]);
    expect(result.map((e) => e.id)).toEqual(["dated", "undated-1", "undated-2"]);
  });

  it("does not mutate the input array", () => {
    const older = { ...base, id: "a", publishedAt: "2026-01-01T00:00:00.000000Z" };
    const newer = { ...base, id: "b", publishedAt: "2026-06-01T00:00:00.000000Z" };
    const input = [older, newer];
    sortByPublishedAtDesc(input);
    expect(input.map((e) => e.id)).toEqual(["a", "b"]);
  });
});

describe("formatPublishedDate", () => {
  it("returns null when publishedAt is absent", () => {
    expect(formatPublishedDate(undefined)).toBeNull();
  });

  it("formats a valid ISO date to a non-empty string", () => {
    const formatted = formatPublishedDate("2026-04-01T08:00:00.000000Z");
    expect(formatted).not.toBeNull();
    expect(formatted!.length).toBeGreaterThan(0);
  });
});

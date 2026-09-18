import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IndexEntry } from "../src/api/schema";

// cache.ts must never touch the real network or the real device filesystem
// in a unit test — both the Content API client and the native modules it
// wraps (AsyncStorage, expo-file-system) are mocked below.
vi.mock("../src/api/client", () => ({
  fetchIndex: vi.fn(),
  fetchMarkdown: vi.fn(),
}));

// A minimal in-memory AsyncStorage. Real semantics: getItem resolves `null`
// for a missing key rather than rejecting.
//
// [Inference/modeled] Android's AsyncStorage is SQLite-backed and, per the
// brief and widely-reported community issues (not verified against a real
// device in this environment), hits a `CursorWindow` limit around 2 MB when
// a single row is read back. This mock models that as a hard ceiling on
// `getItem` (the read side, matching the documented failure — the crash is
// reported at cursor-read time, not on insert) so a regression to "the
// whole index goes through AsyncStorage" fails deterministically under
// Node, instead of only ever failing on a real Android device. The ceiling
// (2,000,000 bytes) is a round number chosen to sit just under the commonly
// cited 2 MiB (2,097,152 bytes) so a payload sized like Task 2's real
// measurement of `vi`'s index (2,069,928 bytes) reliably trips it. This is a
// modeled constraint for this test suite, not a measured device limit.
const ASYNC_STORAGE_ROW_CEILING_BYTES = 2_000_000;

vi.mock("@react-native-async-storage/async-storage", () => {
  const store = new Map<string, string>();
  return {
    default: {
      getItem: vi.fn(async (key: string) => {
        const value = store.get(key) ?? null;
        if (value !== null) {
          const bytes = new TextEncoder().encode(value).length;
          if (bytes > ASYNC_STORAGE_ROW_CEILING_BYTES) {
            throw new Error(
              `Row too big to fit into CursorWindow (modeled): key="${key}" is ${bytes} bytes, over the ${ASYNC_STORAGE_ROW_CEILING_BYTES}-byte modeled ceiling`,
            );
          }
        }
        return value;
      }),
      setItem: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: vi.fn(async (key: string) => {
        store.delete(key);
      }),
      __reset: () => store.clear(),
    },
  };
});

// A minimal in-memory expo-file-system. This enforces the SAME failure mode
// documented in expo-file-system's own .d.ts: `create()` throws if the
// target already exists, unless the caller opts in with `overwrite` (File)
// or `idempotent` (Directory). A fake that silently allowed re-creation
// would hide the exact bug this suite exists to catch (see cache.ts's
// history: the first draft called `directory.create()` with no options,
// which threw on every markdown fetch after the first).
vi.mock("expo-file-system", () => {
  const files = new Map<string, string>();
  const directories = new Set<string>(["mock://cache"]);

  function joinUri(parts: (string | { uri: string })[]): string {
    const segments = parts.map((p) => (typeof p === "string" ? p : p.uri));
    return segments
      .join("/")
      .replace(/\/{2,}/g, "/")
      .replace(/^mock:\//, "mock://");
  }

  class MockDirectory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = joinUri(parts);
    }
    get exists() {
      return directories.has(this.uri);
    }
    create(options?: { idempotent?: boolean }) {
      if (directories.has(this.uri) && !options?.idempotent) {
        throw new Error(`Directory already exists: ${this.uri}`);
      }
      directories.add(this.uri);
    }
  }

  class MockFile {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = joinUri(parts);
    }
    get exists() {
      return files.has(this.uri);
    }
    create(options?: { overwrite?: boolean }) {
      if (files.has(this.uri) && !options?.overwrite) {
        throw new Error(`File already exists: ${this.uri}`);
      }
      if (!files.has(this.uri)) files.set(this.uri, "");
    }
    write(content: string) {
      files.set(this.uri, content);
    }
    textSync() {
      const content = files.get(this.uri);
      if (content === undefined) throw new Error(`File does not exist: ${this.uri}`);
      return content;
    }
    async text() {
      return this.textSync();
    }
  }

  const Paths = { cache: new MockDirectory("mock://cache") };

  return {
    File: MockFile,
    Directory: MockDirectory,
    Paths,
    __reset: () => {
      files.clear();
      directories.clear();
      directories.add("mock://cache");
    },
  };
});

const sampleEntry: IndexEntry = {
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

// Builds a synthetic index sized close to a target byte count, by padding
// each entry's `excerpt`. Used to reproduce Task 2's real measurement of
// `vi`'s index (2,069,928 bytes for 1,655 entries) without hardcoding 1,655
// near-identical entry literals in this file.
function buildIndexOfSize(entryCount: number, targetBytes: number): IndexEntry[] {
  const baseBytes = new TextEncoder().encode(
    JSON.stringify({ ...sampleEntry, excerpt: "" }),
  ).length;
  const paddingPerEntry = Math.max(0, Math.ceil((targetBytes - entryCount * baseBytes) / entryCount));
  return Array.from({ length: entryCount }, (_, i) => ({
    ...sampleEntry,
    id: `entry-${i}`,
    slug: `entry-${i}`,
    excerpt: "x".repeat(paddingPerEntry),
  }));
}

describe("cache: index (filesystem)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const AsyncStorage = (await import("@react-native-async-storage/async-storage"))
      .default as unknown as { __reset: () => void };
    AsyncStorage.__reset();
    const fs = (await import("expo-file-system")) as unknown as { __reset: () => void };
    fs.__reset();
  });

  it("fetches and caches on a miss, then serves the cache on a hit without refetching", async () => {
    const { fetchIndex } = await import("../src/api/client");
    const { getCachedIndex } = await import("../src/api/cache");
    vi.mocked(fetchIndex).mockResolvedValue([sampleEntry]);

    const first = await getCachedIndex("vi");
    expect(first).toEqual([sampleEntry]);
    expect(fetchIndex).toHaveBeenCalledTimes(1);

    const second = await getCachedIndex("vi");
    expect(second).toEqual([sampleEntry]);
    expect(fetchIndex).toHaveBeenCalledTimes(1); // still 1: served from cache
  });

  it("caches each locale under its own key", async () => {
    const { fetchIndex } = await import("../src/api/client");
    const { getCachedIndex } = await import("../src/api/cache");
    vi.mocked(fetchIndex).mockImplementation(async (locale) => [{ ...sampleEntry, locale }]);

    await getCachedIndex("vi");
    await getCachedIndex("ja");
    expect(fetchIndex).toHaveBeenCalledTimes(2);

    const viAgain = await getCachedIndex("vi");
    const jaAgain = await getCachedIndex("ja");
    expect(fetchIndex).toHaveBeenCalledTimes(2); // both served from cache
    expect(viAgain[0].locale).toBe("vi");
    expect(jaAgain[0].locale).toBe("ja");
  });

  // The reason for this whole change: this is precisely the payload
  // AsyncStorage's modeled CursorWindow ceiling (see the mock above) would
  // reject on read-back, and precisely what production `vi` looks like
  // (Task 2 measured 2,069,928 bytes for 1,655 entries).
  it("writes and reads back a full `vi`-sized index (~2 MB) through the filesystem cache", async () => {
    const { fetchIndex } = await import("../src/api/client");
    const { getCachedIndex } = await import("../src/api/cache");
    const largeIndex = buildIndexOfSize(1655, 2_069_928);
    const actualBytes = new TextEncoder().encode(JSON.stringify(largeIndex)).length;
    // Confirms the fixture is actually over the modeled AsyncStorage ceiling
    // — otherwise this test would pass for the wrong reason.
    expect(actualBytes).toBeGreaterThan(ASYNC_STORAGE_ROW_CEILING_BYTES);
    vi.mocked(fetchIndex).mockResolvedValue(largeIndex);

    const first = await getCachedIndex("vi"); // miss: fetch, then write to disk
    expect(first).toHaveLength(1655);
    expect(fetchIndex).toHaveBeenCalledTimes(1);

    const second = await getCachedIndex("vi"); // hit: read back from disk, not AsyncStorage
    expect(second).toHaveLength(1655);
    expect(second).toEqual(first);
    expect(fetchIndex).toHaveBeenCalledTimes(1); // still 1 — served from the cache file
  });
});

describe("cache: index refresh (forced refetch for pull-to-refresh / manifest-version check)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const fs = (await import("expo-file-system")) as unknown as { __reset: () => void };
    fs.__reset();
  });

  it("always refetches from the network, even when a cache file already exists, and overwrites it", async () => {
    const { fetchIndex } = await import("../src/api/client");
    const { getCachedIndex, refreshIndex } = await import("../src/api/cache");
    vi.mocked(fetchIndex).mockResolvedValueOnce([sampleEntry]);
    await getCachedIndex("vi");
    expect(fetchIndex).toHaveBeenCalledTimes(1);

    const updated = { ...sampleEntry, title: "Updated" };
    vi.mocked(fetchIndex).mockResolvedValueOnce([updated]);
    const refreshed = await refreshIndex("vi");
    expect(refreshed).toEqual([updated]);
    expect(fetchIndex).toHaveBeenCalledTimes(2);

    const cached = await getCachedIndex("vi");
    expect(cached).toEqual([updated]);
    expect(fetchIndex).toHaveBeenCalledTimes(2); // still 2: served from the refreshed cache file
  });

  it("leaves the existing cache file intact when a refresh's network fetch fails", async () => {
    const { fetchIndex } = await import("../src/api/client");
    const { getCachedIndex, refreshIndex } = await import("../src/api/cache");
    vi.mocked(fetchIndex).mockResolvedValueOnce([sampleEntry]);
    await getCachedIndex("vi");

    vi.mocked(fetchIndex).mockRejectedValueOnce(new Error("network down"));
    await expect(refreshIndex("vi")).rejects.toThrow("network down");

    // The stale cache from before the failed refresh is still readable — this
    // is what lets the UI keep showing content with a "stale" indicator
    // instead of losing it (spec section 8: "Index tải lỗi, có cache → dùng
    // cache, hiện banner 'dữ liệu cũ'").
    const stillCached = await getCachedIndex("vi");
    expect(stillCached).toEqual([sampleEntry]);
  });
});

describe("cache: manifest version marker (AsyncStorage, small value)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const AsyncStorage = (await import("@react-native-async-storage/async-storage"))
      .default as unknown as { __reset: () => void };
    AsyncStorage.__reset();
  });

  it("returns null when no version has ever been stored", async () => {
    const { getCachedManifestVersion } = await import("../src/api/cache");
    expect(await getCachedManifestVersion()).toBeNull();
  });

  it("returns the stored version after it is set", async () => {
    const { getCachedManifestVersion, setCachedManifestVersion } = await import("../src/api/cache");
    await setCachedManifestVersion("abc123");
    expect(await getCachedManifestVersion()).toBe("abc123");
  });
});

describe("cache: markdown (file system)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const fs = (await import("expo-file-system")) as unknown as { __reset: () => void };
    fs.__reset();
  });

  it("fetches and caches on a miss, then serves the cache on a hit without refetching", async () => {
    const { fetchMarkdown } = await import("../src/api/client");
    const { getCachedMarkdown } = await import("../src/api/cache");
    vi.mocked(fetchMarkdown).mockResolvedValue("# Hello");

    const first = await getCachedMarkdown("content/blog/hello.md");
    expect(first).toBe("# Hello");
    expect(fetchMarkdown).toHaveBeenCalledTimes(1);

    const second = await getCachedMarkdown("content/blog/hello.md");
    expect(second).toBe("# Hello");
    expect(fetchMarkdown).toHaveBeenCalledTimes(1);
  });

  // This is the trap: a first draft that calls `directory.create()` with no
  // options throws "already exists" on every markdown fetch after the
  // first, because the shared cache directory was already created by the
  // previous call. Two DIFFERENT paths must both succeed.
  it("caches a second, different path without throwing", async () => {
    const { fetchMarkdown } = await import("../src/api/client");
    const { getCachedMarkdown } = await import("../src/api/cache");
    vi.mocked(fetchMarkdown).mockImplementation(async (path) => `content of ${path}`);

    await expect(getCachedMarkdown("content/blog/one.md")).resolves.toBe(
      "content of content/blog/one.md",
    );
    await expect(getCachedMarkdown("content/blog/two.md")).resolves.toBe(
      "content of content/blog/two.md",
    );
    expect(fetchMarkdown).toHaveBeenCalledTimes(2);
  });

  it("hashes deeply nested path segments into a flat cache filename", async () => {
    const { fetchMarkdown } = await import("../src/api/client");
    const { getCachedMarkdown } = await import("../src/api/cache");
    vi.mocked(fetchMarkdown).mockResolvedValue("body");

    // Nested path segments must not require intermediate directories on disk.
    await expect(
      getCachedMarkdown("content/series/lap-trinh/foo/chapters/01/lessons/bai-1.md"),
    ).resolves.toBe("body");
    expect(fetchMarkdown).toHaveBeenCalledTimes(1);
  });

  // The collision the brief flagged as a known, unfixed risk in Task 2:
  // `replace(/[^a-zA-Z0-9._-]/g, "_")` maps both of these onto the literal
  // same sanitized filename ("content_blog_a_b.md"), since `/`, `?` and `!`
  // all become `_`. Measured against all 5,988 real paths (2026-09-18): zero
  // collisions found in practice, but that was luck in the input, not a
  // guarantee from the function — hashing (this task, since cache.ts was
  // already being modified) removes the risk instead of just documenting it.
  it("caches two different paths that would have collided under the old sanitize-based filename scheme", async () => {
    const { fetchMarkdown } = await import("../src/api/client");
    const { getCachedMarkdown } = await import("../src/api/cache");
    const pathA = "content/blog/a?b.md";
    const pathB = "content/blog/a!b.md";
    vi.mocked(fetchMarkdown).mockImplementation(async (path) => `content of ${path}`);

    await expect(getCachedMarkdown(pathA)).resolves.toBe(`content of ${pathA}`);
    await expect(getCachedMarkdown(pathB)).resolves.toBe(`content of ${pathB}`);
    expect(fetchMarkdown).toHaveBeenCalledTimes(2);

    // Both must still resolve to their OWN content on a cache hit, not each other's.
    await expect(getCachedMarkdown(pathA)).resolves.toBe(`content of ${pathA}`);
    await expect(getCachedMarkdown(pathB)).resolves.toBe(`content of ${pathB}`);
    expect(fetchMarkdown).toHaveBeenCalledTimes(2); // both served from cache, still 2
  });
});

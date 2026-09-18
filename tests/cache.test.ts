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
vi.mock("@react-native-async-storage/async-storage", () => {
  const store = new Map<string, string>();
  return {
    default: {
      getItem: vi.fn(async (key: string) => store.get(key) ?? null),
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

describe("cache: index (AsyncStorage)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const AsyncStorage = (await import("@react-native-async-storage/async-storage"))
      .default as unknown as { __reset: () => void };
    (AsyncStorage as unknown as { __reset: () => void }).__reset();
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

  it("sanitizes path separators into a flat cache filename", async () => {
    const { fetchMarkdown } = await import("../src/api/client");
    const { getCachedMarkdown } = await import("../src/api/cache");
    vi.mocked(fetchMarkdown).mockResolvedValue("body");

    // Nested path segments must not require intermediate directories on disk.
    await expect(
      getCachedMarkdown("content/series/lap-trinh/foo/chapters/01/lessons/bai-1.md"),
    ).resolves.toBe("body");
    expect(fetchMarkdown).toHaveBeenCalledTimes(1);
  });
});

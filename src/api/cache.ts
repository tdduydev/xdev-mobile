import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";
import type { Locale } from "./config";
import { fetchIndex, fetchMarkdown } from "./client";
import { IndexSchema, type IndexEntry } from "./schema";

const MANIFEST_VERSION_KEY = "xdev:manifestVersion";

/**
 * Defers `new Directory(...)`/`new File(...)` until the value is actually
 * needed, rather than at module load. [Verified in this environment,
 * 2026-09-18]: `expo-file-system`'s web implementation is a stub whose
 * `Directory`/`File` constructors are missing methods the real
 * `Directory`/`File` classes call internally, so constructing one at
 * MODULE SCOPE (as a top-level `const`) throws the instant this module is
 * imported — on web, that took down the entire app at boot, before any
 * screen could render, since this module is imported (transitively) from
 * the root layout. Lazy construction defers that failure to the point
 * `getCachedIndex`/`getCachedMarkdown` are actually called, where it
 * becomes an ordinary rejected promise the existing offline/error-state
 * handling (src/state/content.tsx, src/app/post/[slug].tsx) already
 * expects and displays — not a fix for expo-file-system's lack of web
 * support (this app's real target is iOS/Android via Expo Go, per the
 * spec), just the difference between "web fails gracefully" and "web
 * doesn't boot".
 */
function lazy<T>(create: () => T): () => T {
  let instance: T | undefined;
  return () => {
    if (instance === undefined) instance = create();
    return instance;
  };
}

const getIndexDirectory = lazy(() => new Directory(Paths.cache, "index"));

function indexCacheFile(locale: Locale): File {
  return new File(getIndexDirectory(), `${locale}.json`);
}

function writeIndexCacheFile(locale: Locale, entries: IndexEntry[]): void {
  // Same idempotent/overwrite guard as getCachedMarkdown below: the shared
  // `index` directory already exists after the first locale is cached.
  getIndexDirectory().create({ idempotent: true, intermediates: true });
  const file = indexCacheFile(locale);
  file.create({ overwrite: true });
  file.write(JSON.stringify(entries));
}

/**
 * Read-through cache for a locale's index, backed by the filesystem
 * (`Paths.cache`) rather than AsyncStorage.
 *
 * Why not AsyncStorage: AsyncStorage on Android is SQLite-backed and, per
 * community-reported issues, hits a `CursorWindow` limit around 2 MB when a
 * single row is read back — [Inference/Unverified against a real device in
 * this environment]. Measured directly in Task 2 (2026-09-18): `vi`'s index
 * is 2,069,928 bytes as one JSON string, already at that edge, and it only
 * grows as content is added. That failure is a crash on a real Android
 * device, not a slowdown, and it cannot be observed from a Node-based test
 * — see tests/cache.test.ts's modeled-ceiling test, which reproduces the
 * failure mode deterministically instead (and goes RED against the old
 * AsyncStorage-backed implementation this replaces).
 *
 * Reads with the async `text()`, not the `textSync()` that
 * `getCachedMarkdown` below uses: the index file can be ~2 MB, and a
 * synchronous read of that size would block the JS thread on every cache
 * hit, unlike `getCachedMarkdown`'s ~14 KB average body.
 *
 * A schema mismatch on the network fetch (`fetchIndex` internally calls
 * `IndexSchema.parse`) rejects before anything is written here, so a bad
 * response never overwrites a previously-good cache file (spec section 8:
 * "JSON sai schema → Từ chối, giữ cache cũ").
 */
export async function getCachedIndex(locale: Locale): Promise<IndexEntry[]> {
  const file = indexCacheFile(locale);
  if (file.exists) {
    return IndexSchema.parse(JSON.parse(await file.text()));
  }
  const entries = await fetchIndex(locale);
  writeIndexCacheFile(locale, entries);
  return entries;
}

/**
 * Unconditionally refetches a locale's index from the network and overwrites
 * its cache file — used for pull-to-refresh and the background refresh
 * triggered by a `manifest.version` change (spec section 8), neither of
 * which should be satisfied by a stale on-disk cache the way
 * `getCachedIndex`'s cache-first read is.
 *
 * On failure, the promise rejects and any existing cache file is left
 * untouched, so a caller can keep serving the old data with a "stale"
 * indicator instead of losing it (spec section 8: "Index tải lỗi, có cache →
 * dùng cache, hiện banner 'dữ liệu cũ'").
 */
export async function refreshIndex(locale: Locale): Promise<IndexEntry[]> {
  const entries = await fetchIndex(locale);
  writeIndexCacheFile(locale, entries);
  return entries;
}

/**
 * The last `manifest.version` seen, used to decide whether the index needs a
 * background refresh (spec section 8). A small string — AsyncStorage is the
 * right tool for this, unlike the index array above.
 */
export async function getCachedManifestVersion(): Promise<string | null> {
  return AsyncStorage.getItem(MANIFEST_VERSION_KEY);
}

export async function setCachedManifestVersion(version: string): Promise<void> {
  await AsyncStorage.setItem(MANIFEST_VERSION_KEY, version);
}

const getMarkdownDirectory = lazy(() => new Directory(Paths.cache, "markdown"));

/**
 * Two independent 32-bit FNV-1a passes over `path`, concatenated into one
 * 64-bit-equivalent hex string. Not cryptographic — just enough spread that
 * two different real content paths landing on the same hash is
 * astronomically unlikely for a few thousand entries, which a 32-bit hash
 * alone would not comfortably guarantee.
 */
function hashPath(path: string): string {
  function fnv1a(seed: number): number {
    let hash = seed;
    for (let i = 0; i < path.length; i++) {
      hash ^= path.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }
  return fnv1a(0x811c9dc5).toString(16).padStart(8, "0") + fnv1a(0x9e3779b9).toString(16).padStart(8, "0");
}

/**
 * Turns an arbitrary content `path` into a safe, flat cache filename by
 * hashing it, rather than the earlier `replace(/[^a-zA-Z0-9._-]/g, "_")`
 * sanitization. That approach could flatten two DIFFERENT paths onto the
 * SAME filename whenever their non-alphanumeric characters lined up after
 * substitution (e.g. `a?b.md` and `a!b.md` both became `a_b.md`) — measured
 * against all 5,988 real paths across all four locales as of 2026-09-18:
 * zero collisions found, but that was the input data being well-behaved,
 * not a property of the function. Switched to hashing per the brief's own
 * guidance ("nếu đụng vào cache.ts thì đổi sang băm path cho chắc"), since
 * this task already modifies cache.ts for the index-storage change below.
 */
function markdownCacheFile(path: string): File {
  return new File(getMarkdownDirectory(), `${hashPath(path)}.md`);
}

/**
 * Read-through cache for a lesson/post's markdown body, backed by the
 * filesystem cache directory (`Paths.cache` — the system may reclaim it
 * under storage pressure, which is fine: it is a cache, not a source of
 * truth).
 */
export async function getCachedMarkdown(path: string): Promise<string> {
  const file = markdownCacheFile(path);
  if (file.exists) {
    return file.textSync();
  }
  const content = await fetchMarkdown(path);
  // `create()` throws if the target already exists (expo-file-system v57
  // .d.ts). The cache directory is shared across every call, so it already
  // exists after the first markdown write — `idempotent: true` is required
  // or the SECOND call of the app's lifetime throws. `overwrite: true` on
  // the file is the same guard for the (rare) case a stale, empty file was
  // left behind by a previous failed write.
  getMarkdownDirectory().create({ idempotent: true, intermediates: true });
  file.create({ overwrite: true });
  file.write(content);
  return content;
}

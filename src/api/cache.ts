import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";
import type { Locale } from "./config";
import { fetchIndex, fetchMarkdown, fetchQuiz, fetchQuizzes } from "./client";
import {
  IndexSchema,
  QuizAttemptStateSchema,
  QuizDetailSchema,
  QuizListSchema,
  type IndexEntry,
  type QuizAttemptState,
  type QuizDetail,
  type QuizSummary,
} from "./schema";
import { QUIZ_ATTEMPT_KEY_PREFIX } from "./storage-keys";

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

// Quizzes are NOT partitioned by locale (client.ts's fetchQuizzes/fetchQuiz
// doc comment — measured live: `quizzes.json` lives directly under the API
// root, not under `{locale}/`), so this cache is one shared directory, not
// one file per locale the way `indexCacheFile` above is.
const getQuizzesDirectory = lazy(() => new Directory(Paths.cache, "quizzes"));

function quizListCacheFile(): File {
  return new File(getQuizzesDirectory(), "list.json");
}

function quizDetailCacheFile(slug: string): File {
  // Real quiz slugs are short, hyphenated identifiers ("aws-ml-specialty")
  // with no path-hostile characters — unlike `markdownCacheFile`'s
  // arbitrary content `path`, hashing here would only make the cache
  // directory harder to inspect for no safety benefit.
  return new File(getQuizzesDirectory(), `${slug}.json`);
}

/**
 * Read-through cache for the quiz list, same cache-first shape as
 * `getCachedIndex` above: a schema mismatch on the network fetch
 * (`fetchQuizzes` internally calls `QuizListSchema.parse`) rejects before
 * anything is written here, so a bad response never overwrites a
 * previously-good cache file.
 */
export async function getCachedQuizzes(): Promise<QuizSummary[]> {
  const file = quizListCacheFile();
  if (file.exists) {
    return QuizListSchema.parse(JSON.parse(await file.text()));
  }
  const quizzes = await fetchQuizzes();
  getQuizzesDirectory().create({ idempotent: true, intermediates: true });
  file.create({ overwrite: true });
  file.write(JSON.stringify(quizzes));
  return quizzes;
}

/**
 * Read-through cache for one quiz's full detail (questions + explanations),
 * so a quiz already downloaded once can be retaken offline. Same
 * cache-first shape as `getCachedQuizzes` above.
 */
export async function getCachedQuiz(slug: string): Promise<QuizDetail> {
  const file = quizDetailCacheFile(slug);
  if (file.exists) {
    return QuizDetailSchema.parse(JSON.parse(await file.text()));
  }
  const quiz = await fetchQuiz(slug);
  getQuizzesDirectory().create({ idempotent: true, intermediates: true });
  file.create({ overwrite: true });
  file.write(JSON.stringify(quiz));
  return quiz;
}

function quizAttemptStorageKey(slug: string): string {
  return `${QUIZ_ATTEMPT_KEY_PREFIX}${slug}`;
}

/**
 * The saved in-progress attempt for `slug`, or `null` if there isn't one —
 * spec requirement "thoát giữa chừng rồi quay lại không được mất bài đang
 * làm" (exit mid-quiz and come back without losing progress). Small,
 * infrequently-written JSON — AsyncStorage is the right tool here, same as
 * `getCachedManifestVersion` above, unlike the index/quiz list/markdown
 * caches, which can be large enough to need the filesystem (see
 * `getCachedIndex`'s doc comment on AsyncStorage's CursorWindow limit).
 *
 * A stored blob that fails to parse or fails `QuizAttemptStateSchema`
 * (corrupted, or an old shape from a previous app version) resolves to
 * `null` rather than rejecting: losing a resumable attempt to "start over"
 * is an acceptable degradation, crashing the quiz screen on launch is not.
 */
export async function getSavedQuizAttempt(slug: string): Promise<QuizAttemptState | null> {
  const raw = await AsyncStorage.getItem(quizAttemptStorageKey(slug));
  if (raw === null) return null;
  try {
    return QuizAttemptStateSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Overwrites the saved attempt for `attempt.slug` — called on every answer
 * change and question move (not just on unmount/cleanup), since exiting the
 * app via the OS (not just navigating within it) never runs a cleanup
 * function.
 */
export async function saveQuizAttempt(attempt: QuizAttemptState): Promise<void> {
  await AsyncStorage.setItem(quizAttemptStorageKey(attempt.slug), JSON.stringify(attempt));
}

/** Called once an attempt is finished (submitted, or time ran out) — nothing left to resume. */
export async function clearSavedQuizAttempt(slug: string): Promise<void> {
  await AsyncStorage.removeItem(quizAttemptStorageKey(slug));
}

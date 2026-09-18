import AsyncStorage from "@react-native-async-storage/async-storage";
import { QUIZ_ATTEMPT_KEY_PREFIX } from "./storage-keys";
import {
  BookmarksListSchema,
  ReadingProgressMapSchema,
  type Bookmark,
  type ReadingProgressEntry,
  type ReadingProgressMap,
} from "./schema";

/**
 * Local, on-device personal data — bookmarks and per-series reading
 * progress (Task 13). Small JSON blobs, so AsyncStorage is the right tool
 * here, same reasoning as `getCachedManifestVersion`/quiz-attempt storage
 * in cache.ts, unlike the index/markdown/quiz caches (see cache.ts's doc
 * comment on AsyncStorage's CursorWindow limit) — this is NOT Content API
 * data, so it stays out of cache.ts's filesystem-backed caches, and
 * `clearPersonalData` below must never touch those: they're public content,
 * re-downloadable, not personal.
 */

const BOOKMARKS_KEY = "xdev:bookmarks";
const READING_PROGRESS_KEY = "xdev:readingProgress";

/**
 * The full bookmark list, or `[]` if there is none yet or the stored blob
 * fails to parse / fails `BookmarksListSchema` (corrupted, or an old shape
 * from a previous app version) — same fail-closed-to-empty behavior as
 * `getSavedQuizAttempt` in cache.ts, rather than crashing whatever screen
 * reads this.
 */
export async function getBookmarks(): Promise<Bookmark[]> {
  const raw = await AsyncStorage.getItem(BOOKMARKS_KEY);
  if (raw === null) return [];
  try {
    return BookmarksListSchema.parse(JSON.parse(raw));
  } catch {
    return [];
  }
}

export async function saveBookmarks(bookmarks: Bookmark[]): Promise<void> {
  await AsyncStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
}

/** True if `slug` is in `bookmarks` — a plain lookup, kept as a named helper so call sites read as intent, not `.some(...)`. */
export function isBookmarked(bookmarks: readonly Bookmark[], slug: string): boolean {
  return bookmarks.some((bookmark) => bookmark.slug === slug);
}

/**
 * Pure toggle: adds `slug` (stamped with `now`) if it isn't bookmarked yet,
 * removes it otherwise. Returns the new list AND whether the result is
 * "now bookmarked", so a caller can both persist the list and sync the
 * single change to Firestore without re-deriving `isBookmarked` on the
 * list it just replaced.
 */
export function toggleBookmark(
  bookmarks: readonly Bookmark[],
  slug: string,
  now: number,
): { bookmarks: Bookmark[]; added: boolean } {
  if (isBookmarked(bookmarks, slug)) {
    return { bookmarks: bookmarks.filter((bookmark) => bookmark.slug !== slug), added: false };
  }
  return { bookmarks: [...bookmarks, { slug, savedAt: now }], added: true };
}

/**
 * Union of `local` and `remote` by `slug`, keeping whichever side has the
 * later `savedAt` on a collision (last-write-wins) — run once, right after
 * sign-in, so a bookmark made on another device (or before this device was
 * ever logged in) shows up locally, and a bookmark made locally before
 * login isn't lost by overwriting it with the server's copy.
 */
export function mergeBookmarks(local: readonly Bookmark[], remote: readonly Bookmark[]): Bookmark[] {
  const bySlug = new Map<string, Bookmark>();
  for (const bookmark of [...local, ...remote]) {
    const existing = bySlug.get(bookmark.slug);
    if (!existing || bookmark.savedAt > existing.savedAt) {
      bySlug.set(bookmark.slug, bookmark);
    }
  }
  return [...bySlug.values()].sort((a, b) => b.savedAt - a.savedAt);
}

/** Same fail-closed-to-empty behavior as `getBookmarks` above. */
export async function getReadingProgress(): Promise<ReadingProgressMap> {
  const raw = await AsyncStorage.getItem(READING_PROGRESS_KEY);
  if (raw === null) return {};
  try {
    return ReadingProgressMapSchema.parse(JSON.parse(raw));
  } catch {
    return {};
  }
}

export async function saveReadingProgress(progress: ReadingProgressMap): Promise<void> {
  await AsyncStorage.setItem(READING_PROGRESS_KEY, JSON.stringify(progress));
}

/**
 * Pure update: records `lessonId`/`lessonSlug` as the last-read lesson for
 * `seriesSlug`, overwriting whatever was there before — reading progress is
 * "where you last were", not a history, so there is exactly one entry per
 * series by design (matches `users/{uid}/progress/{seriesSlug}` — one doc
 * per series, not one per lesson visited).
 */
export function withLessonRead(
  progress: ReadingProgressMap,
  seriesSlug: string,
  lessonId: string,
  lessonSlug: string,
  now: number,
): ReadingProgressMap {
  const entry: ReadingProgressEntry = { lessonId, lessonSlug, updatedAt: now };
  return { ...progress, [seriesSlug]: entry };
}

/** Same last-write-wins merge as `mergeBookmarks`, keyed by series slug instead of post slug. */
export function mergeReadingProgress(local: ReadingProgressMap, remote: ReadingProgressMap): ReadingProgressMap {
  const merged: ReadingProgressMap = { ...local };
  for (const [seriesSlug, remoteEntry] of Object.entries(remote)) {
    const localEntry = merged[seriesSlug];
    if (!localEntry || remoteEntry.updatedAt > localEntry.updatedAt) {
      merged[seriesSlug] = remoteEntry;
    }
  }
  return merged;
}

/**
 * Wipes every LOCAL trace of personal data on sign-out — task-13 brief:
 * "Đăng xuất phải xoá cache cục bộ của dữ liệu cá nhân... Máy dùng chung mà
 * đăng xuất xong vẫn thấy bookmark người trước là lỗi riêng tư." Covers
 * bookmarks, reading progress, and every in-progress quiz attempt
 * (`xdev:quizAttempt:<slug>`, one key per slug, hence the prefix scan via
 * `getAllKeys()` rather than a fixed key list).
 *
 * Deliberately does NOT touch `xdev:locale`, `xdev:theme`,
 * `xdev:manifestVersion`, or any of cache.ts's filesystem-backed content
 * caches (index/markdown/quizzes): those are either a device preference
 * (not personal identity-linked data) or public, re-downloadable Content
 * API data — wiping them on every sign-out would force a multi-MB
 * redownload for no privacy benefit, which is not what this requirement is
 * about.
 */
export async function clearPersonalData(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const toRemove = keys.filter((key) => key === BOOKMARKS_KEY || key === READING_PROGRESS_KEY || key.startsWith(QUIZ_ATTEMPT_KEY_PREFIX));
  if (toRemove.length > 0) {
    await AsyncStorage.multiRemove(toRemove);
  }
}

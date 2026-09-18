import AsyncStorage from "@react-native-async-storage/async-storage";
import { QUIZ_ATTEMPT_KEY_PREFIX } from "./storage-keys";
import {
  AiQuestionUsageSchema,
  BookmarksListSchema,
  ReadingProgressMapSchema,
  type AiQuestionUsage,
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
 *
 * Also hosts the Task 16 AI-question daily counter. It lives here for the
 * same "small local JSON blob" reason, NOT because it's personal/identity
 * data — it deliberately is not, see its own doc comment below and on
 * `AiQuestionUsageSchema` in schema.ts.
 */

const BOOKMARKS_KEY = "xdev:bookmarks";
const READING_PROGRESS_KEY = "xdev:readingProgress";
const AI_QUESTION_USAGE_KEY = "xdev:aiQuestionUsage";

/**
 * The whole `xdev-asia` Firebase project shares ONE Gemini quota — measured
 * 2026-09-18 from a live 429 body's `QuotaFailure`:
 * `generativelanguage.googleapis.com/generate_content_free_tier_requests` /
 * `GenerateRequestsPerDayPerProjectPerModel-FreeTier`, value 20. That's 20
 * requests per DAY for every user of the web widget AND this app combined.
 *
 * This constant does not, and cannot, protect that number: anyone holding
 * the Firebase config can call the API directly and skip this app (and
 * this file) entirely — real protection is App Check (task-14b) plus
 * billing, both out of scope here. What a per-device cap DOES buy: one
 * person can no longer burn through the whole day's shared budget alone in
 * a couple of minutes, and gets a kind warning instead of a raw 429.
 *
 * 5 is a quarter of the project-wide 20/day: generous for one article's
 * worth of follow-up questions, but low enough that it takes 4+ devices
 * asking on the same day to exhaust the pool, not a single one.
 */
export const DAILY_AI_QUESTION_LIMIT = 5;

/**
 * Below this many remaining questions, the chat UI switches its "còn N
 * lượt" hint from neutral to warning-styled — early enough that running
 * out isn't a surprise (brief: "đừng đợi hết mới báo"), but not from the
 * very first question, which would make every session look alarming.
 */
export const LOW_AI_QUESTION_WARNING_THRESHOLD = 2;

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
 * `YYYY-MM-DD` built from LOCAL calendar fields (`getFullYear`/`getMonth`/
 * `getDate`) — NOT `date.toISOString().slice(0, 10)` (UTC) and NOT
 * `toLocaleDateString` (Hermes on Android isn't guaranteed full-ICU).
 * Brief: "Reset theo ngày địa phương của người dùng, không phải UTC — người
 * ở VN đổi ngày lúc nửa đêm giờ VN" — the day boundary has to track the
 * device's own timezone, not Greenwich's. Zero-padded so two keys compare
 * correctly with plain `<`/`>` (used by `resolveAiQuestionUsage` below).
 */
export function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Folds a stored usage bucket forward to `todayKey`, or doesn't — the brief's
 * anti-abuse rule: "Đổi giờ hệ thống lùi về không được cấp thêm lượt (lưu
 * ngày, so sánh, không cộng dồn)." Only a day STRICTLY AFTER the stored one
 * (`todayKey > stored.day`) is a genuine day change and earns a fresh
 * bucket. `todayKey === stored.day` is the ordinary same-day case.
 * `todayKey < stored.day` means the system clock moved backward: the
 * higher, already-recorded day is kept exactly as-is — not overwritten
 * with the earlier date, and not reset — so winding the clock forward
 * again later doesn't find a stale earlier `day` sitting there ready to
 * grant a second reset for a day that's already been spent.
 */
export function resolveAiQuestionUsage(stored: AiQuestionUsage | null, todayKey: string): AiQuestionUsage {
  if (!stored || todayKey > stored.day) {
    return { day: todayKey, count: 0 };
  }
  return stored;
}

async function getAiQuestionUsage(): Promise<AiQuestionUsage | null> {
  const raw = await AsyncStorage.getItem(AI_QUESTION_USAGE_KEY);
  if (raw === null) return null;
  try {
    return AiQuestionUsageSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function saveAiQuestionUsage(usage: AiQuestionUsage): Promise<void> {
  await AsyncStorage.setItem(AI_QUESTION_USAGE_KEY, JSON.stringify(usage));
}

/**
 * How many AI questions this device can still ask today, WITHOUT recording
 * an attempt — used to show the "còn N lượt" hint, and to disable Send
 * before the user has typed (or sent) anything this session.
 */
export async function getAiQuestionsRemaining(now: Date = new Date()): Promise<number> {
  const usage = resolveAiQuestionUsage(await getAiQuestionUsage(), localDayKey(now));
  return Math.max(0, DAILY_AI_QUESTION_LIMIT - usage.count);
}

/**
 * Records one AI question ATTEMPT against today's bucket and reports
 * whether it was allowed. Counts the attempt, not a successful answer:
 * `ArticleChatModal` calls this right before calling `generateContent()`,
 * because the whole point (brief: "Ngăn một người dùng vô tình đốt sạch 20
 * lượt của cả ngày trong vài phút") is capping how often THIS DEVICE fires
 * requests — independent of whether Gemini itself then succeeds, times
 * out, or comes back with a quota error of its own.
 */
export async function recordAiQuestion(now: Date = new Date()): Promise<{ allowed: boolean; remaining: number }> {
  const usage = resolveAiQuestionUsage(await getAiQuestionUsage(), localDayKey(now));
  if (usage.count >= DAILY_AI_QUESTION_LIMIT) {
    // Already exhausted — leave the stored bucket untouched instead of
    // incrementing past the limit indefinitely.
    return { allowed: false, remaining: 0 };
  }
  const updated: AiQuestionUsage = { day: usage.day, count: usage.count + 1 };
  await saveAiQuestionUsage(updated);
  return { allowed: true, remaining: DAILY_AI_QUESTION_LIMIT - updated.count };
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
 * `xdev:manifestVersion`, `xdev:aiQuestionUsage` (Task 16's daily AI-question
 * counter — a device rate limit, not identity data; wiping it on sign-out
 * would turn "sign out, sign back in" into a free quota reset, the same
 * hole as winding the system clock back), or any of cache.ts's
 * filesystem-backed content
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

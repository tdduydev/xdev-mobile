import type { IndexEntry } from "../api/schema";

/**
 * Formats `publishedAt` for display, or `null` when it is absent (schema.ts:
 * `.nullish()` — a missing key and an explicit `null` are both "no publish
 * date"; see `sortByPublishedAtDesc` above for the same distinction). Uses
 * the device's own locale/formatting conventions (`Intl.DateTimeFormat`'s
 * `undefined` locale) rather than mapping the app's content locale to a
 * BCP-47 tag, since [Unverified against a real device in this environment]
 * Hermes's `Intl` locale data coverage for less common tags is not something
 * this environment can confirm.
 */
export function formatPublishedDate(publishedAt: string | null | undefined): string | null {
  if (!publishedAt) return null;
  const parsed = new Date(publishedAt);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(parsed);
}

/** The feed only ever shows blog posts — lessons live under the Series tab. */
export function selectBlogEntries(entries: readonly IndexEntry[]): IndexEntry[] {
  return entries.filter((entry): entry is Extract<IndexEntry, { type: "blog" }> => entry.type === "blog");
}

/**
 * Sorts entries by `publishedAt` descending (newest first).
 *
 * `publishedAt` is `string | null | undefined` (schema.ts: `.nullish()` — a
 * handful of legacy `ja`/`zh-tw` entries have no publish date; live-measured
 * as the key being entirely ABSENT on 2026-09-18 morning, then as an
 * explicit `null` later the same day after a producer-side fix — this
 * function treats both the same way, since either means "no date"). Entries
 * with no `publishedAt` sort LAST, in their original relative order: there
 * is no date to rank them by, so pushing them to the bottom is the least
 * surprising default for a reverse-chronological feed — better than
 * crashing, and better than silently treating "no date" as "newest" (which
 * would put undated legacy content at the top) or "oldest" (an assumption
 * this codebase has no evidence for).
 */
export function sortByPublishedAtDesc(entries: readonly IndexEntry[]): IndexEntry[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const aTime = a.entry.publishedAt ? Date.parse(a.entry.publishedAt) : null;
      const bTime = b.entry.publishedAt ? Date.parse(b.entry.publishedAt) : null;
      if (aTime === null && bTime === null) return a.index - b.index;
      if (aTime === null) return 1;
      if (bTime === null) return -1;
      if (aTime !== bTime) return bTime - aTime;
      return a.index - b.index;
    })
    .map(({ entry }) => entry);
}

import type { IndexEntry, Series } from "../api/schema";

/**
 * The previous/next lesson shown on a navigation button — just enough to
 * route to it (`slug`) and label the button (`title`). `id` is carried
 * along too so a caller building the destination route can disambiguate
 * the same way this module does internally (see `getLessonNeighbors`'s
 * doc comment).
 */
export type LessonNeighbor = {
  id: string;
  slug: string;
  title: string;
};

export type LessonNeighbors = {
  previous: LessonNeighbor | null;
  next: LessonNeighbor | null;
};

const NO_NEIGHBORS: LessonNeighbors = { previous: null, next: null };

/**
 * Flattens a series' chapters into a single ordered list of lessons —
 * chapters sorted by their own `order` field ascending, and within each
 * chapter its lessons sorted by their `order` field ascending (task-10
 * brief: "Đừng giả định mảng trong JSON đã sắp sẵn — hãy sort"). Sorts a
 * shallow copy (`[...array]`), never the original `series.chapters`/
 * `chapter.lessons` arrays — those are shared, cached data owned by
 * ContentProvider (src/state/content.tsx), not this module's to mutate.
 *
 * `Array.prototype.sort` has been spec-guaranteed stable since ES2019 (both
 * V8 and Hermes conform), so two chapters/lessons that happen to share the
 * same `order` keep their original relative position rather than being
 * reshuffled unpredictably — no manual index tie-break needed on top of it.
 */
function flattenLessons(series: Series): LessonNeighbor[] {
  const chapters = [...series.chapters].sort((a, b) => a.order - b.order);
  const lessons: LessonNeighbor[] = [];
  for (const chapter of chapters) {
    const chapterLessons = [...chapter.lessons].sort((a, b) => a.order - b.order);
    for (const lesson of chapterLessons) {
      lessons.push({ id: lesson.id, slug: lesson.slug, title: lesson.title });
    }
  }
  return lessons;
}

/**
 * The previous/next lesson for `entry`, walked across the WHOLE series
 * (not just within its chapter) — task-10 brief: chapter boundaries are
 * crossed, e.g. the last lesson of chapter 1's "next" is chapter 2's first
 * lesson.
 *
 * Matched by `id`, never by `slug`: the blog repo has shipped real series
 * with two different lessons sharing the same slug (`terminology-service`,
 * per the task-10 brief, referencing the Task 2 bug where a slug-keyed map
 * silently overwrote one of them). `entry.slug` identifies which URL the
 * reader is currently on, but not WHICH of two same-slug lessons that is —
 * `entry.id` does. Using `slug` here would silently resolve every
 * same-slug lesson to whichever one happens to appear first in the
 * flattened list, handing back the wrong neighbors for every other one.
 *
 * Returns "no neighbors" (`{ previous: null, next: null }`), never throws,
 * for every shape of "there's nothing to navigate to": `entry.type ===
 * "blog"` (blog posts aren't part of a series), `entry.series.slug` not
 * present in `seriesList` (series.json hasn't loaded yet, or briefly
 * disagrees with index.json during a background refresh), or `entry.id`
 * not found in the matched series' own lesson tree (same kind of
 * cross-source disagreement). All three degrade the same way as any other
 * missing-data case in this app: hide the affected UI, don't crash it.
 */
export function getLessonNeighbors(seriesList: readonly Series[], entry: IndexEntry): LessonNeighbors {
  if (entry.type !== "lesson") return NO_NEIGHBORS;

  const series = seriesList.find((candidate) => candidate.slug === entry.series.slug);
  if (!series) return NO_NEIGHBORS;

  const lessons = flattenLessons(series);
  const index = lessons.findIndex((lesson) => lesson.id === entry.id);
  if (index === -1) return NO_NEIGHBORS;

  return {
    previous: index > 0 ? lessons[index - 1] : null,
    next: index < lessons.length - 1 ? lessons[index + 1] : null,
  };
}

import { z } from "zod";
import { LOCALES } from "./config";

/**
 * A path that is root-relative ("/…") or an absolute URL — never bare.
 * `featuredImage` and `avatar` are always PRESENT with an explicit `null`
 * when there is no image, so callers must use `.nullable()`, never
 * `.optional()`, on top of this.
 */
const urlLike = z
  .string()
  .refine((value) => value.startsWith("/") || /^https?:\/\//.test(value), {
    message: "must be root-relative (start with /) or an absolute URL",
  });

const nullableImage = urlLike.nullable();

const LocaleSchema = z.enum(LOCALES);

/** `{ id, name, avatar } | null` — joined by `id`, never by `name`. */
export const AuthorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  avatar: nullableImage,
});
export type Author = z.infer<typeof AuthorSchema>;

/** `{ slug, name } | null` — complete or absent, never half. */
export const CategorySchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
});
export type Category = z.infer<typeof CategorySchema>;

/** The series a lesson belongs to, as attached to an index entry. */
export const SeriesRefSchema = z.object({
  slug: z.string().min(1),
  chapter: z.string(),
  order: z.number().int().nonnegative(),
});
export type SeriesRef = z.infer<typeof SeriesRefSchema>;

const indexEntryShape = {
  id: z.string().min(1),
  locale: LocaleSchema,
  slug: z.string().min(1),
  title: z.string().min(1),
  excerpt: z.string(),
  featuredImage: nullableImage,
  readingTime: z.number().int().nonnegative(),
  // Measured live 2026-09-18, morning: the key was entirely ABSENT (not
  // null) on 10 ja lessons and 30 zh-tw lessons — legacy content the API
  // never backfilled a publish date for; Task 2 reported this as a producer
  // bug (it violates the API's own documented "every field present, null
  // when absent" rule) and a fix was dispatched blog-side.
  //
  // Re-measured live 2026-09-18, later the same day (Task 3): the blog-side
  // fix landed — `ja`'s 10 affected entries now carry `publishedAt: null`
  // instead of omitting the key (verified directly via
  // `GET {API_BASE}/ja/index.json`: 1451/1451 entries have the key present,
  // 10 with an explicit `null`). `.nullish()` (both `.optional()` AND
  // `.nullable()`) accepts either representation, so this schema tolerates
  // both the now-fixed shape and the original bug without another
  // same-day edit if it reappears.
  publishedAt: z.string().nullish(),
  author: AuthorSchema.nullable(),
  tags: z.array(z.string().min(1)),
  category: CategorySchema.nullable(),
  path: z.string().min(1),
  url: z.url(),
};

/**
 * `series` is `null` for `type: "blog"` and `{ slug, chapter, order }` for
 * `type: "lesson"` — encoded directly as a discriminated union rather than
 * a loose `.nullable()` plus a runtime check.
 */
export const IndexEntrySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("blog"), series: z.null(), ...indexEntryShape }),
  z.object({ type: z.literal("lesson"), series: SeriesRefSchema, ...indexEntryShape }),
]);
export type IndexEntry = z.infer<typeof IndexEntrySchema>;

export const IndexSchema = z.array(IndexEntrySchema);

export const ManifestSchema = z.object({
  version: z.string().min(1),
  generatedAt: z.string(),
  locales: z.array(LocaleSchema),
  counts: z.record(
    LocaleSchema,
    z.object({
      posts: z.number().int().nonnegative(),
      lessons: z.number().int().nonnegative(),
      series: z.number().int().nonnegative(),
    }),
  ),
});
export type Manifest = z.infer<typeof ManifestSchema>;

const seriesLessonRefShape = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  order: z.number().int().nonnegative(),
});

const seriesChapterShape = z.object({
  title: z.string(),
  order: z.number().int().nonnegative(),
  lessons: z.array(seriesLessonRefShape),
});

/** The full series tree at `{locale}/series.json`. */
export const SeriesSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  featuredImage: nullableImage,
  // Same fix/re-measurement history as `publishedAt` above: both keys were
  // entirely ABSENT on 1 ja series and 2 zh-tw series when Task 2 measured
  // this (2026-09-18, morning); re-measured later the same day (Task 3),
  // the blog-side fix landed and the affected series now carry explicit
  // `null` for both fields instead of omitting them. `.nullish()` tolerates
  // either representation.
  level: z.enum(["beginner", "intermediate", "advanced"]).nullish(),
  lessonCount: z.number().int().nonnegative().nullish(),
  category: CategorySchema.nullable(),
  url: z.url(),
  chapters: z.array(seriesChapterShape),
});
export type Series = z.infer<typeof SeriesSchema>;

export const SeriesListSchema = z.array(SeriesSchema);

/** `{locale}/taxonomy.json` — the catalog of categories, tags and authors. */
export const TaxonomySchema = z.object({
  categories: z.array(CategorySchema),
  tags: z.array(CategorySchema),
  authors: z.array(AuthorSchema),
});
export type Taxonomy = z.infer<typeof TaxonomySchema>;

/**
 * Shared by `GET /quizzes.json` (list) and `GET /quiz/{slug}.json` (detail,
 * which adds `domains`/`questions` on top — see `QuizDetailSchema` below).
 * Measured live 2026-09-18 against the pre-deploy build served from
 * `/Users/joinytran/Data/Work/xDev/blog/blog.xdev.asia/out` (production
 * `blog.xdev.asia/api/v1/quizzes.json` still 404s at the time this was
 * written — see task-12-report.md): 7 quizzes, 165 questions total
 * (gcp-ml-engineer 50, aws-ml-specialty 15, the other five 20 each).
 */
const quizSummaryShape = {
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  // A lucide icon NAME ("award", "gpu" both measured live), never an image
  // path. This app has no lucide renderer — only `expo-symbols` (SF
  // Symbols) is installed (checked node_modules directly) — so the value is
  // parsed and kept for forward compatibility but not rendered anywhere;
  // mapping two observed names to SF Symbols would be a fragile lookup for
  // the (unknown) rest of the set, and it isn't in the brief's required
  // list ("tiêu đề, số câu, thời lượng, điểm đạt").
  icon: z.string().min(1),
  provider: z.string().min(1),
  // Free-form per provider ("Foundational", "Chuyên gia", "Professional",
  // "Intermediate" all measured live) — unlike `Series.level` above, this is
  // NOT the closed beginner/intermediate/advanced enum, so it stays a plain
  // string rather than reusing that type.
  level: z.string().min(1),
  duration_minutes: z.number().int().positive(),
  // 0–100, per the brief's own contract comment.
  passing_score: z.number().int().min(0).max(100),
  questions_count: z.number().int().positive(),
  tags: z.array(z.string().min(1)),
  series_slug: z.string().min(1).nullable(),
  url: z.url(),
};

export const QuizSummarySchema = z.object(quizSummaryShape);
export type QuizSummary = z.infer<typeof QuizSummarySchema>;

export const QuizListSchema = z.array(QuizSummarySchema);

const QuizLessonRefSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
});

export const QuizDomainSchema = z.object({
  name: z.string().min(1),
  weight: z.number().nullable(),
  lessons: z.array(QuizLessonRefSchema),
});
export type QuizDomain = z.infer<typeof QuizDomainSchema>;

export const QuizQuestionSchema = z.object({
  id: z.number().int(),
  question: z.string().min(1),
  options: z.array(z.string().min(1)).min(2),
  // The INDEX into `options` (0-based), never the option text. Measured
  // live: aws-ml-specialty's question 1 has `correct: 1`, selecting "Random
  // Cut Forest" by POSITION — "Random Cut Forest" itself is never compared
  // against. Scoring (src/content/quiz-scoring.ts) must compare indices
  // only, never option content, or an off-by-one on this field.
  correct: z.number().int().nonnegative(),
  explanation: z.string(),
  domain: z.string().nullable(),
});
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;

/**
 * `GET /quiz/{slug}.json`. `domains` is `null` for real on aws-ml-specialty
 * (measured live, not a defensive guess) — and every one of its 15
 * questions also has `domain: null`, so a null `domains` array and "no
 * question carries a domain" were observed to go together on the one quiz
 * that does this.
 */
export const QuizDetailSchema = z.object({
  ...quizSummaryShape,
  domains: z.array(QuizDomainSchema).nullable(),
  questions: z.array(QuizQuestionSchema).min(1),
});
export type QuizDetail = z.infer<typeof QuizDetailSchema>;

/**
 * Local resume-state for an in-progress quiz attempt — NOT part of the
 * Content API's wire contract (quizzes aren't versioned or partitioned by
 * locale — see cache.ts). Kept here anyway because every other JSON blob
 * this app round-trips through on-device storage is validated with a
 * schema from this file (e.g. `IndexSchema.parse(JSON.parse(...))` in
 * cache.ts) before being trusted; a corrupted or old-shape attempt should
 * fail closed (discard, start the quiz over) rather than crash the quiz
 * screen or index into the wrong question.
 */
export const QuizAttemptStateSchema = z.object({
  slug: z.string().min(1),
  // `null` = unanswered. Never a sentinel like `-1`: scoring compares
  // `answers[i] === question.correct` by strict equality, and `correct` is
  // always `>= 0`, so `null` can never be mistaken for a real option index
  // — including index `0` — without any separate "has been answered" check.
  answers: z.array(z.number().int().nonnegative().nullable()),
  currentIndex: z.number().int().nonnegative(),
  // Absolute epoch ms, computed once at attempt creation as
  // `now + duration_minutes * 60_000` and never updated afterwards — the
  // countdown is derived from wall-clock time on every render
  // (`now >= deadlineMs`) instead of a remaining-seconds counter that would
  // drift while the app is backgrounded, or reset if the process is killed
  // and relaunched mid-exam.
  deadlineMs: z.number().int().positive(),
});
export type QuizAttemptState = z.infer<typeof QuizAttemptStateSchema>;

/**
 * Local personal data (Task 13) — same rationale as `QuizAttemptStateSchema`
 * above: not part of the Content API's wire contract, but every JSON blob
 * this app round-trips through on-device storage still gets a schema here
 * so a corrupted or old-shape value fails closed (discard, fall back to
 * empty) instead of crashing a screen or an auth-triggered sync.
 *
 * One doc per bookmarked post, keyed by `slug` at the call site (an array,
 * not a map, mirrors the Firestore layout it mirrors — one doc per slug
 * under `users/{uid}/bookmarks/{postSlug}`, per `firestore.rules`).
 */
export const BookmarkSchema = z.object({
  slug: z.string().min(1),
  // Epoch ms — used to break ties when merging local and remote bookmarks
  // after sign-in (last-write-wins), the same role `deadlineMs` plays in
  // `QuizAttemptStateSchema` above.
  savedAt: z.number().int().nonnegative(),
});
export type Bookmark = z.infer<typeof BookmarkSchema>;

export const BookmarksListSchema = z.array(BookmarkSchema);

/**
 * One entry per series — the last lesson opened, mirroring the Firestore
 * layout at `users/{uid}/progress/{seriesSlug}`. `lessonId` (not just
 * `lessonSlug`) is carried for the same reason `series-navigation.ts`
 * matches lessons by `id`: two different lessons in the same series tree
 * have been observed to share a `slug`.
 */
export const ReadingProgressEntrySchema = z.object({
  lessonId: z.string().min(1),
  lessonSlug: z.string().min(1),
  updatedAt: z.number().int().nonnegative(),
});
export type ReadingProgressEntry = z.infer<typeof ReadingProgressEntrySchema>;

/** Keyed by `seriesSlug` — a map, not an array, since there is at most one entry per series. */
export const ReadingProgressMapSchema = z.record(z.string(), ReadingProgressEntrySchema);
export type ReadingProgressMap = z.infer<typeof ReadingProgressMapSchema>;

/**
 * Task 16: the on-device daily counter behind the "Hỏi AI về bài viết" send
 * limit. `day` is a local-calendar `YYYY-MM-DD` key (see
 * `personal-data.ts#localDayKey` — deliberately NOT UTC, so a day boundary
 * lands at midnight in the user's own timezone). Unlike `Bookmark`/
 * `ReadingProgressEntry` above, this is NOT identity-linked: it exists to
 * throttle one device's calls against `xdev-asia`'s shared, project-wide
 * Gemini quota, so it must survive sign-out/sign-in on the same device —
 * `clearPersonalData` in personal-data.ts deliberately does not touch it.
 */
export const AiQuestionUsageSchema = z.object({
  day: z.string().min(1),
  count: z.number().int().nonnegative(),
});
export type AiQuestionUsage = z.infer<typeof AiQuestionUsageSchema>;

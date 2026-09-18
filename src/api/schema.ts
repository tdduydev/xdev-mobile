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

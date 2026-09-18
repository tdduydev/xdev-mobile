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
  // Measured live 2026-09-18: the key is entirely ABSENT (not null) on 10 ja
  // lessons and 30 zh-tw lessons — legacy content the API never backfilled a
  // publish date for. Not in the brief's field-rule table; found by fetching
  // ja/zh-tw directly. `.optional()`, not `.nullable()`, matches what was
  // actually observed (a missing key, never an explicit null).
  publishedAt: z.string().optional(),
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
  // Measured live 2026-09-18: both keys are entirely ABSENT (not null) on 1
  // ja series and 2 zh-tw series — same shape of gap as `publishedAt` above.
  level: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  lessonCount: z.number().int().nonnegative().optional(),
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

import { describe, expect, it } from "vitest";
import { getLessonNeighbors } from "../src/content/series-navigation";
import type { IndexEntry, Series } from "../src/api/schema";

function lessonRef(id: string, slug: string, title: string, order: number) {
  return { id, slug, title, order };
}

function series(overrides: Partial<Series> = {}): Series {
  return {
    slug: "example-series",
    title: "Example Series",
    description: "",
    featuredImage: null,
    level: "beginner",
    lessonCount: 5,
    category: null,
    url: "https://blog.xdev.asia/series/example-series/",
    chapters: [],
    ...overrides,
  };
}

function lessonEntry(overrides: Partial<IndexEntry> & { id: string; slug: string }): IndexEntry {
  return {
    type: "lesson",
    locale: "vi",
    title: "…",
    excerpt: "",
    featuredImage: null,
    readingTime: 1,
    publishedAt: null,
    author: null,
    tags: [],
    category: null,
    series: { slug: "example-series", chapter: "Chapter 1", order: 1 },
    path: `content/series/example-series/${overrides.slug}.md`,
    url: `https://blog.xdev.asia/series/example-series/${overrides.slug}/`,
    ...overrides,
  } as IndexEntry;
}

const blogEntry: IndexEntry = {
  id: "blog-1",
  type: "blog",
  locale: "vi",
  slug: "some-post",
  title: "Some post",
  excerpt: "",
  featuredImage: null,
  readingTime: 1,
  publishedAt: null,
  author: null,
  tags: [],
  category: null,
  series: null,
  path: "content/blog/some-post.md",
  url: "https://blog.xdev.asia/blog/some-post/",
};

// Chapter 1 has THREE lessons (so lesson-2 is a genuine "middle of the
// chapter" case, distinct from the chapter-boundary case below) and
// Chapter 2 has two — five lessons total, flattened order:
// lesson-1, lesson-2, lesson-3, lesson-4, lesson-5.
const baseSeries = series({
  chapters: [
    {
      title: "Chapter 1",
      order: 1,
      lessons: [
        lessonRef("lesson-1", "lesson-one", "Lesson One", 1),
        lessonRef("lesson-2", "lesson-two", "Lesson Two", 2),
        lessonRef("lesson-3", "lesson-three", "Lesson Three", 3),
      ],
    },
    {
      title: "Chapter 2",
      order: 2,
      lessons: [
        lessonRef("lesson-4", "lesson-four", "Lesson Four", 1),
        lessonRef("lesson-5", "lesson-five", "Lesson Five", 2),
      ],
    },
  ],
});

describe("getLessonNeighbors", () => {
  it("a lesson in the middle of its chapter has both a previous and a next", () => {
    const entry = lessonEntry({ id: "lesson-2", slug: "lesson-two" });
    const result = getLessonNeighbors([baseSeries], entry);
    expect(result.previous?.id).toBe("lesson-1");
    expect(result.next?.id).toBe("lesson-3");
  });

  it("the first lesson of the series has no previous", () => {
    const entry = lessonEntry({ id: "lesson-1", slug: "lesson-one" });
    const result = getLessonNeighbors([baseSeries], entry);
    expect(result.previous).toBeNull();
    expect(result.next?.id).toBe("lesson-2");
  });

  it("the last lesson of the series has no next", () => {
    const entry = lessonEntry({ id: "lesson-5", slug: "lesson-five" });
    const result = getLessonNeighbors([baseSeries], entry);
    expect(result.previous?.id).toBe("lesson-4");
    expect(result.next).toBeNull();
  });

  it("crosses the chapter boundary: chapter 1's last lesson's next is chapter 2's first", () => {
    const entry = lessonEntry({ id: "lesson-3", slug: "lesson-three" });
    const result = getLessonNeighbors([baseSeries], entry);
    expect(result.previous?.id).toBe("lesson-2");
    expect(result.next?.id).toBe("lesson-4");
    expect(result.next?.title).toBe("Lesson Four");
  });

  it("type: blog has no neighbors at all", () => {
    const result = getLessonNeighbors([baseSeries], blogEntry);
    expect(result).toEqual({ previous: null, next: null });
  });

  // The exact bug the brief calls out (Task 2): the blog repo really did
  // ship two different lessons sharing slug "terminology-service" in the
  // same series. A slug-keyed lookup (`lessons.findIndex(l => l.slug ===
  // entry.slug)`) would resolve BOTH entries to whichever duplicate happens
  // to come first in the flattened list, handing the other one the wrong
  // neighbors. This must go red if that mistake is reintroduced.
  it("two lessons with the same slug but different ids each get their own correct neighbors", () => {
    const dupSeries = series({
      chapters: [
        {
          title: "Chapter 1",
          order: 1,
          lessons: [
            lessonRef("dup-a", "terminology-service", "Terminology Service (Part 1)", 1),
            lessonRef("middle", "middle-lesson", "Middle Lesson", 2),
          ],
        },
        {
          title: "Chapter 2",
          order: 2,
          lessons: [lessonRef("dup-b", "terminology-service", "Terminology Service (Part 2)", 1)],
        },
      ],
    });

    const first = lessonEntry({ id: "dup-a", slug: "terminology-service" });
    const firstResult = getLessonNeighbors([dupSeries], first);
    expect(firstResult.previous).toBeNull();
    expect(firstResult.next?.id).toBe("middle");

    const second = lessonEntry({ id: "dup-b", slug: "terminology-service" });
    const secondResult = getLessonNeighbors([dupSeries], second);
    expect(secondResult.previous?.id).toBe("middle");
    expect(secondResult.next).toBeNull();
  });

  it("still resolves the correct order when chapters and lessons appear shuffled in the array", () => {
    const shuffled = series({
      chapters: [
        {
          // Chapter 2 listed FIRST in the array, but its `order` is 2.
          title: "Chapter 2",
          order: 2,
          lessons: [
            lessonRef("lesson-5", "lesson-five", "Lesson Five", 2),
            lessonRef("lesson-4", "lesson-four", "Lesson Four", 1),
          ],
        },
        {
          title: "Chapter 1",
          order: 1,
          lessons: [
            lessonRef("lesson-3", "lesson-three", "Lesson Three", 3),
            lessonRef("lesson-1", "lesson-one", "Lesson One", 1),
            lessonRef("lesson-2", "lesson-two", "Lesson Two", 2),
          ],
        },
      ],
    });

    const entry = lessonEntry({ id: "lesson-3", slug: "lesson-three" });
    const result = getLessonNeighbors([shuffled], entry);
    expect(result.previous?.id).toBe("lesson-2");
    expect(result.next?.id).toBe("lesson-4");
  });

  it("returns no neighbors when the entry's series slug isn't in seriesList (not loaded yet)", () => {
    const entry = lessonEntry({ id: "lesson-1", slug: "lesson-one" });
    const result = getLessonNeighbors([], entry);
    expect(result).toEqual({ previous: null, next: null });
  });

  it("returns no neighbors when the lesson id isn't found in the matched series (index/series.json disagree)", () => {
    const entry = lessonEntry({ id: "not-in-series", slug: "ghost-lesson" });
    const result = getLessonNeighbors([baseSeries], entry);
    expect(result).toEqual({ previous: null, next: null });
  });

  it("does not mutate the input series' chapters or lessons arrays", () => {
    const snapshot = JSON.parse(JSON.stringify(baseSeries));
    const entry = lessonEntry({ id: "lesson-2", slug: "lesson-two" });
    getLessonNeighbors([baseSeries], entry);
    expect(baseSeries).toEqual(snapshot);
  });
});

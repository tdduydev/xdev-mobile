import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Bookmark, ReadingProgressMap } from "../src/api/schema";

// Same in-memory AsyncStorage mock shape as cache.test.ts, extended with
// `getAllKeys`/`multiRemove` — the two primitives `clearPersonalData` needs
// to sweep every `xdev:quizAttempt:<slug>` key by prefix (slugs are
// open-ended, so there's no fixed key list to remove).
vi.mock("@react-native-async-storage/async-storage", () => {
  const store = new Map<string, string>();
  return {
    default: {
      getItem: vi.fn(async (key: string) => store.get(key) ?? null),
      setItem: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: vi.fn(async (key: string) => {
        store.delete(key);
      }),
      getAllKeys: vi.fn(async () => [...store.keys()]),
      multiRemove: vi.fn(async (keys: string[]) => {
        for (const key of keys) store.delete(key);
      }),
      __reset: () => store.clear(),
      __seed: (key: string, value: string) => store.set(key, value),
    },
  };
});

import {
  clearPersonalData,
  DAILY_AI_QUESTION_LIMIT,
  getAiQuestionsRemaining,
  getBookmarks,
  getReadingProgress,
  isBookmarked,
  localDayKey,
  mergeBookmarks,
  mergeReadingProgress,
  recordAiQuestion,
  resolveAiQuestionUsage,
  saveBookmarks,
  saveReadingProgress,
  toggleBookmark,
  withLessonRead,
} from "../src/api/personal-data";

type MockedAsyncStorage = {
  __reset: () => void;
  __seed: (key: string, value: string) => void;
};

async function getMock(): Promise<MockedAsyncStorage> {
  return ((await import("@react-native-async-storage/async-storage")).default as unknown) as MockedAsyncStorage;
}

beforeEach(async () => {
  (await getMock()).__reset();
});

function bookmark(slug: string, savedAt: number): Bookmark {
  return { slug, savedAt };
}

describe("getBookmarks / saveBookmarks", () => {
  it("is [] before anything has been saved", async () => {
    expect(await getBookmarks()).toEqual([]);
  });

  it("round-trips a saved list", async () => {
    const list = [bookmark("a", 1), bookmark("b", 2)];
    await saveBookmarks(list);
    expect(await getBookmarks()).toEqual(list);
  });

  it("falls back to [] on corrupted JSON rather than throwing", async () => {
    (await getMock()).__seed("xdev:bookmarks", "{not json");
    expect(await getBookmarks()).toEqual([]);
  });

  it("falls back to [] on a value that fails the schema (old shape)", async () => {
    (await getMock()).__seed("xdev:bookmarks", JSON.stringify([{ slug: "a" /* missing savedAt */ }]));
    expect(await getBookmarks()).toEqual([]);
  });
});

describe("isBookmarked", () => {
  it("finds a matching slug", () => {
    expect(isBookmarked([bookmark("a", 1)], "a")).toBe(true);
  });

  it("is false for a slug not in the list, including the empty list", () => {
    expect(isBookmarked([], "a")).toBe(false);
    expect(isBookmarked([bookmark("a", 1)], "b")).toBe(false);
  });
});

describe("toggleBookmark", () => {
  it("adds a slug that isn't bookmarked yet, stamped with `now`", () => {
    const { bookmarks, added } = toggleBookmark([], "a", 100);
    expect(added).toBe(true);
    expect(bookmarks).toEqual([bookmark("a", 100)]);
  });

  it("removes a slug that is already bookmarked", () => {
    const { bookmarks, added } = toggleBookmark([bookmark("a", 1), bookmark("b", 2)], "a", 100);
    expect(added).toBe(false);
    expect(bookmarks).toEqual([bookmark("b", 2)]);
  });

  it("never mutates the input array", () => {
    const original = [bookmark("a", 1)];
    toggleBookmark(original, "b", 100);
    expect(original).toEqual([bookmark("a", 1)]);
  });
});

describe("mergeBookmarks", () => {
  it("unions disjoint local and remote lists", () => {
    const merged = mergeBookmarks([bookmark("a", 1)], [bookmark("b", 2)]);
    expect(merged.map((entry) => entry.slug).sort()).toEqual(["a", "b"]);
  });

  it("keeps the later savedAt on a slug collision (last-write-wins), from either side", () => {
    const localNewer = mergeBookmarks([bookmark("a", 200)], [bookmark("a", 100)]);
    expect(localNewer).toEqual([bookmark("a", 200)]);

    const remoteNewer = mergeBookmarks([bookmark("a", 100)], [bookmark("a", 200)]);
    expect(remoteNewer).toEqual([bookmark("a", 200)]);
  });
});

describe("getReadingProgress / saveReadingProgress", () => {
  it("is {} before anything has been saved", async () => {
    expect(await getReadingProgress()).toEqual({});
  });

  it("round-trips a saved map", async () => {
    const progress: ReadingProgressMap = { "mlops-101": { lessonId: "l1", lessonSlug: "intro", updatedAt: 1 } };
    await saveReadingProgress(progress);
    expect(await getReadingProgress()).toEqual(progress);
  });

  it("falls back to {} on corrupted JSON rather than throwing", async () => {
    (await getMock()).__seed("xdev:readingProgress", "{not json");
    expect(await getReadingProgress()).toEqual({});
  });
});

describe("withLessonRead", () => {
  it("adds a first entry for a series with none yet", () => {
    const progress = withLessonRead({}, "mlops-101", "l1", "intro", 100);
    expect(progress).toEqual({ "mlops-101": { lessonId: "l1", lessonSlug: "intro", updatedAt: 100 } });
  });

  it("overwrites the existing entry for the same series rather than appending", () => {
    const before: ReadingProgressMap = { "mlops-101": { lessonId: "l1", lessonSlug: "intro", updatedAt: 1 } };
    const after = withLessonRead(before, "mlops-101", "l2", "next-up", 200);
    expect(after).toEqual({ "mlops-101": { lessonId: "l2", lessonSlug: "next-up", updatedAt: 200 } });
  });

  it("leaves other series' entries untouched", () => {
    const before: ReadingProgressMap = { "other-series": { lessonId: "x", lessonSlug: "x", updatedAt: 1 } };
    const after = withLessonRead(before, "mlops-101", "l1", "intro", 100);
    expect(after["other-series"]).toEqual(before["other-series"]);
  });
});

describe("mergeReadingProgress", () => {
  it("keeps the later updatedAt per series on a collision", () => {
    const local: ReadingProgressMap = { s1: { lessonId: "l1", lessonSlug: "a", updatedAt: 100 } };
    const remote: ReadingProgressMap = { s1: { lessonId: "l2", lessonSlug: "b", updatedAt: 200 } };
    expect(mergeReadingProgress(local, remote)).toEqual({ s1: remote.s1 });
    expect(mergeReadingProgress(remote, local)).toEqual({ s1: remote.s1 });
  });

  it("unions series present on only one side", () => {
    const local: ReadingProgressMap = { s1: { lessonId: "l1", lessonSlug: "a", updatedAt: 1 } };
    const remote: ReadingProgressMap = { s2: { lessonId: "l2", lessonSlug: "b", updatedAt: 1 } };
    expect(mergeReadingProgress(local, remote)).toEqual({ ...local, ...remote });
  });
});

describe("clearPersonalData", () => {
  it("removes bookmarks, reading progress, and every quiz-attempt key, leaving other app keys untouched", async () => {
    const mock = await getMock();
    await saveBookmarks([bookmark("a", 1)]);
    await saveReadingProgress({ s1: { lessonId: "l1", lessonSlug: "a", updatedAt: 1 } });
    mock.__seed("xdev:quizAttempt:aws-ml-specialty", JSON.stringify({ slug: "aws-ml-specialty" }));
    mock.__seed("xdev:quizAttempt:gcp-ml-engineer", JSON.stringify({ slug: "gcp-ml-engineer" }));
    // Non-personal app state that must survive sign-out.
    mock.__seed("xdev:locale", "vi");
    mock.__seed("xdev:theme", "system");
    mock.__seed("xdev:manifestVersion", "42");
    // Task 16: a device rate limit, not identity data — sign-out must not
    // give the same device a free quota reset (see personal-data.ts's
    // comment on `clearPersonalData`).
    mock.__seed("xdev:aiQuestionUsage", JSON.stringify({ day: "2026-09-18", count: 3 }));

    await clearPersonalData();

    expect(await getBookmarks()).toEqual([]);
    expect(await getReadingProgress()).toEqual({});
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    const remainingKeys = await AsyncStorage.getAllKeys();
    expect([...remainingKeys].sort()).toEqual(["xdev:aiQuestionUsage", "xdev:locale", "xdev:manifestVersion", "xdev:theme"]);
  });
});

describe("localDayKey", () => {
  it("is timezone-independent to test the same way it will run: same local day, any local time, same key", () => {
    // `new Date(year, monthIndex, day, ...)` builds from LOCAL fields, so
    // this doesn't depend on the machine's/CI's actual timezone — the
    // point being tested (local calendar day, not UTC) holds either way.
    expect(localDayKey(new Date(2026, 8, 19, 0, 0, 0))).toBe("2026-09-19");
    expect(localDayKey(new Date(2026, 8, 19, 23, 59, 59))).toBe("2026-09-19");
  });

  it("changes at local midnight, not at a fixed offset", () => {
    expect(localDayKey(new Date(2026, 8, 18, 23, 59, 59))).toBe("2026-09-18");
    expect(localDayKey(new Date(2026, 8, 19, 0, 0, 0))).toBe("2026-09-19");
  });

  it("zero-pads month and day so keys compare correctly as plain strings", () => {
    expect(localDayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("resolveAiQuestionUsage", () => {
  it("starts a fresh zero-count bucket when nothing is stored yet", () => {
    expect(resolveAiQuestionUsage(null, "2026-09-19")).toEqual({ day: "2026-09-19", count: 0 });
  });

  it("keeps the same bucket's count on the same local day", () => {
    expect(resolveAiQuestionUsage({ day: "2026-09-19", count: 3 }, "2026-09-19")).toEqual({ day: "2026-09-19", count: 3 });
  });

  it("grants a fresh bucket on a day strictly after the stored one", () => {
    expect(resolveAiQuestionUsage({ day: "2026-09-18", count: 5 }, "2026-09-19")).toEqual({ day: "2026-09-19", count: 0 });
  });

  it("does NOT grant a fresh bucket when the clock is wound back before the stored day (brief's anti-abuse rule)", () => {
    const afterRollback = resolveAiQuestionUsage({ day: "2026-09-19", count: 5 }, "2026-09-18");
    // The already-recorded (higher) day is kept as-is — not reset, and not
    // overwritten with the earlier "today".
    expect(afterRollback).toEqual({ day: "2026-09-19", count: 5 });
  });
});

describe("getAiQuestionsRemaining / recordAiQuestion", () => {
  const today = new Date(2026, 8, 19, 12, 0, 0);

  it("reports the full limit before anything has been asked today", async () => {
    expect(await getAiQuestionsRemaining(today)).toBe(DAILY_AI_QUESTION_LIMIT);
  });

  it("counts down one per recorded question and disallows once the limit is reached", async () => {
    for (let i = 0; i < DAILY_AI_QUESTION_LIMIT; i++) {
      const result = await recordAiQuestion(today);
      expect(result.allowed).toBe(true);
    }
    expect(await getAiQuestionsRemaining(today)).toBe(0);

    const exhausted = await recordAiQuestion(today);
    expect(exhausted).toEqual({ allowed: false, remaining: 0 });
  });

  it("resets the very next local day", async () => {
    for (let i = 0; i < DAILY_AI_QUESTION_LIMIT; i++) await recordAiQuestion(today);
    expect(await getAiQuestionsRemaining(today)).toBe(0);

    const tomorrow = new Date(2026, 8, 20, 0, 0, 1);
    expect(await getAiQuestionsRemaining(tomorrow)).toBe(DAILY_AI_QUESTION_LIMIT);
  });

  it("grants no extra turns when the system clock is wound back to yesterday", async () => {
    for (let i = 0; i < DAILY_AI_QUESTION_LIMIT; i++) await recordAiQuestion(today);
    expect(await getAiQuestionsRemaining(today)).toBe(0);

    const yesterday = new Date(2026, 8, 18, 12, 0, 0);
    expect(await getAiQuestionsRemaining(yesterday)).toBe(0);
    expect(await recordAiQuestion(yesterday)).toEqual({ allowed: false, remaining: 0 });
  });
});

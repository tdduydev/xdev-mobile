import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase/firestore";

// `firebase/firestore` is mocked wholesale — same wholesale-module-mocking
// style as tests/cache.test.ts's AsyncStorage/expo-file-system mocks — so
// this suite never touches a real project. `doc`/`collection` record the
// segments they were called with (rather than building a real DocumentRef)
// so tests can assert on exactly what path a write/read targets.
vi.mock("firebase/firestore", () => ({
  doc: vi.fn((db: unknown, ...segments: string[]) => ({ __kind: "doc", db, segments })),
  collection: vi.fn((db: unknown, ...segments: string[]) => ({ __kind: "collection", db, segments })),
  setDoc: vi.fn(async () => undefined),
  deleteDoc: vi.fn(async () => undefined),
  getDocs: vi.fn(async () => ({ docs: [] as Array<{ id: string; data: () => Record<string, unknown> }> })),
}));

import { collection, deleteDoc, doc, getDocs, setDoc } from "firebase/firestore";
import {
  fetchRemoteBookmarks,
  fetchRemoteReadingProgress,
  syncBookmarkAdded,
  syncBookmarkRemoved,
  syncQuizResult,
  syncReadingProgress,
} from "../src/firebase/sync";

// Never dereferenced by the no-op-when-signed-out tests, and only ever
// passed through opaquely by the mocked `doc`/`collection` above otherwise
// — a sentinel object, not a real Firestore, is enough either way.
const FAKE_DB = { __kind: "fake-firestore" } as unknown as Firestore;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signed out (uid === null): every sync function no-ops", () => {
  it("syncBookmarkAdded/Removed never touch Firestore", async () => {
    await syncBookmarkAdded(FAKE_DB, null, { slug: "a", savedAt: 1 });
    await syncBookmarkRemoved(FAKE_DB, null, "a");
    expect(doc).not.toHaveBeenCalled();
    expect(setDoc).not.toHaveBeenCalled();
    expect(deleteDoc).not.toHaveBeenCalled();
  });

  it("syncReadingProgress never touches Firestore", async () => {
    await syncReadingProgress(FAKE_DB, null, "mlops-101", { lessonId: "l1", lessonSlug: "intro", updatedAt: 1 });
    expect(doc).not.toHaveBeenCalled();
    expect(setDoc).not.toHaveBeenCalled();
  });

  it("syncQuizResult never touches Firestore", async () => {
    await syncQuizResult(FAKE_DB, null, "attempt-1", {
      quizSlug: "q",
      quizTitle: "Q",
      passingScore: 70,
      finishedAt: 1,
      correctCount: 1,
      totalCount: 1,
      scorePercent: 100,
      passed: true,
      perQuestion: [],
    });
    expect(doc).not.toHaveBeenCalled();
    expect(setDoc).not.toHaveBeenCalled();
  });

  it("fetchRemoteBookmarks/fetchRemoteReadingProgress resolve empty without querying", async () => {
    expect(await fetchRemoteBookmarks(FAKE_DB, null)).toEqual([]);
    expect(await fetchRemoteReadingProgress(FAKE_DB, null)).toEqual({});
    expect(collection).not.toHaveBeenCalled();
    expect(getDocs).not.toHaveBeenCalled();
  });
});

describe("signed in: writes target the exact rule-permitted path", () => {
  it("syncBookmarkAdded writes users/{uid}/bookmarks/{postSlug}", async () => {
    await syncBookmarkAdded(FAKE_DB, "u1", { slug: "intro-to-mlops", savedAt: 123 });
    expect(doc).toHaveBeenCalledWith(FAKE_DB, "users", "u1", "bookmarks", "intro-to-mlops");
    expect(setDoc).toHaveBeenCalledWith(expect.objectContaining({ __kind: "doc" }), { savedAt: 123 });
  });

  it("syncBookmarkRemoved deletes the same path", async () => {
    await syncBookmarkRemoved(FAKE_DB, "u1", "intro-to-mlops");
    expect(doc).toHaveBeenCalledWith(FAKE_DB, "users", "u1", "bookmarks", "intro-to-mlops");
    expect(deleteDoc).toHaveBeenCalled();
  });

  it("syncReadingProgress writes users/{uid}/progress/{seriesSlug}", async () => {
    const entry = { lessonId: "l1", lessonSlug: "intro", updatedAt: 456 };
    await syncReadingProgress(FAKE_DB, "u1", "mlops-101", entry);
    expect(doc).toHaveBeenCalledWith(FAKE_DB, "users", "u1", "progress", "mlops-101");
    expect(setDoc).toHaveBeenCalledWith(expect.objectContaining({ __kind: "doc" }), entry);
  });

  it("syncQuizResult writes quizResults/{uid}/attempts/{attemptId}", async () => {
    const resultDoc = {
      quizSlug: "aws-ml-specialty",
      quizTitle: "AWS ML Specialty",
      passingScore: 75,
      finishedAt: 789,
      correctCount: 10,
      totalCount: 15,
      scorePercent: 67,
      passed: false,
      perQuestion: [],
    };
    await syncQuizResult(FAKE_DB, "u1", "attempt-abc", resultDoc);
    expect(doc).toHaveBeenCalledWith(FAKE_DB, "quizResults", "u1", "attempts", "attempt-abc");
    expect(setDoc).toHaveBeenCalledWith(expect.objectContaining({ __kind: "doc" }), resultDoc);
  });
});

describe("fetchRemoteBookmarks", () => {
  it("maps each doc's id to slug and its savedAt field", async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({
      docs: [
        { id: "a", data: () => ({ savedAt: 111 }) },
        { id: "b", data: () => ({ savedAt: 222 }) },
      ],
    } as never);
    const bookmarks = await fetchRemoteBookmarks(FAKE_DB, "u1");
    expect(collection).toHaveBeenCalledWith(FAKE_DB, "users", "u1", "bookmarks");
    expect(bookmarks).toEqual([
      { slug: "a", savedAt: 111 },
      { slug: "b", savedAt: 222 },
    ]);
  });

  it("defaults a missing/malformed savedAt to 0 rather than throwing", async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [{ id: "a", data: () => ({}) }] } as never);
    expect(await fetchRemoteBookmarks(FAKE_DB, "u1")).toEqual([{ slug: "a", savedAt: 0 }]);
  });
});

describe("fetchRemoteReadingProgress", () => {
  it("maps each doc's id to seriesSlug and keeps its fields", async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({
      docs: [{ id: "mlops-101", data: () => ({ lessonId: "l1", lessonSlug: "intro", updatedAt: 999 }) }],
    } as never);
    const progress = await fetchRemoteReadingProgress(FAKE_DB, "u1");
    expect(collection).toHaveBeenCalledWith(FAKE_DB, "users", "u1", "progress");
    expect(progress).toEqual({ "mlops-101": { lessonId: "l1", lessonSlug: "intro", updatedAt: 999 } });
  });

  it("skips a doc missing required fields rather than throwing or including a malformed entry", async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({
      docs: [{ id: "bad", data: () => ({ lessonId: "l1" }) }],
    } as never);
    expect(await fetchRemoteReadingProgress(FAKE_DB, "u1")).toEqual({});
  });
});

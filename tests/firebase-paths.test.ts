import { describe, expect, it } from "vitest";
import { bookmarkPathSegments, progressPathSegments, quizResultPathSegments } from "../src/firebase/paths";

// Firestore document paths always have an EVEN segment count
// (collection/doc/collection/doc/...) — these assert the exact segments
// against `firestore.rules` (blog.xdev.asia repo) so a future edit that
// drops or adds a segment (making the path a collection reference, or
// nesting one level too deep) fails loudly here rather than as a runtime
// "permission-denied" against real Firestore.

describe("bookmarkPathSegments", () => {
  it("matches users/{uid}/bookmarks/{postSlug}", () => {
    expect(bookmarkPathSegments("u1", "intro-to-mlops")).toEqual(["users", "u1", "bookmarks", "intro-to-mlops"]);
  });
});

describe("progressPathSegments", () => {
  it("matches users/{uid}/progress/{seriesSlug}", () => {
    expect(progressPathSegments("u1", "mlops-101")).toEqual(["users", "u1", "progress", "mlops-101"]);
  });
});

describe("quizResultPathSegments", () => {
  it("matches quizResults/{uid}/attempts/{attemptId}", () => {
    expect(quizResultPathSegments("u1", "attempt-123")).toEqual(["quizResults", "u1", "attempts", "attempt-123"]);
  });

  it("keeps uid and attemptId as separate segments, never concatenated", () => {
    const segments = quizResultPathSegments("u1", "a1");
    expect(segments).toHaveLength(4);
    expect(segments[1]).toBe("u1");
    expect(segments[3]).toBe("a1");
  });
});

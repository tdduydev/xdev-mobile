/**
 * Firestore document path segments for this app's writes — one function per
 * collection this app touches, each hard-coded to exactly match
 * `firestore.rules` (blog.xdev.asia repo, not duplicated/re-derived here):
 *
 * ```
 * users/{uid}/progress/{seriesSlug}       read,write if request.auth.uid == uid
 * users/{uid}/bookmarks/{postSlug}        ditto
 * quizResults/{uid}/attempts/{attemptId}  read,write if request.auth.uid == uid
 * ```
 *
 * Deliberately zero Firebase imports — these return plain string tuples
 * (spread into `doc(db, ...segments)` at the call site in sync.ts), so a
 * test can assert the exact segment count and order (a 3- or 5-segment
 * path here would silently violate the rule above's odd/even path-length
 * requirement — Firestore document paths always have an even number of
 * segments, collection/doc/collection/doc/...) without importing
 * `firebase/firestore` or touching a real project at all.
 *
 * `users/{uid}/roadmapProgress/{slug}` from the same rules file is
 * intentionally NOT covered here — task-13 brief's requirements list has
 * no roadmap feature, and this app has none to sync.
 */

export function bookmarkPathSegments(uid: string, postSlug: string): readonly [string, string, string, string] {
  return ["users", uid, "bookmarks", postSlug];
}

export function progressPathSegments(uid: string, seriesSlug: string): readonly [string, string, string, string] {
  return ["users", uid, "progress", seriesSlug];
}

export function quizResultPathSegments(uid: string, attemptId: string): readonly [string, string, string, string] {
  return ["quizResults", uid, "attempts", attemptId];
}

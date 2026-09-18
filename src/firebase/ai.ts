import { getAI, getGenerativeModel, GoogleAIBackend, type GenerativeModel } from "firebase/ai";
import { getFirebaseApp } from "./app";

/**
 * Same tiny lazy-singleton helper as `app.ts`'s (and `api/cache.ts`'s) —
 * duplicated on purpose rather than imported, matching this codebase's
 * existing convention of one small `lazy()` per module rather than a
 * shared util (see `app.ts`'s doc comment referencing `cache.ts`'s).
 */
function lazy<T>(create: () => T): () => T {
  let instance: T | undefined;
  return () => {
    if (instance === undefined) instance = create();
    return instance;
  };
}

/**
 * Task-14a: Gemini via Firebase AI Logic, for the per-article "Hỏi AI về
 * bài viết" chat. Copied 1:1 from the web app's
 * `blog.xdev.asia/src/lib/firebase.ts`:
 *
 * ```ts
 * export const gemini: GenerativeModel = getGenerativeModel(
 *   getAI(app, { backend: new GoogleAIBackend() }),
 *   { model: "gemini-2.5-flash" }
 * );
 * ```
 *
 * — same `xdev-asia` project, same backend (`GoogleAIBackend`, the
 * Gemini Developer API key path — not Vertex AI), same model. Reuses
 * `getFirebaseApp()` from `app.ts` (Task 13's singleton, guarded against a
 * second `initializeApp()` call) rather than initializing a second
 * `FirebaseApp`.
 *
 * Deliberately lazy, same rationale as every other export in `app.ts`:
 * must not run at module-import time (before anything has decided it
 * needs Gemini), and must not run unconditionally in a unit test that
 * happens to import a module which imports this one.
 *
 * No App Check here — see this repo's README and task-14a-report.md.
 * That's Task 14b, deliberately: enforcement isn't even on for this
 * Firebase project yet (the web app calls this exact API, unauthenticated
 * end-to-end, in production today), and the React Native App Check
 * providers (`@react-native-firebase/app-check`'s App Attest / Play
 * Integrity) are native modules that would require leaving Expo Go, which
 * this task must not do.
 */
export const getGeminiModel = lazy((): GenerativeModel =>
  getGenerativeModel(getAI(getFirebaseApp(), { backend: new GoogleAIBackend() }), { model: "gemini-2.5-flash" }),
);

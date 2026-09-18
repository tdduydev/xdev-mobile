/**
 * AsyncStorage key (prefix) constants shared across cache.ts and
 * personal-data.ts. Pulled out into their own dependency-free module
 * (rather than one file importing the other for a single constant) so a
 * unit test that only needs personal-data.ts's local-storage functions
 * doesn't have to pull in cache.ts's transitive imports (expo-file-system,
 * api/client.ts, and ultimately real `react-native` — none of which are
 * mocked in tests/personal-data.test.ts, unlike tests/cache.test.ts, which
 * mocks that whole stack because cache.ts genuinely needs it).
 */

/** One key per in-progress quiz attempt: `${QUIZ_ATTEMPT_KEY_PREFIX}${slug}` — see cache.ts's `saveQuizAttempt`/`getSavedQuizAttempt`. */
export const QUIZ_ATTEMPT_KEY_PREFIX = "xdev:quizAttempt:";

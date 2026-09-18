import type { QuizAttemptState, QuizDetail } from "../api/schema";

/** A fresh attempt: every question unanswered, starting at question 0, timed from `now`. */
export function createAttempt(quiz: QuizDetail, now: number): QuizAttemptState {
  return {
    slug: quiz.slug,
    answers: new Array(quiz.questions.length).fill(null),
    currentIndex: 0,
    deadlineMs: now + quiz.duration_minutes * 60_000,
  };
}

/**
 * Resumes `saved` only when it genuinely matches `quiz` — same slug AND the
 * same question count. Quizzes carry no version field (unlike
 * `manifest.version` for the index — see cache.ts), so a question-count
 * mismatch is the only signal available that the quiz's content changed
 * server-side since the attempt was saved. Indexing a stale `answers` array
 * against a NEW `quiz.questions` array in that case could silently
 * misattribute an old answer to a different question — falling back to a
 * fresh attempt is the safer default; losing one in-progress attempt across
 * a content change is a smaller cost than mis-scoring it.
 */
export function resumeOrCreateAttempt(quiz: QuizDetail, saved: QuizAttemptState | null, now: number): QuizAttemptState {
  if (saved && saved.slug === quiz.slug && saved.answers.length === quiz.questions.length) {
    return saved;
  }
  return createAttempt(quiz, now);
}

/** `>=`, not `>` — the same boundary rule as `scoreQuiz`'s pass/fail check. */
export function isExpired(attempt: QuizAttemptState, now: number): boolean {
  return now >= attempt.deadlineMs;
}

/**
 * Never negative — `Math.max(0, …)` so a render after the deadline (whether
 * the countdown just reached it, or the app was relaunched long after it
 * passed) shows "0:00" rather than a negative countdown.
 */
export function remainingSeconds(attempt: QuizAttemptState, now: number): number {
  return Math.max(0, Math.ceil((attempt.deadlineMs - now) / 1000));
}

/** Pure update — returns a new attempt, never mutates `attempt.answers` in place. */
export function setAnswer(attempt: QuizAttemptState, questionIndex: number, optionIndex: number): QuizAttemptState {
  const answers = [...attempt.answers];
  answers[questionIndex] = optionIndex;
  return { ...attempt, answers };
}

/** Clamps to `[0, totalQuestions - 1]` — prev/next can never walk off either end of the exam. */
export function goToQuestion(attempt: QuizAttemptState, index: number, totalQuestions: number): QuizAttemptState {
  const clamped = Math.max(0, Math.min(index, totalQuestions - 1));
  return { ...attempt, currentIndex: clamped };
}

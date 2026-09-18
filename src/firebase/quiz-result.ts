import type { QuizDetail } from "@/api/schema";
import type { QuizResult } from "@/content/quiz-scoring";

/**
 * The shape written to `quizResults/{uid}/attempts/{attemptId}`. Reuses
 * every field of Task 12's `QuizResult` (src/content/quiz-scoring.ts)
 * VERBATIM — `correctCount`, `totalCount`, `scorePercent`, `passed`,
 * `perQuestion` — rather than reshaping or renaming them: the quiz screen
 * already computes a `QuizResult` locally (via `scoreQuiz`) at the exact
 * moment this needs to be written (on submit, or when time runs out), so
 * this is purely "what to add on top for a standalone Firestore doc that
 * has to identify which quiz/attempt it belongs to", not a redesign of
 * what a quiz result IS.
 */
export type QuizResultDocument = QuizResult & {
  /** Which quiz this attempt was for — `QuizResult` alone doesn't say. */
  quizSlug: string;
  quizTitle: string;
  /** Snapshot of `quiz.passing_score` at attempt time, so a later change to the quiz's passing score doesn't retroactively reinterpret old results. */
  passingScore: number;
  /** Epoch ms — when the attempt was submitted or the deadline was hit. */
  finishedAt: number;
};

/** Pure: builds the document to write, given the quiz, its already-computed result, and a finish timestamp. Never talks to Firestore itself — see sync.ts for the actual write. */
export function toQuizResultDocument(quiz: QuizDetail, result: QuizResult, finishedAtMs: number): QuizResultDocument {
  return {
    ...result,
    quizSlug: quiz.slug,
    quizTitle: quiz.title,
    passingScore: quiz.passing_score,
    finishedAt: finishedAtMs,
  };
}

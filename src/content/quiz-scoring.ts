import type { QuizQuestion } from "../api/schema";

export type QuestionResult = {
  questionIndex: number;
  selected: number | null;
  isCorrect: boolean;
};

export type QuizResult = {
  correctCount: number;
  totalCount: number;
  scorePercent: number;
  passed: boolean;
  perQuestion: QuestionResult[];
};

/**
 * `answers[i]` is compared against `questions[i].correct` by strict
 * equality of INDEX, never by content — see `QuizQuestionSchema`'s comment
 * in schema.ts. `undefined` (an `answers` array shorter than `questions`,
 * e.g. before the last question has been reached) is normalized to `null`
 * and treated exactly like an explicit "unanswered": neither is ever `===`
 * a real `correct` index, including index `0`, so no separate
 * has-been-answered branch is needed and a `!answer` truthiness bug (which
 * would misread a correct answer of index `0` as unanswered) has nothing to
 * hook into here.
 */
export function scoreQuiz(
  questions: readonly QuizQuestion[],
  answers: readonly (number | null | undefined)[],
  passingScore: number,
): QuizResult {
  const perQuestion: QuestionResult[] = questions.map((question, index) => {
    const selected = answers[index] ?? null;
    return { questionIndex: index, selected, isCorrect: selected === question.correct };
  });
  const correctCount = perQuestion.filter((result) => result.isCorrect).length;
  const totalCount = questions.length;
  // Rounded to the nearest integer percent exactly once — the SAME number
  // feeds both the displayed score and the pass/fail comparison below, so a
  // result can never show e.g. "70%" next to "Not passed" for a
  // `passing_score` of 70 because the two were rounded differently.
  const scorePercent = totalCount === 0 ? 0 : Math.round((correctCount / totalCount) * 100);
  return {
    correctCount,
    totalCount,
    scorePercent,
    // `>=`, not `>`: brief's own boundary case — a score exactly equal to
    // `passing_score` must be a PASS.
    passed: scorePercent >= passingScore,
    perQuestion,
  };
}

export type DomainBreakdown = {
  domain: string;
  correct: number;
  total: number;
};

/**
 * Groups `perQuestion` results by `questions[i].domain`, skipping any
 * question whose `domain` is `null`. Returns `[]` — not a fallback "no
 * domain" bucket — when EVERY question has `domain: null` (measured live:
 * aws-ml-specialty's `domains: null` and all 15 of its questions'
 * `domain: null` were observed together), so the result screen can decide
 * whether to render a domain breakdown section just by checking
 * `.length === 0`, without needing to separately know why there's nothing
 * to show.
 */
export function groupResultsByDomain(
  questions: readonly QuizQuestion[],
  perQuestion: readonly QuestionResult[],
): DomainBreakdown[] {
  const order: string[] = [];
  const byDomain = new Map<string, DomainBreakdown>();
  for (const result of perQuestion) {
    const domain = questions[result.questionIndex]?.domain;
    if (!domain) continue;
    let bucket = byDomain.get(domain);
    if (!bucket) {
      bucket = { domain, correct: 0, total: 0 };
      byDomain.set(domain, bucket);
      order.push(domain);
    }
    bucket.total += 1;
    if (result.isCorrect) bucket.correct += 1;
  }
  return order.map((domain) => byDomain.get(domain)!);
}

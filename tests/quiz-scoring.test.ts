import { describe, expect, it } from "vitest";
import { groupResultsByDomain, scoreQuiz } from "../src/content/quiz-scoring";
import type { QuizQuestion } from "../src/api/schema";

function question(overrides: Partial<QuizQuestion> & { id: number; correct: number }): QuizQuestion {
  return {
    question: "…",
    options: ["A", "B", "C", "D"],
    explanation: "…",
    domain: null,
    ...overrides,
  };
}

describe("scoreQuiz", () => {
  it("scores 100 when every answer is correct", () => {
    const questions = [question({ id: 1, correct: 0 }), question({ id: 2, correct: 2 })];
    const result = scoreQuiz(questions, [0, 2], 70);
    expect(result.scorePercent).toBe(100);
    expect(result.correctCount).toBe(2);
    expect(result.passed).toBe(true);
  });

  it("scores 0 when every answer is wrong", () => {
    const questions = [question({ id: 1, correct: 0 }), question({ id: 2, correct: 2 })];
    const result = scoreQuiz(questions, [1, 0], 70);
    expect(result.scorePercent).toBe(0);
    expect(result.passed).toBe(false);
  });

  it("scores 50 for exactly half correct", () => {
    const questions = [
      question({ id: 1, correct: 0 }),
      question({ id: 2, correct: 1 }),
      question({ id: 3, correct: 2 }),
      question({ id: 4, correct: 3 }),
    ];
    const result = scoreQuiz(questions, [0, 1, 9, 9], 70);
    expect(result.scorePercent).toBe(50);
    expect(result.correctCount).toBe(2);
  });

  // The bug this guards against: comparing `correct` (an INDEX) against
  // option CONTENT, or an off-by-one on the index. Every option string
  // below is deliberately NOT its own index as text, one question's correct
  // answer sits at index 0, and another at the LAST index — the brief's own
  // required boundary cases ("một đề ở vị trí cuối").
  it("treats `correct` as a zero-based index, not option content — index 0 and the last index", () => {
    const questions: QuizQuestion[] = [
      question({ id: 1, correct: 0, options: ["Alpha", "Beta", "Gamma", "Delta"] }),
      question({ id: 2, correct: 3, options: ["Alpha", "Beta", "Gamma", "Delta"] }),
    ];
    // Picking the CORRECT indices scores 100…
    expect(scoreQuiz(questions, [0, 3], 70).scorePercent).toBe(100);
    // …off by one in either direction on either question scores it wrong.
    expect(scoreQuiz(questions, [1, 3], 70).correctCount).toBe(1);
    expect(scoreQuiz(questions, [0, 2], 70).correctCount).toBe(1);
  });

  it("counts an unanswered question (null) as wrong, without mistaking a correct answer of index 0 for unanswered", () => {
    const questions = [question({ id: 1, correct: 0 }), question({ id: 2, correct: 1 })];
    const result = scoreQuiz(questions, [null, null], 70);
    expect(result.correctCount).toBe(0);
    expect(result.perQuestion[0].isCorrect).toBe(false);
    // Selecting the CORRECT answer at index 0 must still count as correct —
    // guards against a `!answer` truthiness check mistaking 0 for "unanswered".
    const answered = scoreQuiz(questions, [0, null], 70);
    expect(answered.perQuestion[0].isCorrect).toBe(true);
    expect(answered.correctCount).toBe(1);
  });

  it("handles an answers array shorter than questions (not yet reached) without throwing or crashing the tally", () => {
    const questions = [question({ id: 1, correct: 0 }), question({ id: 2, correct: 1 })];
    expect(() => scoreQuiz(questions, [0], 70)).not.toThrow();
    expect(scoreQuiz(questions, [0], 70).correctCount).toBe(1);
  });

  it("passing_score boundary: a score exactly equal to passing_score is a PASS", () => {
    const questions = Array.from({ length: 10 }, (_, i) => question({ id: i, correct: 0 }));
    const answers = questions.map((_, i) => (i < 7 ? 0 : 9)); // 7/10 = 70%
    const result = scoreQuiz(questions, answers, 70);
    expect(result.scorePercent).toBe(70);
    expect(result.passed).toBe(true);
  });

  it("passing_score boundary: one point under fails", () => {
    const questions = Array.from({ length: 10 }, (_, i) => question({ id: i, correct: 0 }));
    const answers = questions.map((_, i) => (i < 6 ? 0 : 9)); // 6/10 = 60%
    const result = scoreQuiz(questions, answers, 70);
    expect(result.passed).toBe(false);
  });
});

describe("groupResultsByDomain", () => {
  it("returns [] when every question has domain: null (measured live: aws-ml-specialty)", () => {
    const questions = [question({ id: 1, correct: 0, domain: null }), question({ id: 2, correct: 1, domain: null })];
    const result = scoreQuiz(questions, [0, 1], 70);
    expect(groupResultsByDomain(questions, result.perQuestion)).toEqual([]);
  });

  it("groups per-question correctness by domain, preserving first-seen order", () => {
    const questions = [
      question({ id: 1, correct: 0, domain: "Domain B" }),
      question({ id: 2, correct: 0, domain: "Domain A" }),
      question({ id: 3, correct: 0, domain: "Domain B" }),
    ];
    const result = scoreQuiz(questions, [0, 9, 0], 70);
    expect(groupResultsByDomain(questions, result.perQuestion)).toEqual([
      { domain: "Domain B", correct: 2, total: 2 },
      { domain: "Domain A", correct: 0, total: 1 },
    ]);
  });
});

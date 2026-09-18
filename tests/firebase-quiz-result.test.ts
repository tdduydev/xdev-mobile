import { describe, expect, it } from "vitest";
import type { QuizDetail } from "../src/api/schema";
import type { QuizResult } from "../src/content/quiz-scoring";
import { toQuizResultDocument } from "../src/firebase/quiz-result";

function quiz(overrides: Partial<QuizDetail> = {}): QuizDetail {
  return {
    id: "example-quiz",
    slug: "example-quiz",
    title: "Example Quiz",
    description: "",
    icon: "award",
    provider: "AWS",
    level: "Foundational",
    duration_minutes: 30,
    passing_score: 70,
    questions_count: 2,
    tags: [],
    series_slug: null,
    url: "https://blog.xdev.asia/luyen-thi/example-quiz/",
    domains: null,
    questions: [
      { id: 1, question: "Q1", options: ["A", "B"], correct: 0, explanation: "", domain: null },
      { id: 2, question: "Q2", options: ["A", "B"], correct: 1, explanation: "", domain: null },
    ],
    ...overrides,
  };
}

function result(overrides: Partial<QuizResult> = {}): QuizResult {
  return {
    correctCount: 1,
    totalCount: 2,
    scorePercent: 50,
    passed: false,
    perQuestion: [
      { questionIndex: 0, selected: 0, isCorrect: true },
      { questionIndex: 1, selected: null, isCorrect: false },
    ],
    ...overrides,
  };
}

describe("toQuizResultDocument", () => {
  it("carries every QuizResult field through verbatim, not reshaped", () => {
    const r = result();
    const doc = toQuizResultDocument(quiz(), r, 1_700_000_000_000);
    expect(doc.correctCount).toBe(r.correctCount);
    expect(doc.totalCount).toBe(r.totalCount);
    expect(doc.scorePercent).toBe(r.scorePercent);
    expect(doc.passed).toBe(r.passed);
    expect(doc.perQuestion).toEqual(r.perQuestion);
  });

  it("adds quiz identity, a passing-score snapshot, and the finish timestamp", () => {
    const doc = toQuizResultDocument(quiz({ slug: "aws-ml-specialty", title: "AWS ML Specialty", passing_score: 75 }), result(), 42);
    expect(doc.quizSlug).toBe("aws-ml-specialty");
    expect(doc.quizTitle).toBe("AWS ML Specialty");
    expect(doc.passingScore).toBe(75);
    expect(doc.finishedAt).toBe(42);
  });

  it("snapshots passing_score at attempt time — a later quiz edit must not retroactively change it", () => {
    const docA = toQuizResultDocument(quiz({ passing_score: 70 }), result(), 1);
    const docB = toQuizResultDocument(quiz({ passing_score: 90 }), result(), 2);
    expect(docA.passingScore).toBe(70);
    expect(docB.passingScore).toBe(90);
  });
});

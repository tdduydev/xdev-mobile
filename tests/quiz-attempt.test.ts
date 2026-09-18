import { describe, expect, it } from "vitest";
import {
  createAttempt,
  formatRemaining,
  goToQuestion,
  isExpired,
  remainingSeconds,
  resumeOrCreateAttempt,
  setAnswer,
} from "../src/content/quiz-attempt";
import type { QuizAttemptState, QuizDetail } from "../src/api/schema";

function quiz(overrides: Partial<QuizDetail> = {}): QuizDetail {
  return {
    id: "example-quiz",
    slug: "example-quiz",
    title: "Example",
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

const NOW = 1_700_000_000_000;

describe("createAttempt", () => {
  it("starts with every answer null, at question 0, deadline = now + duration_minutes", () => {
    const attempt = createAttempt(quiz(), NOW);
    expect(attempt.answers).toEqual([null, null]);
    expect(attempt.currentIndex).toBe(0);
    expect(attempt.deadlineMs).toBe(NOW + 30 * 60_000);
    expect(attempt.slug).toBe("example-quiz");
  });
});

describe("resumeOrCreateAttempt", () => {
  it("resumes a saved attempt for the same slug and question count", () => {
    const saved: QuizAttemptState = { slug: "example-quiz", answers: [0, null], currentIndex: 1, deadlineMs: NOW + 1000 };
    expect(resumeOrCreateAttempt(quiz(), saved, NOW)).toBe(saved);
  });

  it("discards a saved attempt for a different slug", () => {
    const saved: QuizAttemptState = { slug: "other-quiz", answers: [0, null], currentIndex: 1, deadlineMs: NOW + 1000 };
    const attempt = resumeOrCreateAttempt(quiz(), saved, NOW);
    expect(attempt).not.toBe(saved);
    expect(attempt.answers).toEqual([null, null]);
  });

  // Quizzes have no version field to detect a server-side content change —
  // a question-count mismatch is the only signal available. Trusting a
  // stale `answers` array against a NEW `questions` array could silently
  // misattribute an old answer to a different question, so this must
  // discard rather than resume.
  it("discards a saved attempt whose question count no longer matches the fetched quiz", () => {
    const saved: QuizAttemptState = { slug: "example-quiz", answers: [0], currentIndex: 0, deadlineMs: NOW + 1000 };
    const attempt = resumeOrCreateAttempt(quiz(), saved, NOW);
    expect(attempt.answers).toEqual([null, null]);
  });

  it("creates fresh when nothing was saved", () => {
    const attempt = resumeOrCreateAttempt(quiz(), null, NOW);
    expect(attempt.answers).toEqual([null, null]);
  });

  // Locks in the behavior the quiz screen's resume-after-expiry auto-submit
  // depends on: an attempt whose deadline already passed while the app was
  // closed is still RESUMED (not silently replaced with a fresh one) —
  // the screen derives `isExpired` from the resumed `deadlineMs` on its own
  // and renders the result screen for it. Creating a fresh attempt here
  // instead would reset the deadline to a NEW `now + duration`, silently
  // granting extra time nobody asked for.
  it("resumes a saved attempt even when its deadline has already passed", () => {
    const saved: QuizAttemptState = { slug: "example-quiz", answers: [0, null], currentIndex: 1, deadlineMs: NOW - 1000 };
    const attempt = resumeOrCreateAttempt(quiz(), saved, NOW);
    expect(attempt).toBe(saved);
    expect(isExpired(attempt, NOW)).toBe(true);
  });
});

describe("isExpired / remainingSeconds", () => {
  const attempt = createAttempt(quiz({ duration_minutes: 1 }), NOW);

  it("is not expired before the deadline", () => {
    expect(isExpired(attempt, NOW)).toBe(false);
    expect(remainingSeconds(attempt, NOW)).toBe(60);
  });

  it("is expired exactly at the deadline (>=, not >)", () => {
    expect(isExpired(attempt, NOW + 60_000)).toBe(true);
    expect(remainingSeconds(attempt, NOW + 60_000)).toBe(0);
  });

  it("never reports negative remaining time long after the deadline (e.g. app reopened after time was already up)", () => {
    expect(remainingSeconds(attempt, NOW + 5 * 60_000)).toBe(0);
    expect(isExpired(attempt, NOW + 5 * 60_000)).toBe(true);
  });
});

describe("setAnswer", () => {
  it("records the selected option index at the given question, leaving others untouched", () => {
    const attempt = createAttempt(quiz(), NOW);
    const next = setAnswer(attempt, 0, 0); // correct answer, index 0 — must not read as "unanswered"
    expect(next.answers).toEqual([0, null]);
    expect(attempt.answers).toEqual([null, null]); // original untouched (pure function)
  });

  it("overwrites a previous answer for the same question", () => {
    const attempt = createAttempt(quiz(), NOW);
    const first = setAnswer(attempt, 1, 0);
    const second = setAnswer(first, 1, 1);
    expect(second.answers).toEqual([null, 1]);
  });
});

describe("formatRemaining", () => {
  it("formats under an hour as M:SS", () => {
    expect(formatRemaining(29 * 60 + 5)).toBe("29:05");
    expect(formatRemaining(5)).toBe("0:05");
  });

  // aws-ml-specialty's duration_minutes is 180 (3 hours) — a countdown
  // formatted as bare minutes:seconds would show "180:00", technically
  // correct but not how anyone reads a 3-hour exam clock. Every quiz whose
  // duration is under an hour must NOT get this treatment (see the M:SS
  // case above) — only durations that actually reach an hour do.
  it("formats an hour or more as H:MM:SS, for durations up to aws-ml-specialty's 180 minutes", () => {
    expect(formatRemaining(60 * 60)).toBe("1:00:00");
    expect(formatRemaining(3 * 60 * 60 - 1)).toBe("2:59:59");
    expect(formatRemaining(3 * 60 * 60)).toBe("3:00:00");
  });

  it("never renders negative time", () => {
    expect(formatRemaining(0)).toBe("0:00");
  });
});

describe("goToQuestion", () => {
  it("clamps to [0, totalQuestions - 1]", () => {
    const attempt = createAttempt(quiz(), NOW);
    expect(goToQuestion(attempt, -1, 2).currentIndex).toBe(0);
    expect(goToQuestion(attempt, 5, 2).currentIndex).toBe(1);
    expect(goToQuestion(attempt, 1, 2).currentIndex).toBe(1);
  });
});

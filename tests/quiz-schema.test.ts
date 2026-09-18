import { describe, expect, it } from "vitest";
import { QuizDetailSchema, QuizListSchema } from "../src/api/schema";

// Measured live against the local pre-deploy build, 2026-09-18
// (http://localhost:8787/api/v1 — production blog.xdev.asia/api/v1 still
// 404s for quizzes at the time this was written; see task-12-report.md).
// Trimmed to what's needed to exercise the schema's branches, not the full
// 7-quiz / 165-question payload.
const QUIZ_LIST_SAMPLE = [
  {
    id: "aws-ai-practitioner",
    slug: "aws-ai-practitioner",
    title: "AWS Certified AI Practitioner (AIF-C01)",
    description: "Practice exam for AWS Certified AI Practitioner — 20 questions covering all 5 domains",
    icon: "award",
    provider: "AWS",
    level: "Foundational",
    duration_minutes: 30,
    passing_score: 70,
    questions_count: 20,
    tags: ["AWS", "AI", "Cloud", "Bedrock", "GenAI"],
    series_slug: "luyen-thi-aws-ai-practitioner",
    url: "https://blog.xdev.asia/luyen-thi/aws-ai-practitioner/",
  },
  {
    id: "nvidia-dli-generative-ai",
    slug: "nvidia-dli-generative-ai",
    title: "NVIDIA DLI Generative AI",
    description: "…",
    icon: "gpu",
    provider: "NVIDIA",
    level: "Intermediate",
    duration_minutes: 40,
    passing_score: 70,
    questions_count: 20,
    tags: ["NVIDIA", "GenAI"],
    series_slug: "luyen-thi-nvidia-dli-generative-ai",
    url: "https://blog.xdev.asia/luyen-thi/nvidia-dli-generative-ai/",
  },
];

// aws-ml-specialty, trimmed to 1 question — `domains: null` measured for
// real (see task-12-report.md), not synthesized.
const QUIZ_DETAIL_NULL_DOMAINS_SAMPLE = {
  id: "aws-ml-specialty",
  slug: "aws-ml-specialty",
  title: "AWS Certified Machine Learning - Specialty",
  description: "Luyện thi chứng chỉ AWS ML Specialty — build, train, deploy ML trên AWS",
  icon: "award",
  provider: "AWS",
  level: "Chuyên gia",
  duration_minutes: 180,
  passing_score: 75,
  questions_count: 15,
  tags: ["AWS", "ML", "SageMaker"],
  series_slug: "luyen-thi-aws-ml-specialty",
  url: "https://blog.xdev.asia/luyen-thi/aws-ml-specialty/",
  domains: null,
  questions: [
    {
      id: 1,
      question: "SageMaker built-in algorithm nào phù hợp nhất cho bài toán phát hiện bất thường (anomaly detection)?",
      options: ["XGBoost", "Random Cut Forest", "BlazingText", "DeepAR"],
      correct: 1,
      explanation:
        "Random Cut Forest (RCF) là thuật toán unsupervised trong SageMaker, chuyên detect anomaly trong dữ liệu streaming hoặc time series.",
      domain: null,
    },
  ],
};

// gcp-ml-engineer, trimmed to 1 domain / 1 question — `domains` as a real
// non-null array, and a `correct` index other than 0.
const QUIZ_DETAIL_WITH_DOMAINS_SAMPLE = {
  id: "gcp-ml-engineer",
  slug: "gcp-ml-engineer",
  title: "Google Cloud ML Engineer",
  description: "…",
  icon: "award",
  provider: "GCP",
  level: "Professional",
  duration_minutes: 120,
  passing_score: 70,
  questions_count: 50,
  tags: ["GCP", "ML"],
  series_slug: "luyen-thi-gcp-ml-engineer",
  url: "https://blog.xdev.asia/luyen-thi/gcp-ml-engineer/",
  domains: [
    {
      name: "Domain 1: ML Problem Framing & Architecture",
      weight: 20,
      lessons: [{ title: "Bài 1: Framing ML Problems", slug: "bai-1-framing-ml-problems" }],
    },
  ],
  questions: [
    {
      id: 1,
      question: "…",
      options: ["A", "B", "C", "D"],
      correct: 3,
      explanation: "…",
      domain: "Domain 1: ML Problem Framing & Architecture",
    },
  ],
};

describe("QuizListSchema", () => {
  it("parses the measured quizzes.json list shape", () => {
    expect(() => QuizListSchema.parse(QUIZ_LIST_SAMPLE)).not.toThrow();
  });
});

describe("QuizDetailSchema", () => {
  it("parses a real domains: null quiz (aws-ml-specialty) without throwing", () => {
    const parsed = QuizDetailSchema.parse(QUIZ_DETAIL_NULL_DOMAINS_SAMPLE);
    expect(parsed.domains).toBeNull();
    expect(parsed.questions[0].domain).toBeNull();
  });

  it("parses a quiz with a real domains array and a non-zero correct index", () => {
    const parsed = QuizDetailSchema.parse(QUIZ_DETAIL_WITH_DOMAINS_SAMPLE);
    expect(parsed.domains).toHaveLength(1);
    expect(parsed.questions[0].correct).toBe(3);
  });

  it("rejects a question whose correct is not a number (guards index-vs-content confusion upstream of scoring)", () => {
    const bad = {
      ...QUIZ_DETAIL_NULL_DOMAINS_SAMPLE,
      questions: [{ ...QUIZ_DETAIL_NULL_DOMAINS_SAMPLE.questions[0], correct: "Random Cut Forest" }],
    };
    expect(() => QuizDetailSchema.parse(bad)).toThrow();
  });
});

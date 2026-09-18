import { describe, expect, it } from "vitest";

import {
  ARTICLE_CONTEXT_MAX_CHARS,
  buildChatPrompt,
  classifyGeminiError,
  formatConversationHistory,
  truncateArticleContext,
  type ChatMessage,
} from "../src/content/chat";

describe("truncateArticleContext", () => {
  it("keeps a short article's markdown fully intact", () => {
    const short = "# Hello\n\nThis is a short lesson body.";
    expect(truncateArticleContext(short)).toBe(short);
  });

  it("passes an article exactly at the threshold through unchanged", () => {
    const exact = "x".repeat(ARTICLE_CONTEXT_MAX_CHARS);
    expect(truncateArticleContext(exact)).toBe(exact);
  });

  it("cuts a long article at the chosen threshold and marks it as truncated", () => {
    const long = "y".repeat(ARTICLE_CONTEXT_MAX_CHARS + 5000);
    const result = truncateArticleContext(long);

    expect(result.startsWith("y".repeat(ARTICLE_CONTEXT_MAX_CHARS))).toBe(true);
    expect(result.length).toBeGreaterThan(ARTICLE_CONTEXT_MAX_CHARS);
    expect(result).toContain("cắt bớt");
  });

  it("honors a custom threshold (not hardcoded to the default)", () => {
    const text = "z".repeat(100);
    const result = truncateArticleContext(text, 10);
    expect(result.startsWith("z".repeat(10))).toBe(true);
    expect(result).toContain("cắt bớt");
  });
});

describe("formatConversationHistory", () => {
  it("returns an empty string for no history, so callers can `history ? ... : \"\"`", () => {
    expect(formatConversationHistory([])).toBe("");
  });

  it("formats user/ai turns with Vietnamese role labels", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "Bài này nói về gì?" },
      { role: "ai", content: "Bài nói về React Native." },
    ];
    expect(formatConversationHistory(messages)).toBe("Người dùng: Bài này nói về gì?\nAI: Bài nói về React Native.");
  });

  it("keeps only the last N turns (default 6)", () => {
    const messages: ChatMessage[] = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "ai",
      content: `msg-${i}`,
    }));

    const formatted = formatConversationHistory(messages);
    const lines = formatted.split("\n");

    expect(lines).toHaveLength(6);
    expect(lines[0]).toContain("msg-4");
    expect(lines[5]).toContain("msg-9");
  });
});

describe("buildChatPrompt", () => {
  it("includes the article title, context, question, and Vietnamese-plain-text instruction", () => {
    const prompt = buildChatPrompt({
      title: "Học TypeScript từ đầu",
      articleContext: "Nội dung bài viết ở đây.",
      conversationHistory: "",
      question: "Generic là gì?",
    });

    expect(prompt).toContain("Học TypeScript từ đầu");
    expect(prompt).toContain("Nội dung bài viết ở đây.");
    expect(prompt).toContain("Generic là gì?");
    expect(prompt).toContain("không dùng markdown");
    expect(prompt).not.toContain("Lịch sử hội thoại");
  });

  it("includes the conversation history section only when history is non-empty", () => {
    const prompt = buildChatPrompt({
      title: "Bài test",
      articleContext: "ctx",
      conversationHistory: "Người dùng: hi\nAI: hello",
      question: "tiếp theo?",
    });

    expect(prompt).toContain("Lịch sử hội thoại:");
    expect(prompt).toContain("Người dùng: hi\nAI: hello");
  });
});

describe("classifyGeminiError", () => {
  it("recognizes RN's offline TypeError message even wrapped in a generic AIError", () => {
    const wrapped = Object.assign(new Error("ai: Error fetching from https://x: Network request failed (ai/error)"), {
      code: "error",
    });
    expect(classifyGeminiError(wrapped)).toMatch(/Mất kết nối mạng/);
  });

  it("recognizes the RN fetch timeout message", () => {
    const err = new TypeError("Network request timed out");
    expect(classifyGeminiError(err)).toMatch(/Mất kết nối mạng/);
  });

  it("maps a fetch-error (non-2xx from the API) to a server/API message", () => {
    const err = Object.assign(new Error("ai: Error fetching from https://x: [500 Internal Server Error] boom (ai/fetch-error)"), {
      code: "fetch-error",
    });
    expect(classifyGeminiError(err)).toMatch(/máy chủ AI/);
  });

  it("maps a 429 fetch-error to a quota-specific message", () => {
    const err = Object.assign(new Error("ai: Error fetching from https://x: [429 Too Many Requests] quota exceeded (ai/fetch-error)"), {
      code: "fetch-error",
    });
    expect(classifyGeminiError(err)).toMatch(/vượt giới hạn/);
  });

  it("maps a 403 fetch-error (quota/permission — the exact risk of shipping without App Check) to the same quota message", () => {
    const err = Object.assign(new Error("ai: Error fetching from https://x: [403 Forbidden] permission denied (ai/fetch-error)"), {
      code: "fetch-error",
    });
    expect(classifyGeminiError(err)).toMatch(/vượt giới hạn/);
  });

  it("does not mis-fire the quota message on an unrelated status code containing similar digits", () => {
    const err = Object.assign(new Error("ai: Error fetching from https://x: [423 Locked] nope (ai/fetch-error)"), {
      code: "fetch-error",
    });
    expect(classifyGeminiError(err)).toMatch(/máy chủ AI/);
  });

  it("maps a response-error (safety block) to its own message", () => {
    const err = Object.assign(new Error("ai: Response error: blocked (ai/response-error)"), { code: "response-error" });
    expect(classifyGeminiError(err)).toMatch(/bộ lọc nội dung/);
  });

  it("falls back to a generic readable message for anything else, including non-Error throws", () => {
    expect(classifyGeminiError(new Error("something odd"))).toBe("Có lỗi xảy ra khi hỏi AI. Vui lòng thử lại.");
    expect(classifyGeminiError("a string throw")).toBe("Có lỗi xảy ra khi hỏi AI. Vui lòng thử lại.");
    expect(classifyGeminiError(null)).toBe("Có lỗi xảy ra khi hỏi AI. Vui lòng thử lại.");
    expect(classifyGeminiError(undefined)).toBe("Có lỗi xảy ra khi hỏi AI. Vui lòng thử lại.");
  });
});

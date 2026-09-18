import { beforeEach, describe, expect, it, vi } from "vitest";

// Locks two things the task-14a brief calls out explicitly:
// 1. It must reuse Task 13's `getFirebaseApp()` singleton, never call
//    `initializeApp` a second time.
// 2. It must match the web app's Gemini config exactly (GoogleAIBackend,
//    "gemini-2.5-flash") — same style as tests/firebase-app.test.ts:
//    everything firebase-related is mocked, this asserts on wiring only.

const FAKE_APP = { __kind: "fake-app" };
vi.mock("../src/firebase/app", () => ({
  getFirebaseApp: vi.fn(() => FAKE_APP),
}));

const FAKE_AI_SERVICE = { __kind: "fake-ai-service" };
const FAKE_MODEL = { __kind: "fake-generative-model" };
const FAKE_BACKEND = { __kind: "fake-google-ai-backend" };

const GoogleAIBackendCtor = vi.fn(function GoogleAIBackend(this: object) {
  Object.assign(this, FAKE_BACKEND);
});

vi.mock("firebase/ai", () => ({
  getAI: vi.fn(() => FAKE_AI_SERVICE),
  getGenerativeModel: vi.fn(() => FAKE_MODEL),
  GoogleAIBackend: GoogleAIBackendCtor,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("getGeminiModel", () => {
  it("builds the model from the existing Firebase app, never a second one", async () => {
    const { getFirebaseApp } = await import("../src/firebase/app");
    const { getAI } = await import("firebase/ai");
    const { getGeminiModel } = await import("../src/firebase/ai");

    getGeminiModel();

    expect(getFirebaseApp).toHaveBeenCalledTimes(1);
    expect(getAI).toHaveBeenCalledWith(FAKE_APP, { backend: FAKE_BACKEND });
  });

  it("uses GoogleAIBackend and gemini-2.5-flash, matching the web app's config", async () => {
    const { GoogleAIBackend, getGenerativeModel } = await import("firebase/ai");
    const { getGeminiModel } = await import("../src/firebase/ai");

    getGeminiModel();

    expect(GoogleAIBackend).toHaveBeenCalledTimes(1);
    expect(getGenerativeModel).toHaveBeenCalledWith(FAKE_AI_SERVICE, { model: "gemini-2.5-flash" });
  });

  it("only builds the model once across repeated calls (lazy singleton)", async () => {
    const { getGenerativeModel } = await import("firebase/ai");
    const { getGeminiModel } = await import("../src/firebase/ai");

    const first = getGeminiModel();
    const second = getGeminiModel();

    expect(first).toBe(second);
    expect(getGenerativeModel).toHaveBeenCalledTimes(1);
  });
});

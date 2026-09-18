// `@types/node` is present in node_modules (a transitive dep of vitest)
// but isn't a direct devDependency, and this project's tsconfig apparently
// doesn't auto-pick it up for `tsc --noEmit` (measured: without this
// line, `node:fs` fails as TS2591 "Cannot find name" even though the
// ambient module declaration is right there in
// node_modules/@types/node/fs.d.ts). This is the only test file in the
// repo that needs a Node API, so scoping the fix to this one file's
// triple-slash directive — rather than a project-wide tsconfig or
// package.json change — keeps every other file's type-checking untouched.
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Task-14a brief, explicitly and repeatedly: "Chạy được khi chưa đăng nhập.
// Đừng chặn sau login" — the one behavior this task deliberately diverges
// from web's AIChatWidget.tsx for (web calls `openLoginModal()` instead of
// sending when signed out; this app must not).
//
// There's no runtime way to unit-test "the UI doesn't gate on auth" without
// a component renderer (this repo has none — see tests/chat.test.ts's
// header comment on why chat logic lives in pure content/chat.ts instead).
// So this locks it the same way tests/firebase-app.test.ts locks wiring:
// read the actual source and assert the auth dependency was never wired
// in, the same style as grepping for a regression. A future change that
// adds `useAuth()` and an `if (!user) return`/`openLoginModal()` guard to
// gate sending would flip this red instead of silently reintroducing the
// web's login gate.
//
// Reading with `fs`, not `vi.mock`-and-import: importing
// ArticleChatModal.tsx pulls in react-native/react-native-safe-area-context,
// which this deterministic, offline suite has no reason to need working
// mocks for.

const CHAT_MODAL_SOURCE = readFileSync(new URL("../src/components/ArticleChatModal.tsx", import.meta.url), "utf8");
const CHAT_LOGIC_SOURCE = readFileSync(new URL("../src/content/chat.ts", import.meta.url), "utf8");
const GEMINI_MODEL_SOURCE = readFileSync(new URL("../src/firebase/ai.ts", import.meta.url), "utf8");

/**
 * Matches only an actual `import ... from "<module>"` statement whose
 * source is (or ends with) one of the auth modules — never a bare mention
 * of `useAuth` in prose. `ArticleChatModal.tsx`'s own doc comment
 * legitimately says "this component never looks at `useAuth()` at all" to
 * explain the design decision, which a plain `/useAuth/` regex would
 * (and, first draft of this test, did) misfire on.
 */
function importsFromAuthModule(source: string): boolean {
  return /from\s+['"](@\/state\/auth|firebase\/auth)['"]/.test(source);
}

describe("importsFromAuthModule (the detector this file's own tests rely on)", () => {
  it("detects a genuine auth import, so a real regression here would actually go red", () => {
    expect(importsFromAuthModule(`import { useAuth } from '@/state/auth';`)).toBe(true);
    expect(importsFromAuthModule(`import { getAuth } from "firebase/auth";`)).toBe(true);
  });

  it("ignores a doc comment that merely mentions useAuth", () => {
    expect(importsFromAuthModule('// this component never looks at `useAuth()` at all')).toBe(false);
  });
});

describe("ArticleChatModal has no sign-in gate", () => {
  it("never imports the auth context/hook or firebase/auth", () => {
    expect(importsFromAuthModule(CHAT_MODAL_SOURCE)).toBe(false);
  });
});

describe("the chat's pure logic and Gemini model wiring stay auth-free too", () => {
  it("content/chat.ts has no auth dependency", () => {
    expect(importsFromAuthModule(CHAT_LOGIC_SOURCE)).toBe(false);
  });

  it("firebase/ai.ts has no auth dependency (Gemini here is unauthenticated end-to-end, same as the web app today)", () => {
    expect(importsFromAuthModule(GEMINI_MODEL_SOURCE)).toBe(false);
  });
});

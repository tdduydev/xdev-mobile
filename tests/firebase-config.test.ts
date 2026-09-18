import { afterEach, describe, expect, it, vi } from "vitest";

// Guards the exact contract the Settings screen's Google button depends on
// (src/app/(tabs)/settings.tsx: `isGoogleConfigured ? <button> : <message>`)
// and that src/state/auth.tsx's crash fix relies on staying false when
// unset: `hasGoogleAuthConfig()` must read `false` when none of the
// `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID` vars are set, matching what Expo's own
// env-var inlining produces for a genuinely-missing var (`process.env.X` is
// `undefined`, never the literal string `"undefined"` — see
// babel-preset-expo's `inline-env-vars.js`, which for a dev build rewrites
// the access to a virtual `env` module reflecting real `process.env`, and
// for a production build inlines `t.valueToNode(process.env[key])`, which
// for a missing key is the AST for `undefined` itself).
const GOOGLE_CLIENT_ID_KEYS = [
  "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID",
  "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID",
  "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID",
] as const;

function clearGoogleClientIdEnv() {
  for (const key of GOOGLE_CLIENT_ID_KEYS) delete process.env[key];
}

afterEach(() => {
  clearGoogleClientIdEnv();
  vi.resetModules();
});

describe("hasGoogleAuthConfig", () => {
  it("is false when no EXPO_PUBLIC_GOOGLE_*_CLIENT_ID env var is set (this repo's actual default — no .env exists)", async () => {
    clearGoogleClientIdEnv();
    vi.resetModules();
    const { hasGoogleAuthConfig, googleAuthConfig } = await import("../src/firebase/config");
    expect(googleAuthConfig).toEqual({ iosClientId: undefined, androidClientId: undefined, webClientId: undefined });
    expect(hasGoogleAuthConfig()).toBe(false);
  });

  it("is true once at least one platform's client id is set", async () => {
    clearGoogleClientIdEnv();
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = "123-abc.apps.googleusercontent.com";
    vi.resetModules();
    const { hasGoogleAuthConfig } = await import("../src/firebase/config");
    expect(hasGoogleAuthConfig()).toBe(true);
  });
});

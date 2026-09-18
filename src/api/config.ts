/**
 * The Content API base URL — the ONLY place this value is allowed to live.
 * Every other module imports `API_BASE` from here rather than hardcoding it.
 *
 * `EXPO_PUBLIC_*` env vars are inlined at build time by Expo; under plain
 * Node (tests, tooling) `process.env.EXPO_PUBLIC_API_BASE` just reads the
 * real process environment, so the fallback below is what tests exercise
 * unless the variable is explicitly set.
 */
export const API_BASE: string =
  process.env.EXPO_PUBLIC_API_BASE ?? "https://blog.xdev.asia/api/v1";

/**
 * The origin that serves root-relative asset paths (`featuredImage`, `avatar`
 * — see schema.ts's `urlLike`), e.g. `https://blog.xdev.asia`.
 *
 * This is deliberately NOT `API_BASE`: `API_BASE` is the API root
 * (`{origin}/api/v1`), while assets live at the SITE root. Derived from
 * `API_BASE` with `new URL(...)` rather than hardcoded separately, so there
 * is still exactly one place the origin is configured.
 */
export const SITE_BASE: string = new URL(API_BASE).origin;

/**
 * Resolves a nullable asset path (`featuredImage`, `avatar`) to a fetchable
 * URL. Per schema.ts, a present value is always root-relative (`/images/…`)
 * or already an absolute URL — never bare — so no other shape needs handling.
 */
export function resolveAssetUrl(path: string | null): string | null {
  if (path === null) return null;
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE_BASE}${path}`;
}

/** Locales published by the Content API (measured against `manifest.json`, 2026-09-18). */
export const LOCALES = ["vi", "en", "ja", "zh-tw"] as const;

export type Locale = (typeof LOCALES)[number];

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

/** Locales published by the Content API (measured against `manifest.json`, 2026-09-18). */
export const LOCALES = ["vi", "en", "ja", "zh-tw"] as const;

export type Locale = (typeof LOCALES)[number];

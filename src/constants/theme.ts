/**
 * Design tokens for the app.
 *
 * These are NOT invented here. They are read off blog.xdev.asia — the same
 * product, seen on a different device — so the app and the web read as one
 * brand rather than two. Sources, all in the blog repo:
 *
 *   src/app/layout.tsx   Inter via next/font; body is zinc-800 on white,
 *                        zinc-200 on zinc-950
 *   src/app/globals.css  --color-brand-* (a blue scale, 600 = #2563eb is the
 *                        primary), --color-surface-* (slate), `.post-card`
 *                        (white, 1px #e2e8f0, radius 1rem), `.btn-primary`
 *                        (#3b82f6 → #2563eb, radius 0.75rem)
 *
 * What was here before this file was rewritten: the Expo template's defaults,
 * untouched — its boilerplate comment about Nativewind/Tamagui was still at
 * the top, text was pure #000 on pure #fff, and there was no brand colour at
 * all. That is why every screen read as "a React Native app" rather than as
 * xDev. The fix is tokens, not per-screen patches.
 *
 * Two places this deliberately does NOT copy the web:
 *
 * 1. No gradients on buttons and no hover shadows. Both are web affordances —
 *    there is no hover on a phone, and large soft shadows on Android cost a
 *    real frame budget and tend to read as muddy grey. Borders carry the same
 *    separation on mobile and stay crisp on both platforms.
 * 2. Type sizes are mobile sizes, not scaled-down desktop ones. See `Type`.
 */

import '@/global.css';

import { Platform } from 'react-native';

/**
 * The blog's brand scale. Named by role, not by number, so call sites say
 * what they mean — `Brand.primary`, not `brand600`. The raw Tailwind steps
 * they came from are in the comments so the two repos can be diffed.
 */
export const Brand = {
  /** brand-50 — tinted background for secondary buttons and selected rows */
  soft: '#eff6ff',
  /** brand-100 */
  softStrong: '#dbeafe',
  /** brand-200 — border on tinted surfaces */
  border: '#bfdbfe',
  /** brand-500 — the lighter half of the web's button gradient */
  light: '#3b82f6',
  /** brand-600 — THE primary. Every call to action is this colour. */
  primary: '#2563eb',
  /** brand-700 — pressed state */
  pressed: '#1d4ed8',
  /** brand-950 — brand surface in dark mode */
  darkSurface: '#172554',
} as const;

export const Colors = {
  light: {
    // zinc-800, matching the blog's body colour. Pure #000 (the template's
    // default) is harsher than any real reading surface and makes 15px body
    // text look heavier than it is.
    text: '#27272a',
    background: '#ffffff',
    // surface-50 / surface-100 from the blog's scale.
    backgroundElement: '#f8fafc',
    backgroundSelected: '#f1f5f9',
    // slate-500 — the blog's own muted text (`.btn-ghost`).
    textSecondary: '#64748b',

    // — added in the token rewrite; nothing above this line changed name —
    /** surface-200. The single most useful new token: cards and rows are
     *  separated by a hairline, not by a shadow. */
    border: '#e2e8f0',
    /** A border that should recede further than `border` (inside a card). */
    borderSubtle: '#f1f5f9',
    brand: Brand.primary,
    brandSoft: Brand.soft,
    brandBorder: Brand.border,
    /** Pass / correct. */
    success: '#15803d',
    successSoft: '#f0fdf4',
    /** Fail / wrong / destructive. */
    danger: '#b91c1c',
    dangerSoft: '#fef2f2',
    /** Warning, e.g. a stale-cache banner. */
    warning: '#b45309',
    warningSoft: '#fffbeb',
  },
  dark: {
    // zinc-200 on zinc-950 — the blog's own dark pair.
    text: '#e4e4e7',
    background: '#09090b',
    backgroundElement: '#18181b',
    backgroundSelected: '#27272a',
    textSecondary: '#a1a1aa',

    border: '#27272a',
    borderSubtle: '#18181b',
    // Lighter than the light-mode primary on purpose: #2563eb on a near-black
    // background falls below a comfortable contrast ratio for text, while
    // brand-400 sits well above it.
    brand: '#60a5fa',
    brandSoft: '#172554',
    brandBorder: '#1e3a8a',
    success: '#4ade80',
    successSoft: '#052e16',
    danger: '#f87171',
    dangerSoft: '#450a0a',
    warning: '#fbbf24',
    warningSoft: '#451a03',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * The type scale.
 *
 * What it replaces: 48 (title) → 32 (subtitle) → 16 (default) → 14 (small),
 * with body text set at weight 500. Two things were wrong with that. There was
 * no step between 32 and 16, so a card's title and its excerpt had to be the
 * same size and were told apart only by colour; and body at weight 500 made
 * every screen uniformly semi-bold, which leaves nothing for emphasis to do.
 *
 * Sizes are chosen for a phone held at arm's length, not scaled down from the
 * web. 15px body with 22px leading is the iOS reading default for a reason.
 * Line heights are absolute, not multipliers: React Native's `lineHeight` is
 * in points, and a multiplier here would silently shift when a user raises
 * their system text size.
 */
export const Type = {
  /** Screen titles. Was 48 — which ate a third of the viewport before any
   *  content appeared. */
  display: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  /** A single big moment on a screen: a quiz score, an empty state. */
  headline: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  /** Card and list-row titles. This is the tier that did not exist. */
  title: { fontSize: 17, lineHeight: 23, fontWeight: '600' },
  /** Body text, excerpts, answers. Weight 400, not 500. */
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  /** Body weight for something that must stand out inline. */
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  /** Metadata: category, date, reading time, question counters. */
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  /** Badges and eyebrows. Small enough that it needs the extra weight and
   *  tracking to stay legible. */
  label: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.4 },
} as const;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

/**
 * Kept with the template's original names (`three` is 16, not 12) because 18
 * files already import them and renaming is a separate change from restyling.
 * New code should prefer the semantic aliases below.
 */
export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** Radii, from the blog: `.post-card` is 1rem, `.btn-primary` is 0.75rem. */
export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

/**
 * The minimum side of anything a finger is meant to hit. Apple's Human
 * Interface Guidelines say 44pt; Android's Material says 48dp. 44 is the
 * floor, and several controls in this app were below it before the restyle
 * (quiz answer rows relied on text height alone).
 */
export const TouchTarget = 44;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

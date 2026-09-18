// The startup splash animation is handled natively by the OS splash screen
// on web (no native splash-hide transition to animate over), so there is
// nothing to render here — kept only so `_layout.tsx`'s
// `@/components/animated-icon` import resolves to a web-appropriate no-op
// via React Native's platform file resolution.
export function AnimatedSplashOverlay() {
  return null;
}

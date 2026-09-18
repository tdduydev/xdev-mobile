/**
 * Firebase project config — same `xdev-asia` project the web app
 * (blog.xdev.asia) uses, values copied from
 * `blog.xdev.asia/src/lib/firebase.ts`. `apiKey` here is the Firebase Web
 * API key, which identifies the project to Google's servers — it is not a
 * secret (Firebase's own docs: access is governed by Firestore/Auth
 * security rules, not by hiding this value), so shipping it in this public
 * repo is fine, same as the web app already does.
 *
 * Deliberately narrower than the web's `firebaseConfig`: no
 * `measurementId` (no `firebase/analytics` used here — that's a
 * browser-only product), and none of the web-only SDKs the web file also
 * initializes (`firebase/ai`, `firebase/performance`).
 */
export const firebaseConfig = {
  apiKey: "AIzaSyCXPcFu9GTx_8RR4ece2d2rGB1m5Q3ou00",
  authDomain: "xdev-asia.firebaseapp.com",
  projectId: "xdev-asia",
  storageBucket: "xdev-asia.firebasestorage.app",
  messagingSenderId: "638081415326",
  appId: "1:638081415326:web:2ac782326803e3f8fce38f",
};

/**
 * Google OAuth client IDs for `expo-auth-session`'s
 * `useIdTokenAuthRequest` (see src/state/auth.tsx) — NOT the same value as
 * `firebaseConfig.apiKey` above. These identify THIS app to Google's OAuth
 * server per platform and are created in Google Cloud Console under the
 * `xdev-asia` Firebase project (APIs & Services → Credentials → an "iOS"
 * and/or "Android" OAuth client, plus optionally a "Web application" one
 * for Expo Go, which runs as a web-ish redirect via `exp://`). Like
 * `apiKey`, an installed-app OAuth client ID is a public identifier, not a
 * secret — Google never issues a client SECRET for the iOS/Android client
 * types, only for "Web application" and confidential clients (see
 * task-13-report.md's measurement of the analogous GitHub question).
 *
 * Read from `EXPO_PUBLIC_*` env vars (inlined into the JS bundle at build
 * time by Expo CLI — see
 * https://docs.expo.dev/guides/environment-variables/) rather than
 * hardcoded, because none of these have been created yet for this app —
 * this repo ships no `.env` file (see `.env.example` alongside this file).
 * Left `undefined` when unset; `state/auth.tsx` disables the Google
 * sign-in button rather than crashing when every one of these is missing.
 */
export const googleAuthConfig = {
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined,
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || undefined,
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined,
};

export function hasGoogleAuthConfig(): boolean {
  return Boolean(googleAuthConfig.iosClientId || googleAuthConfig.androidClientId || googleAuthConfig.webClientId);
}

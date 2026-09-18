import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
// `getReactNativePersistence` genuinely exists at runtime (Metro resolves
// `firebase/auth`'s `react-native` package.json export condition for
// ios/android — see @expo/metro-config's default resolver config) but is
// missing from the `.d.ts` file `moduleResolution: bundler` would pick by
// default, because `@firebase/auth`'s own `exports` map lists a bare
// `"types"` condition BEFORE `"react-native"`, so tsc's condition-matching
// finds the browser-oriented public types first and never reaches the
// `react-native`-specific ones. Fixed via `tsconfig.json`'s `paths` mapping
// (`"firebase/auth"` → `@firebase/auth/dist/rn/index.rn.d.ts`, which IS
// what Metro loads at runtime) rather than `@ts-expect-error` on this
// import, so this stays fully type-checked. See
// firebase/firebase-js-sdk#9316 for the upstream issue and
// task-13-report.md for how this was measured against the actual installed
// package.
import { getReactNativePersistence, initializeAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { firebaseConfig } from "./config";

/**
 * Defers construction until first use, same rationale and shape as
 * cache.ts's `lazy()` for `Directory`/`File`: nothing here should run at
 * module-import time (module-scope `initializeApp`/`initializeAuth` calls
 * would run the instant this module is imported — transitively from the
 * root layout — before any provider has decided whether/how to use them,
 * and would run unconditionally in every unit test that happens to import
 * anything that imports this module).
 */
function lazy<T>(create: () => T): () => T {
  let instance: T | undefined;
  return () => {
    if (instance === undefined) instance = create();
    return instance;
  };
}

/** The single `FirebaseApp` instance for the `xdev-asia` project — same project the web app (blog.xdev.asia) uses. `getApps()` guard avoids a duplicate-app error on Fast Refresh. */
export const getFirebaseApp = lazy((): FirebaseApp => {
  const existing = getApps();
  return existing.length > 0 ? existing[0] : initializeApp(firebaseConfig);
});

/**
 * `initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) })`
 * — task-13 brief's explicit requirement. Plain `getAuth()` would warn and
 * NOT persist the session across an app relaunch (measured in the brief
 * against `@firebase/auth`'s own RN entrypoint — see app.ts's import
 * comment above and task-13-report.md).
 */
export const getFirebaseAuth = lazy((): Auth => initializeAuth(getFirebaseApp(), { persistence: getReactNativePersistence(AsyncStorage) }));

export const getFirebaseFirestore = lazy((): Firestore => getFirestore(getFirebaseApp()));

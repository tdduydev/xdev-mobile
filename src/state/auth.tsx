import * as AppleAuthentication from 'expo-apple-authentication';
import { useIdTokenAuthRequest } from 'expo-auth-session/providers/google';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import {
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { clearPersonalData, getBookmarks, getReadingProgress, mergeBookmarks, mergeReadingProgress, saveBookmarks, saveReadingProgress } from '@/api/personal-data';
import { getFirebaseAuth, getFirebaseFirestore } from '@/firebase/app';
import { googleAuthConfig, hasGoogleAuthConfig } from '@/firebase/config';
import { fetchRemoteBookmarks, fetchRemoteReadingProgress, syncBookmarkAdded, syncReadingProgress } from '@/firebase/sync';

// Required by expo-auth-session's own setup guide so a completed auth
// session (the browser tab/sheet Google or GitHub would show) resolves the
// pending `promptAsync()` promise instead of hanging — a no-op on native
// where the OS already closes the presented browser itself, but calling it
// unconditionally at module scope (not gated by `Platform.OS === 'web'`) is
// the documented pattern and is harmless on iOS/Android.
WebBrowser.maybeCompleteAuthSession();

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

export type AuthUser = {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
};

function toAuthUser(user: User | null): AuthUser | null {
  if (!user) return null;
  return { uid: user.uid, displayName: user.displayName, email: user.email, photoURL: user.photoURL };
}

/**
 * `"loading"` (Firebase hasn't reported the restored-session state yet —
 * see `getFirebaseAuth`'s `getReactNativePersistence` wiring),
 * `"signedOut"`, or `"signedIn"` — a tagged status rather than a bare
 * `user: User | null`, so a screen can't mistake "still checking the
 * persisted session" for "definitely signed out" (e.g. flashing a sign-in
 * button for a frame before a restored session resolves).
 */
export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  /** False until config (`EXPO_PUBLIC_GOOGLE_*_CLIENT_ID`) is present — see firebase/config.ts. The Settings screen hides/disables the Google button instead of letting a tap fail with an opaque provider error. */
  isGoogleConfigured: boolean;
  /** False on Android/web, and until the async platform check resolves on iOS — expo-apple-authentication is iOS-only (see task-13-report.md's measurement). */
  isAppleAvailable: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  /** The most recent sign-in/out failure, if any — cleared at the start of the next attempt. */
  error: Error | null;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Runs once per confirmed uid per app session (guarded by `syncedUidRef`
 * below): pulls this user's remote bookmarks/reading-progress, merges them
 * with whatever is already stored locally (last-write-wins by timestamp —
 * see personal-data.ts's `mergeBookmarks`/`mergeReadingProgress`), saves the
 * merged result back locally, and pushes it back up so either side missing
 * an item the other has gets caught up in both directions.
 *
 * Deliberately not scoped to "only after an interactive sign-in, never a
 * cold-start session restore": `onAuthStateChanged` reports a restored
 * session the exact same way it reports a fresh one (a non-null `User`),
 * with no signal to tell them apart, and running this merge on a restore
 * too is safe (last-write-wins is idempotent) — it just means a device
 * that was already signed in also gets caught up with changes made
 * elsewhere on every cold start, not only right after tapping "Sign in".
 */
async function syncOnSignIn(uid: string): Promise<void> {
  const db = getFirebaseFirestore();
  const [localBookmarks, remoteBookmarks, localProgress, remoteProgress] = await Promise.all([
    getBookmarks(),
    fetchRemoteBookmarks(db, uid),
    getReadingProgress(),
    fetchRemoteReadingProgress(db, uid),
  ]);

  const mergedBookmarks = mergeBookmarks(localBookmarks, remoteBookmarks);
  const mergedProgress = mergeReadingProgress(localProgress, remoteProgress);

  await Promise.all([saveBookmarks(mergedBookmarks), saveReadingProgress(mergedProgress)]);

  // Push side: writes every merged bookmark/progress entry back up so an
  // item that only existed locally before this sign-in reaches Firestore
  // too, not just the reverse. `setDoc` is idempotent, so re-writing an
  // entry the server already had unchanged is harmless.
  await Promise.all([
    ...mergedBookmarks.map((bookmark) => syncBookmarkAdded(db, uid, bookmark)),
    ...Object.entries(mergedProgress).map(([seriesSlug, entry]) => syncReadingProgress(db, uid, seriesSlug, entry)),
  ]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [asyncError, setAsyncError] = useState<Error | null>(null);
  const [isAppleAvailable, setIsAppleAvailable] = useState(false);
  // Tracks which uid `syncOnSignIn` has already run for in this app
  // session, so a re-render (or another `onAuthStateChanged` firing with
  // the same user) doesn't repeat the merge/push on every render.
  const syncedUidRef = useRef<string | null>(null);

  const [, googleResponse, promptGoogleAsync] = useIdTokenAuthRequest({
    iosClientId: googleAuthConfig.iosClientId,
    androidClientId: googleAuthConfig.androidClientId,
    webClientId: googleAuthConfig.webClientId,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), (firebaseUser) => {
      setUser(toAuthUser(firebaseUser));
      setStatus(firebaseUser ? 'signedIn' : 'signedOut');
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync()
      .then(setIsAppleAvailable)
      .catch(() => setIsAppleAvailable(false));
  }, []);

  // Fires the Firestore merge/push once per newly-confirmed uid (see
  // `syncOnSignIn`'s doc comment for why "newly confirmed" includes a
  // cold-start restore, not only an interactive sign-in).
  useEffect(() => {
    if (!user || syncedUidRef.current === user.uid) return;
    syncedUidRef.current = user.uid;
    syncOnSignIn(user.uid).catch((err) => setAsyncError(toError(err)));
  }, [user]);

  // Only the async branch (exchanging the id_token for a Firebase
  // credential) calls `setError` here, and only from inside a `.catch()`
  // callback — a bare synchronous `setError(...)` in an effect body is
  // exactly what this repo's `react-hooks/set-state-in-effect` lint rule
  // flags (see content.tsx's own doc comment on the same rule). The
  // `googleResponse.type === 'error'` case needs no `setState` at all: it's
  // derived at render time below (`googleResponseError`), the same
  // derived-not-set pattern content.tsx uses for `isLoading`/`entries`/etc.
  useEffect(() => {
    if (googleResponse?.type === 'success' && googleResponse.params.id_token) {
      const credential = GoogleAuthProvider.credential(googleResponse.params.id_token);
      signInWithCredential(getFirebaseAuth(), credential).catch((err) => setAsyncError(toError(err)));
    }
  }, [googleResponse]);

  const googleResponseError =
    googleResponse?.type === 'error' ? new Error(googleResponse.error?.message ?? 'Google sign-in failed') : null;

  const signInWithGoogle = useCallback(async () => {
    setAsyncError(null);
    try {
      await promptGoogleAsync();
    } catch (err) {
      setAsyncError(toError(err));
    }
  }, [promptGoogleAsync]);

  const signInWithApple = useCallback(async () => {
    setAsyncError(null);
    try {
      // A random nonce, hashed before being sent to Apple and passed RAW to
      // Firebase — Apple's ID token embeds the HASH so Firebase can verify
      // it matches the raw value this device generated, guarding against a
      // replayed token from a different sign-in attempt.
      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
      const appleCredential = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
        nonce: hashedNonce,
      });
      if (!appleCredential.identityToken) {
        throw new Error('Apple did not return an identity token');
      }
      const provider = new OAuthProvider('apple.com');
      const credential = provider.credential({ idToken: appleCredential.identityToken, rawNonce });
      await signInWithCredential(getFirebaseAuth(), credential);
    } catch (err) {
      setAsyncError(toError(err));
    }
  }, []);

  const signOut = useCallback(async () => {
    setAsyncError(null);
    try {
      await firebaseSignOut(getFirebaseAuth());
    } finally {
      // Runs even if the network sign-out call itself failed: the brief's
      // privacy requirement ("máy dùng chung mà đăng xuất xong vẫn thấy
      // bookmark người trước là lỗi riêng tư") is about what's left on THIS
      // device, which local-only `clearPersonalData()` fully controls
      // regardless of whether Firebase's network call succeeded.
      syncedUidRef.current = null;
      await clearPersonalData();
    }
  }, []);

  // The most recent async failure takes priority (it's the result of the
  // user's last explicit tap), falling back to a still-current Google
  // provider error otherwise.
  const error = asyncError ?? googleResponseError;

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      isGoogleConfigured: hasGoogleAuthConfig(),
      isAppleAvailable,
      signInWithGoogle,
      signInWithApple,
      signOut,
      error,
    }),
    [status, user, isAppleAvailable, signInWithGoogle, signInWithApple, signOut, error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

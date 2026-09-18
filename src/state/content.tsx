import Fuse from "fuse.js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchManifest } from "@/api/client";
import {
  getCachedIndex,
  getCachedManifestVersion,
  refreshIndex,
  setCachedManifestVersion,
} from "@/api/cache";
import type { Locale } from "@/api/config";
import type { IndexEntry } from "@/api/schema";
import { useLocale } from "@/state/locale";

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

/**
 * The result of loading a locale's index, tagged with the locale it belongs
 * to. `isLoading`/`entries`/`error` below are all DERIVED from comparing
 * `snapshot.locale` against the current `locale` during render, rather than
 * tracked as separate state variables set synchronously inside the loading
 * effect — `react-hooks/set-state-in-effect` (this project's ESLint config;
 * see `AGENTS.md`) flags a bare `setState(...)` call sitting directly in an
 * effect body (as opposed to inside a `.then()`/`.catch()` callback, which
 * is fine) as a cascading-render risk. Comparing `snapshot.locale !== locale`
 * gets the same "just switched locales, old data is now stale" signal for
 * free, entirely at render time, with no such call needed.
 */
type IndexSnapshot = {
  locale: Locale;
  entries: IndexEntry[];
  error: Error | null;
  isStale: boolean;
};

type ContentContextValue = {
  /** The current locale's index entries (blog posts + lessons). `[]` before the first load resolves. */
  entries: IndexEntry[];
  /** True only while there is nothing to show yet (first load for this locale, no cache hit). */
  isLoading: boolean;
  /** True while a manual `refresh()` (pull-to-refresh) is in flight. */
  isRefreshing: boolean;
  /** Set when there is no data to show at all — offline with no cache (spec section 8, row 1). */
  error: Error | null;
  /**
   * Set when `entries` is serving a cache that a background refresh attempt
   * (either the automatic `manifest.version` check or a manual `refresh()`)
   * failed to update — spec section 8, row 2: "dùng cache, hiện banner
   * 'dữ liệu cũ'".
   */
  isStale: boolean;
  /** Forces a network refetch of the current locale's index (pull-to-refresh, or the empty state's retry button). */
  refresh: () => Promise<void>;
  /**
   * A Fuse index over `entries`, built once per `entries` identity (i.e.
   * once per locale switch or successful refresh) and reused across
   * re-renders — NOT rebuilt on every keystroke. Narrow `keys` so the
   * ~1,655-entry `vi` build stays fast on a phone.
   */
  fuse: Fuse<IndexEntry>;
};

const ContentContext = createContext<ContentContextValue | undefined>(undefined);

// A stable reference (not a fresh `[]` literal on every render) so
// `entries`'s identity only actually changes when there is new data —
// otherwise the `useMemo`s below that key on `entries` (the Fuse index,
// the context value) would recompute on every render while isLoading.
const EMPTY_ENTRIES: IndexEntry[] = [];

const FUSE_OPTIONS = {
  keys: ["title", "excerpt", "tags"],
  threshold: 0.35,
  ignoreLocation: true,
};

export function ContentProvider({ children }: { children: ReactNode }) {
  const { locale } = useLocale();
  const [snapshot, setSnapshot] = useState<IndexSnapshot | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isCurrent = snapshot !== null && snapshot.locale === locale;
  const isLoading = !isCurrent;
  const entries = isCurrent ? snapshot.entries : EMPTY_ENTRIES;
  const error = isCurrent ? snapshot.error : null;
  const isStale = isCurrent ? snapshot.isStale : false;

  // Called from event handlers (pull-to-refresh, a retry button) — never
  // from inside a `useEffect`, so a synchronous setState here isn't the
  // pattern `react-hooks/set-state-in-effect` is about.
  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const fresh = await refreshIndex(locale);
      setSnapshot({ locale, entries: fresh, error: null, isStale: false });
      // Best-effort: failing to read/store the manifest version doesn't
      // undo the successful refresh above, it just means the next
      // background check may refetch once more than strictly necessary.
      const manifest = await fetchManifest().catch(() => null);
      if (manifest) await setCachedManifestVersion(manifest.version).catch(() => {});
    } catch (err) {
      setSnapshot((prev) => {
        if (prev && prev.locale === locale && prev.entries.length > 0) {
          return { ...prev, isStale: true };
        }
        return { locale, entries: [], error: toError(err), isStale: false };
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [locale]);

  useEffect(() => {
    let cancelled = false;

    // Step 1: cache-first load — fast, works offline once something has
    // been cached for this locale. Every `setSnapshot` call below runs
    // inside a `.then()`/`.catch()` continuation, after `getCachedIndex`'s
    // promise settles — never synchronously in this effect's own body.
    getCachedIndex(locale)
      .then((cached) => {
        if (cancelled) return;
        setSnapshot({ locale, entries: cached, error: null, isStale: false });
      })
      .catch((err) => {
        if (cancelled) return;
        // No cache and the network fetch inside getCachedIndex also failed
        // — spec section 8, row 1: offline with no cache.
        setSnapshot({ locale, entries: [], error: toError(err), isStale: false });
      });

    // Step 2: independent, non-blocking manifest-version check (spec
    // section 8, row 4: "manifest.version đổi → tải lại index chạy nền,
    // không chặn UI"). Runs concurrently with step 1, not after it.
    (async () => {
      try {
        const manifest = await fetchManifest();
        if (cancelled) return;
        const storedVersion = await getCachedManifestVersion();
        if (manifest.version === storedVersion) return; // already fresh
        const fresh = await refreshIndex(locale);
        if (cancelled) return;
        setSnapshot({ locale, entries: fresh, error: null, isStale: false });
        await setCachedManifestVersion(manifest.version);
      } catch {
        if (cancelled) return;
        // Couldn't confirm freshness (offline, or the refetch itself
        // failed). If step 1 already produced something to show, label it
        // stale rather than silently pretending it's current. If step 1
        // also has nothing (or hasn't resolved yet), leave its own
        // eventual state alone — there's nothing to mark stale yet.
        setSnapshot((prev) => {
          if (prev && prev.locale === locale && prev.entries.length > 0) {
            return { ...prev, isStale: true };
          }
          return prev;
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [locale]);

  const fuse = useMemo(() => new Fuse(entries, FUSE_OPTIONS), [entries]);

  const value = useMemo(
    () => ({ entries, isLoading, isRefreshing, error, isStale, refresh, fuse }),
    [entries, isLoading, isRefreshing, error, isStale, refresh, fuse],
  );

  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
}

export function useContent(): ContentContextValue {
  const ctx = useContext(ContentContext);
  if (!ctx) {
    throw new Error("useContent must be used within a ContentProvider");
  }
  return ctx;
}

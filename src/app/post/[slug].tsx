import { router, Stack, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { getCachedMarkdown } from '@/api/cache';
import { ArticleWebView } from '@/components/ArticleWebView';
import { ExternalLink } from '@/components/external-link';
import { LessonNavigationBar } from '@/components/lesson-navigation-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { getLessonNeighbors, type LessonNeighbor } from '@/content/series-navigation';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useContent } from '@/state/content';

/**
 * `fetchMarkdown` (src/api/client.ts) throws a plain `Error` shaped as
 * `xdev API request failed: GET ${url} -> HTTP ${status}` — not a
 * structured error with a `.status` field. Matching the status out of the
 * message is a light coupling to that string, accepted here rather than
 * changing client.ts's error shape, which is out of this task's scope (the
 * brief's only sanctioned change to the existing data layer is cache.ts).
 */
function isNotFoundError(error: Error): boolean {
  return /-> HTTP 404\b/.test(error.message);
}

type MarkdownSnapshot = {
  path: string;
  markdown: string | null;
  error: Error | null;
};

export default function PostScreen() {
  // `id` is optional: every in-app navigation to this screen now passes it
  // (series.tsx, the Feed/Search tabs, and this screen's own prev/next
  // buttons below), but an external or pre-task-10 deep link
  // (`xdevasia://post/<slug>`) only ever carries `slug`.
  const { slug, id } = useLocalSearchParams<{ slug: string; id?: string }>();
  const { entries, isLoading: isContentLoading, series: seriesList } = useContent();
  const colorScheme = useColorScheme();

  // Prefer resolving by `id`, falling back to `slug` only when no `id` was
  // given. `entries.find(slug === slug)` alone picks the FIRST entry with a
  // matching slug — and the blog repo has shipped real series with two
  // different lessons sharing a slug (task-10 brief: `terminology-service`,
  // the Task 2 bug this whole task is about not repeating). Resolving the
  // CURRENT screen's own entry by slug alone would silently open the wrong
  // one of the pair, independent of whether the prev/next computation below
  // gets the id-matching right — so this fallback chain matters just as
  // much as `getLessonNeighbors` using `id` internally.
  const entry = useMemo(
    () => (id ? entries.find((candidate) => candidate.id === id) : undefined) ?? entries.find((candidate) => candidate.slug === slug),
    [entries, slug, id],
  );

  // Computed for every entry, not just `type: "lesson"` ones —
  // `getLessonNeighbors` already returns `{ previous: null, next: null }`
  // for a blog entry (or once `entry` itself is undefined), so there's no
  // separate branch to keep in sync with its own internal check.
  const neighbors = useMemo(
    () => (entry ? getLessonNeighbors(seriesList ?? [], entry) : { previous: null, next: null }),
    [entry, seriesList],
  );

  // `replace`, not `push`: reading a series is a forward walk through a
  // list, not drilling into unrelated content, and every step is another
  // WebView. `push`ing at each step would stack up an entry per lesson
  // read — task-10 brief's own concern, "chồng stack vô hạn khi đọc liên
  // tiếp 20 bài" — leaving "back" needing 20 presses to actually leave the
  // reader. `replace` keeps the stack at a constant depth, so "back" always
  // means "leave the reader", matching how the screen was entered (from a
  // list, not from another lesson). The existing markdown-loading snapshot
  // above already re-derives from `entry.path` on every render, so
  // navigating this way needs no extra plumbing — it just sees a new
  // `entry` and reloads.
  const navigateToNeighbor = useCallback((neighbor: LessonNeighbor) => {
    router.replace({ pathname: '/post/[slug]', params: { slug: neighbor.slug, id: neighbor.id } });
  }, []);

  // Derived the same way as src/state/content.tsx's index snapshot and
  // series.tsx's series snapshot: `isLoadingMarkdown`/`markdown`/`error`
  // compare `snapshot.path` against the current entry's path at render
  // time, rather than being set synchronously inside the loading effect
  // (which `react-hooks/set-state-in-effect` flags).
  const [snapshot, setSnapshot] = useState<MarkdownSnapshot | null>(null);
  const isCurrent = entry !== undefined && snapshot !== null && snapshot.path === entry.path;
  const isLoadingMarkdown = entry !== undefined && !isCurrent;
  const markdown = isCurrent ? snapshot.markdown : null;
  const error = isCurrent ? snapshot.error : null;

  useEffect(() => {
    if (!entry) return;
    let cancelled = false;
    getCachedMarkdown(entry.path)
      .then((body) => {
        if (!cancelled) setSnapshot({ path: entry.path, markdown: body, error: null });
      })
      .catch((err) => {
        if (!cancelled) {
          setSnapshot({ path: entry.path, markdown: null, error: err instanceof Error ? err : new Error(String(err)) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [entry]);

  if (isContentLoading) {
    return (
      <ThemedView style={styles.centerFill}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (!entry) {
    // Not in the currently-loaded locale's index — e.g. a stale deep link,
    // or the index for this locale hasn't been fetched yet.
    return (
      <ThemedView style={styles.centerFill}>
        <ThemedText type="subtitle" style={styles.centerText}>
          Not found
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary" style={styles.centerText}>
          This post isn&apos;t in the current locale&apos;s index.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerTitle: entry.title }} />
      {isLoadingMarkdown && (
        <ThemedView style={styles.centerFill}>
          <ActivityIndicator />
        </ThemedView>
      )}
      {!isLoadingMarkdown && error && (
        <ThemedView style={styles.centerFill}>
          <ThemedText type="subtitle" style={styles.centerText}>
            {isNotFoundError(error) ? 'Page not found' : "Couldn't load this article"}
          </ThemedText>
          <ThemedText type="default" themeColor="textSecondary" style={styles.centerText}>
            {isNotFoundError(error)
              ? "This article's file couldn't be found on the server."
              : 'Check your connection and try again, or read it on the web instead.'}
          </ThemedText>
          {/* entry.url is a runtime string (schema.ts: z.url()), not a route
              expo-router's typed-routes can statically verify — same cast
              app-tabs.web.tsx needs for SITE_BASE, for the same reason. */}
          <ExternalLink href={entry.url as Href & string} asChild>
            <Pressable style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView type="backgroundElement" style={styles.openInBrowserButton}>
                <ThemedText type="smallBold">Open in browser</ThemedText>
              </ThemedView>
            </Pressable>
          </ExternalLink>
        </ThemedView>
      )}
      {!isLoadingMarkdown && !error && markdown !== null && (
        // `flex: 1` wrapper so `ArticleWebView` (itself `flex: 1`) fills
        // all space the nav bar below doesn't need, instead of the two
        // competing for a parent that may not be a flex column on its own.
        <View style={styles.articleContainer}>
          {/* `key={entry.id}`: `replace`-ing to a neighbor keeps this
              WebView mounted and only swaps `source={{ html }}` (see
              `navigateToNeighbor` above) — [Unverified against a real
              device in this environment] whether react-native-webview
              resets scroll position to the top on a source change alone.
              Keying on the entry forces a remount instead of relying on
              that, so a reader always lands at the top of the next
              lesson rather than wherever the previous one left off. */}
          <ArticleWebView key={entry.id} title={entry.title} markdown={markdown} colorScheme={colorScheme} />
          <LessonNavigationBar previous={neighbors.previous} next={neighbors.next} onNavigate={navigateToNeighbor} />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  articleContainer: {
    flex: 1,
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.five,
  },
  centerText: {
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  openInBrowserButton: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.five,
  },
});

import { Stack, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { getCachedMarkdown } from '@/api/cache';
import { ArticleWebView } from '@/components/ArticleWebView';
import { ExternalLink } from '@/components/external-link';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
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
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { entries, isLoading: isContentLoading } = useContent();
  const colorScheme = useColorScheme();

  const entry = useMemo(() => entries.find((candidate) => candidate.slug === slug), [entries, slug]);

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
        <ArticleWebView title={entry.title} markdown={markdown} colorScheme={colorScheme} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
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

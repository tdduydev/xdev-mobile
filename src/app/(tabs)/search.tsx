import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { EntryCard } from '@/components/entry-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { IndexEntry } from '@/api/schema';
import { useContent } from '@/state/content';

export default function SearchScreen() {
  const { isLoading, error, refresh, fuse } = useContent();
  const [query, setQuery] = useState('');
  const theme = useTheme();

  // `fuse` is built once per locale/refresh by ContentProvider (see
  // src/state/content.tsx) — `.search()` here just queries that already-built
  // index, which is what needs to stay cheap on every keystroke, not the
  // (expensive, ~1,655-entry) index build itself.
  const results = useMemo<IndexEntry[]>(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) return [];
    return fuse.search(trimmed).map((result) => result.item);
  }, [query, fuse]);

  if (isLoading) {
    return (
      <ThemedView style={styles.centerFill}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.flex} edges={['top']}>
        <EmptyState
          title="Search unavailable"
          message="Nothing is saved on this device yet, so there is nothing to search offline. Check your connection and try again."
          onRetry={refresh}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <ThemedView style={styles.header}>
        <ThemedText type="title" style={styles.heading}>
          Search
        </ThemedText>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search posts and lessons…"
          placeholderTextColor={theme.textSecondary}
          autoCorrect={false}
          autoCapitalize="none"
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />
      </ThemedView>
      <FlatList<IndexEntry>
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        // task-16 brief item B: the keyboard covered the tab bar with no way
        // to dismiss it short of tapping a result. A "Cancel" button is one
        // more control to place/localize; scrolling the list the user is
        // already touching is free.
        keyboardDismissMode="on-drag"
        renderItem={({ item }) => (
          <ThemedView style={styles.itemWrapper}>
            <EntryCard
              entry={item}
              onPress={() => router.push({ pathname: '/post/[slug]', params: { slug: item.slug, id: item.id } })}
            />
          </ThemedView>
        )}
        ListEmptyComponent={
          query.trim().length > 0 ? (
            <ThemedText type="default" themeColor="textSecondary" style={styles.emptyText}>
              No results for &ldquo;{query.trim()}&rdquo;.
            </ThemedText>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
  },
  heading: {
    paddingTop: Spacing.two,
  },
  input: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
    marginBottom: Spacing.two,
  },
  listContent: {
    paddingBottom: Spacing.six,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  itemWrapper: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  emptyText: {
    textAlign: 'center',
    padding: Spacing.five,
  },
});

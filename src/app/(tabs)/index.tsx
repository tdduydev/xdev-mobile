import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { EntryCard } from '@/components/entry-card';
import { StaleBanner } from '@/components/stale-banner';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { selectBlogEntries, sortByPublishedAtDesc } from '@/content/feed';
import type { IndexEntry } from '@/api/schema';
import { useContent } from '@/state/content';

export default function FeedScreen() {
  const { entries, isLoading, isRefreshing, error, isStale, refresh } = useContent();

  const posts = useMemo(() => sortByPublishedAtDesc(selectBlogEntries(entries)), [entries]);

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
          title="No posts to show"
          message="Couldn't load the feed and nothing is saved on this device yet. Check your connection and try again."
          onRetry={refresh}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <FlatList<IndexEntry>
        data={posts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            <ThemedText type="title" style={styles.heading}>
              Feed
            </ThemedText>
            {isStale && <StaleBanner />}
          </>
        }
        renderItem={({ item }) => (
          <ThemedView style={styles.itemWrapper}>
            <EntryCard
              entry={item}
              onPress={() => router.push({ pathname: '/post/[slug]', params: { slug: item.slug, id: item.id } })}
            />
          </ThemedView>
        )}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
        ListEmptyComponent={
          <ThemedText type="default" themeColor="textSecondary" style={styles.emptyText}>
            No posts yet.
          </ThemedText>
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
  listContent: {
    paddingBottom: Spacing.six,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  heading: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
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

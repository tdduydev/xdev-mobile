import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchSeriesList } from '@/api/client';
import { resolveAssetUrl, type Locale } from '@/api/config';
import type { Series } from '@/api/schema';
import { EmptyState } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ThumbnailImage } from '@/components/thumbnail-image';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useLocale } from '@/state/locale';

function SeriesRow({
  series,
  expanded,
  onToggle,
  onLessonPress,
}: {
  series: Series;
  expanded: boolean;
  onToggle: () => void;
  onLessonPress: (slug: string) => void;
}) {
  const imageUrl = resolveAssetUrl(series.featuredImage);
  const metaParts = [series.category?.name, series.level, series.lessonCount ? `${series.lessonCount} lessons` : undefined].filter(
    (part): part is string => Boolean(part),
  );

  return (
    <ThemedView type="backgroundElement" style={styles.seriesCard}>
      <Pressable onPress={onToggle} style={({ pressed }) => pressed && styles.pressed}>
        <View style={styles.seriesHeader}>
          {imageUrl && <ThumbnailImage uri={imageUrl} style={styles.seriesImage} contentFit="cover" />}
          <View style={styles.seriesHeaderBody}>
            <ThemedText type="smallBold" numberOfLines={2}>
              {series.title}
            </ThemedText>
            {series.description.length > 0 && (
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                {series.description}
              </ThemedText>
            )}
            {metaParts.length > 0 && (
              <ThemedText type="small" themeColor="textSecondary">
                {metaParts.join(' · ')}
              </ThemedText>
            )}
          </View>
        </View>
      </Pressable>

      {expanded && (
        <View style={styles.chapters}>
          {series.chapters.map((chapter, chapterIndex) => (
            <View key={`${chapter.title}-${chapterIndex}`} style={styles.chapter}>
              {chapter.title.length > 0 && (
                <ThemedText type="smallBold" style={styles.chapterTitle}>
                  {chapter.title}
                </ThemedText>
              )}
              {chapter.lessons.map((lesson) => (
                <Pressable
                  key={lesson.id}
                  onPress={() => onLessonPress(lesson.slug)}
                  style={({ pressed }) => [styles.lessonRow, pressed && styles.pressed]}>
                  <ThemedText type="small">{lesson.title}</ThemedText>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      )}
    </ThemedView>
  );
}

type SeriesSnapshot = {
  locale: Locale;
  series: Series[] | null;
  error: Error | null;
};

export default function SeriesScreen() {
  const { locale } = useLocale();
  // `isLoading`/`seriesList`/`error` are derived by comparing
  // `snapshot.locale` against the current `locale` (see the identical
  // pattern, with the same rationale, in src/state/content.tsx) rather than
  // set synchronously inside the loading effect — that pattern is what
  // `react-hooks/set-state-in-effect` flags.
  const [snapshot, setSnapshot] = useState<SeriesSnapshot | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const isCurrent = snapshot !== null && snapshot.locale === locale;
  const isLoading = !isCurrent;
  const seriesList = isCurrent ? snapshot.series : null;
  const error = isCurrent ? snapshot.error : null;

  // Genuine `.then()/.catch()` chaining, not async/await: calling `load()`
  // from the effect below with a `setSnapshot` sitting after an `await` in
  // the SAME function body still trips `react-hooks/set-state-in-effect` —
  // it only recognizes a setState call as deferred when it is inside a
  // `.then()`/`.catch()` callback (a separate closure), not merely
  // sequenced after an `await` in the calling function itself.
  const load = useCallback(() => {
    fetchSeriesList(locale)
      .then((list) => setSnapshot({ locale, series: list, error: null }))
      .catch((err) => {
        // No cache layer for series (see cache.ts — only the index and
        // markdown are cached), so any failure here is spec section 8, row
        // 1: offline with nothing to show, empty state + retry.
        setSnapshot({ locale, series: null, error: err instanceof Error ? err : new Error(String(err)) });
      });
  }, [locale]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (slug: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return next;
    });
  };

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
          title="No series to show"
          message="Couldn't load the series list and nothing is saved on this device yet. Check your connection and try again."
          onRetry={load}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <FlatList
        data={seriesList ?? []}
        keyExtractor={(item) => item.slug}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <ThemedText type="title" style={styles.heading}>
            Series
          </ThemedText>
        }
        renderItem={({ item }) => (
          <View style={styles.itemWrapper}>
            <SeriesRow
              series={item}
              expanded={expanded.has(item.slug)}
              onToggle={() => toggle(item.slug)}
              onLessonPress={(slug) => router.push(`/post/${slug}`)}
            />
          </View>
        )}
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
  pressed: {
    opacity: 0.7,
  },
  seriesCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  seriesHeader: {
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'center',
  },
  seriesImage: {
    width: 64,
    height: 64,
    borderRadius: Spacing.two,
  },
  seriesHeaderBody: {
    flex: 1,
    gap: Spacing.half,
  },
  chapters: {
    gap: Spacing.two,
    paddingTop: Spacing.two,
  },
  chapter: {
    gap: Spacing.one,
  },
  chapterTitle: {
    marginBottom: Spacing.half,
  },
  lessonRow: {
    paddingVertical: Spacing.one,
    paddingLeft: Spacing.three,
  },
});

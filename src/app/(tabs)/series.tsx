import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SymbolView } from 'expo-symbols';

import { resolveAssetUrl } from '@/api/config';
import type { Series } from '@/api/schema';
import { EmptyState } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ThumbnailImage } from '@/components/thumbnail-image';
import { MaxContentWidth, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useContent } from '@/state/content';

function SeriesRow({
  series,
  expanded,
  onToggle,
  onLessonPress,
}: {
  series: Series;
  expanded: boolean;
  onToggle: () => void;
  // `id` travels alongside `slug` so the destination post screen can
  // disambiguate two lessons that share a slug in the same series (see
  // `onLessonPress` below and post/[slug].tsx's route-resolution comment).
  onLessonPress: (slug: string, id: string) => void;
}) {
  const theme = useTheme();
  const imageUrl = resolveAssetUrl(series.featuredImage);
  const metaParts = [series.category?.name, series.level, series.lessonCount ? `${series.lessonCount} lessons` : undefined].filter(
    (part): part is string => Boolean(part),
  );

  return (
    <ThemedView type="background" style={[styles.seriesCard, { borderColor: theme.border }]}>
      <Pressable onPress={onToggle} style={({ pressed }) => pressed && styles.pressed}>
        <View style={styles.seriesHeader}>
          {imageUrl && <ThumbnailImage uri={imageUrl} title={series.title} style={styles.seriesImage} contentFit="cover" />}
          <View style={styles.seriesHeaderBody}>
            <ThemedText type="cardTitle" numberOfLines={2}>
              {series.title}
            </ThemedText>
            {series.description.length > 0 && (
              <ThemedText type="default" themeColor="textSecondary" numberOfLines={2}>
                {series.description}
              </ThemedText>
            )}
            {metaParts.length > 0 && (
              <ThemedText type="small" themeColor="textSecondary">
                {metaParts.join(' · ')}
              </ThemedText>
            )}
          </View>
          {/* The only signal (before this fix) that a series could even be
              opened was memory of having tapped it — no chevron, no visual
              affordance at all. Rotating a single chevron reads as
              open/closed without needing two separate icon assets. */}
          <SymbolView
            name={{ ios: 'chevron.right', android: 'expand_more', web: 'expand_more' }}
            fallback={null}
            size={16}
            tintColor={theme.textSecondary}
            style={[styles.chevron, expanded && styles.chevronExpanded]}
          />
        </View>
      </Pressable>

      {expanded && (
        <View style={styles.chapters}>
          {series.chapters.map((chapter, chapterIndex) => (
            <View key={`${chapter.title}-${chapterIndex}`} style={styles.chapter}>
              {chapter.title.length > 0 && (
                <ThemedText type="label" themeColor="textSecondary" style={styles.chapterTitle}>
                  {chapter.title}
                </ThemedText>
              )}
              {chapter.lessons.map((lesson) => (
                <Pressable
                  key={lesson.id}
                  onPress={() => onLessonPress(lesson.slug, lesson.id)}
                  style={({ pressed }) => [styles.lessonRow, pressed && styles.pressed]}>
                  <ThemedText type="default">{lesson.title}</ThemedText>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      )}
    </ThemedView>
  );
}

export default function SeriesScreen() {
  // Series data now lives in ContentProvider (src/state/content.tsx),
  // fetched once per locale and shared with the post screen's prev/next
  // navigation (task-10 brief) instead of this screen fetching its own
  // copy on every mount.
  const { series: seriesList, isSeriesLoading: isLoading, seriesError: error, refreshSeries } = useContent();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
          onRetry={refreshSeries}
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
              onLessonPress={(slug, id) => router.push({ pathname: '/post/[slug]', params: { slug, id } })}
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
    borderWidth: 1,
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
  chevron: {
    transform: [{ rotate: '0deg' }],
  },
  chevronExpanded: {
    transform: [{ rotate: '90deg' }],
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
  // `minHeight` (not padding math) guarantees the ≥44 touch target
  // regardless of the lesson title's line count — a two-line title must not
  // shrink the tappable row back under the floor.
  lessonRow: {
    minHeight: TouchTarget,
    justifyContent: 'center',
    paddingVertical: Spacing.one,
    paddingLeft: Spacing.four,
  },
});

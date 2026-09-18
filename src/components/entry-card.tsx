import { Pressable, StyleSheet, View } from 'react-native';

import { resolveAssetUrl } from '@/api/config';
import type { IndexEntry } from '@/api/schema';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ThumbnailImage } from '@/components/thumbnail-image';
import { Spacing } from '@/constants/theme';
import { formatPublishedDate } from '@/content/feed';

type EntryCardProps = {
  entry: IndexEntry;
  onPress: () => void;
};

/** A blog post or lesson row — shared by the Feed, Search, and Series tabs so a result looks the same wherever it's found. */
export function EntryCard({ entry, onPress }: EntryCardProps) {
  const imageUrl = resolveAssetUrl(entry.featuredImage);
  const date = formatPublishedDate(entry.publishedAt);
  const metaParts = [
    entry.type === 'lesson' ? entry.series.chapter : entry.category?.name,
    date,
  ].filter((part): part is string => Boolean(part));

  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type="backgroundElement" style={styles.card}>
        {imageUrl && <ThumbnailImage uri={imageUrl} style={styles.image} contentFit="cover" transition={150} />}
        <View style={styles.body}>
          <ThemedText type="smallBold" numberOfLines={2}>
            {entry.title}
          </ThemedText>
          {entry.excerpt.length > 0 && (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
              {entry.excerpt}
            </ThemedText>
          )}
          {metaParts.length > 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              {metaParts.join(' · ')}
            </ThemedText>
          )}
        </View>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.7,
  },
  card: {
    flexDirection: 'row',
    gap: Spacing.three,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    alignItems: 'center',
  },
  image: {
    width: 72,
    height: 72,
    borderRadius: Spacing.two,
  },
  body: {
    flex: 1,
    gap: Spacing.half,
  },
});

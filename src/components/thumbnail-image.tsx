import { Image, type ImageContentFit } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';

type ThumbnailImageProps = {
  /**
   * Already resolved via `@/api/config`'s `resolveAssetUrl`, and already
   * known non-null — callers keep their existing `{imageUrl && (...)}` gate
   * so an entry with NO `featuredImage` at all still renders no thumbnail
   * slot, exactly as before. This component only handles a `uri` that IS
   * present but fails to load, not the "no image" case.
   */
  uri: string;
  /**
   * The entry/series title, shown as an initial-letter monogram when `uri`
   * fails to load (task-15 brief: a missing image should read as designed,
   * not broken — the 47 pre-existing broken-image references in the blog
   * content are a content problem this app doesn't fix, only render better).
   * Optional so a caller with no natural title can still fall back to the
   * old triangle-exclamation icon.
   */
  title?: string;
  style: StyleProp<ViewStyle>;
  contentFit?: ImageContentFit;
  transition?: number;
};

/**
 * A `featuredImage`/`avatar` thumbnail with a visible placeholder for a
 * failed load — used instead of a bare `expo-image` `Image` because a 404
 * otherwise renders nothing: the `<Image>` element just stays blank,
 * leaving an empty gap the size of the thumbnail in the middle of the row
 * (reported directly from a real device, 2026-09-18: four `vi` series have
 * a `featuredImage` pointing at a content-side file that doesn't exist — a
 * content problem, not this app's, but the app's rendering of that state
 * was worth improving regardless). `onError` (an ordinary event-callback
 * prop, not a `useEffect`) flips to the placeholder.
 */
export function ThumbnailImage({ uri, title, style, contentFit = 'cover', transition }: ThumbnailImageProps) {
  const [failed, setFailed] = useState(false);
  const theme = useTheme();
  const showPlaceholder = failed;
  const initial = title?.trim().charAt(0).toUpperCase();

  return (
    <ThemedView type="backgroundElement" style={[style, styles.container]}>
      {!showPlaceholder && (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit={contentFit}
          transition={transition}
          onError={() => setFailed(true)}
        />
      )}
      {showPlaceholder && initial && (
        <ThemedText type="subtitle" themeColor="textSecondary">
          {initial}
        </ThemedText>
      )}
      {showPlaceholder && !initial && (
        <View style={styles.placeholderIcon}>
          <SymbolView
            name={{ ios: 'photo.trianglebadge.exclamationmark', android: 'image_not_supported', web: 'image_not_supported' }}
            fallback={null}
            size={20}
            tintColor={theme.textSecondary}
          />
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderIcon: {
    opacity: 0.6,
  },
});

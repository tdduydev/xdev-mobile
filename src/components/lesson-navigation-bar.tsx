import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { LessonNeighbor } from '@/content/series-navigation';

type LessonNavigationBarProps = {
  previous: LessonNeighbor | null;
  next: LessonNeighbor | null;
  onNavigate: (neighbor: LessonNeighbor) => void;
};

/**
 * Previous/next lesson buttons for a series lesson (task-10). A native bar
 * rendered as a sibling BELOW `ArticleWebView` in a shared flex column —
 * not injected into the article's HTML, and not an absolute overlay on top
 * of the WebView either.
 *
 * Not in the WebView: `ArticleWebView`'s own doc comment already draws this
 * boundary — "The shell ... stays native; only the article body itself is
 * a WebView" — and reaching into `render-article.ts`'s pure markdown → HTML
 * conversion to inject routable buttons (needing an `onMessage` bridge back
 * out to expo-router) would cross it for no real benefit.
 *
 * Not an overlay: a bar pinned on top of the WebView would sit over the
 * last lines of the article while scrolling, which — unlike a normal
 * bottom-of-content element — a reader can't scroll out from under, since
 * it tracks the viewport instead of the content. Docking it below the
 * WebView in the flex column (post/[slug].tsx gives the pair a shared
 * `flex: 1` wrapper) costs nothing but a bit of vertical space and never
 * covers article text.
 *
 * Returns `null` — not a disabled/empty bar — when there is genuinely
 * nothing to navigate to (task-10 brief: hide the button at either end of
 * a series, don't show it disabled).
 */
export function LessonNavigationBar({ previous, next, onNavigate }: LessonNavigationBarProps) {
  if (!previous && !next) return null;

  return (
    <SafeAreaView edges={['bottom']}>
      <View style={styles.row}>
        {previous && (
          <Pressable
            onPress={() => onNavigate(previous)}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
            <ThemedView type="backgroundElement" style={styles.buttonInner}>
              <ThemedText type="small" themeColor="textSecondary">
                ‹ Previous
              </ThemedText>
              {/* The target lesson's own title, not a generic "Previous" —
                  task-10 brief: the reader needs to know where they're
                  headed before tapping. */}
              <ThemedText type="smallBold" numberOfLines={1}>
                {previous.title}
              </ThemedText>
            </ThemedView>
          </Pressable>
        )}
        {next && (
          <Pressable
            onPress={() => onNavigate(next)}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
            <ThemedView type="backgroundElement" style={styles.buttonInner}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.rightAlign}>
                Next ›
              </ThemedText>
              <ThemedText type="smallBold" numberOfLines={1} style={styles.rightAlign}>
                {next.title}
              </ThemedText>
            </ThemedView>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  button: {
    flex: 1,
  },
  buttonInner: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.half,
  },
  rightAlign: {
    textAlign: 'right',
  },
  pressed: {
    opacity: 0.7,
  },
});

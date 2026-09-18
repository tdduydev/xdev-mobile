import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

type EmptyStateProps = {
  title: string;
  message: string;
  onRetry: () => void;
  retryLabel?: string;
};

/**
 * Spec section 8, row 1: offline with no cache → empty state with a retry
 * button. Used wherever a screen has genuinely nothing to show (no cached
 * data AND the network fetch failed) — as opposed to `StaleBanner`, which
 * is for "showing old data, refresh attempt failed" (something IS shown).
 */
export function EmptyState({ title, message, onRetry, retryLabel = 'Retry' }: EmptyStateProps) {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle" style={styles.centerText}>
        {title}
      </ThemedText>
      <ThemedText type="default" themeColor="textSecondary" style={styles.centerText}>
        {message}
      </ThemedText>
      <Pressable onPress={onRetry} style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="backgroundElement" style={styles.button}>
          <ThemedText type="smallBold">{retryLabel}</ThemedText>
        </ThemedView>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
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
  button: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.five,
  },
});

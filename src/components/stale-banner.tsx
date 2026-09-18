import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

/**
 * Spec section 8, row 2: "Index tải lỗi, có cache → dùng cache, hiện banner
 * 'dữ liệu cũ'". Shown above a list that IS rendering cached content, while
 * the most recent attempt to refresh it (the background manifest-version
 * check, or a manual pull-to-refresh) failed.
 */
export function StaleBanner() {
  return (
    <ThemedView type="backgroundSelected" style={styles.banner}>
      <ThemedText type="small">Showing saved content — could not refresh (offline?)</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.two,
    borderRadius: Spacing.two,
  },
});

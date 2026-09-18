import { AppleAuthenticationButton, AppleAuthenticationButtonStyle, AppleAuthenticationButtonType } from 'expo-apple-authentication';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LOCALES, type Locale } from '@/api/config';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/state/auth';
import { useLocale } from '@/state/locale';
import { THEME_MODES, useThemeMode, type ThemeMode } from '@/state/theme';

const LOCALE_LABELS: Record<Locale, string> = {
  vi: 'Tiếng Việt',
  en: 'English',
  ja: '日本語',
  'zh-tw': '繁體中文',
};

const THEME_MODE_LABELS: Record<ThemeMode, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

function OptionRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type={selected ? 'backgroundSelected' : 'backgroundElement'} style={styles.optionRow}>
        <ThemedText type="default">{label}</ThemedText>
        {selected && <ThemedText type="smallBold">✓</ThemedText>}
      </ThemedView>
    </Pressable>
  );
}

/**
 * Task 13: sign-in/out, the one authenticated surface in this app. Reading
 * and quiz-taking (Feed/Series/Quizzes tabs) never check `status` at all —
 * this section is purely additive, per the brief's "mọi thứ đang chạy khi
 * chưa đăng nhập phải tiếp tục chạy."
 */
function AccountSection() {
  const { status, user, isGoogleConfigured, isAppleAvailable, signInWithGoogle, signInWithApple, signOut, error } = useAuth();
  const colorScheme = useColorScheme();

  if (status === 'loading') {
    return (
      <View style={styles.section}>
        <ThemedText type="label" themeColor="textSecondary" style={styles.sectionLabel}>
          TÀI KHOẢN
        </ThemedText>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <ThemedText type="label" themeColor="textSecondary" style={styles.sectionLabel}>
        TÀI KHOẢN
      </ThemedText>

      {status === 'signedIn' && user ? (
        <View style={styles.optionGroup}>
          <ThemedView type="backgroundElement" style={styles.accountRow}>
            <ThemedText type="default">{user.displayName ?? user.email ?? user.uid}</ThemedText>
            {user.email && user.displayName && (
              <ThemedText type="small" themeColor="textSecondary">
                {user.email}
              </ThemedText>
            )}
          </ThemedView>
          <Pressable onPress={signOut} style={({ pressed }) => pressed && styles.pressed}>
            <ThemedView type="backgroundElement" style={styles.optionRow}>
              <ThemedText type="default">Đăng xuất</ThemedText>
            </ThemedView>
          </Pressable>
        </View>
      ) : (
        <View style={styles.optionGroup}>
          <ThemedText type="small" themeColor="textSecondary">
            Đăng nhập để đồng bộ bookmark, tiến độ đọc và kết quả thi thử.
          </ThemedText>
          {isAppleAvailable && (
            <AppleAuthenticationButton
              buttonType={AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={colorScheme === 'dark' ? AppleAuthenticationButtonStyle.WHITE : AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={Spacing.two}
              style={styles.appleButton}
              onPress={signInWithApple}
            />
          )}
          {isGoogleConfigured ? (
            <Pressable onPress={signInWithGoogle} style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView type="backgroundElement" style={styles.optionRow}>
                <ThemedText type="default">Đăng nhập với Google</ThemedText>
              </ThemedView>
            </Pressable>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              Đăng nhập Google chưa được cấu hình (thiếu EXPO_PUBLIC_GOOGLE_*_CLIENT_ID).
            </ThemedText>
          )}
        </View>
      )}

      {error && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.errorText}>
          {error.message}
        </ThemedText>
      )}
    </View>
  );
}

export default function SettingsScreen() {
  const { locale, setLocale } = useLocale();
  const { mode, setMode } = useThemeMode();

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <View style={styles.content}>
        <ThemedText type="title" style={styles.heading}>
          Settings
        </ThemedText>

        <AccountSection />

        <View style={styles.section}>
          <ThemedText type="label" themeColor="textSecondary" style={styles.sectionLabel}>
            LANGUAGE
          </ThemedText>
          <View style={styles.optionGroup}>
            {LOCALES.map((candidate) => (
              <OptionRow
                key={candidate}
                label={LOCALE_LABELS[candidate]}
                selected={candidate === locale}
                onPress={() => setLocale(candidate)}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText type="label" themeColor="textSecondary" style={styles.sectionLabel}>
            APPEARANCE
          </ThemedText>
          <View style={styles.optionGroup}>
            {THEME_MODES.map((candidate) => (
              <OptionRow
                key={candidate}
                label={THEME_MODE_LABELS[candidate]}
                selected={candidate === mode}
                onPress={() => setMode(candidate)}
              />
            ))}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.three,
    gap: Spacing.five,
  },
  heading: {
    paddingTop: Spacing.two,
  },
  section: {
    gap: Spacing.two,
  },
  sectionLabel: {
    paddingHorizontal: Spacing.one,
  },
  optionGroup: {
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  accountRow: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.half,
  },
  appleButton: {
    height: 44,
  },
  errorText: {
    paddingHorizontal: Spacing.one,
  },
});

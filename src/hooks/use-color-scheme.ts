import { useColorScheme as useRNColorScheme } from 'react-native';

import { useThemeMode } from '@/state/theme';

/**
 * The effective color scheme: the user's explicit `light`/`dark` choice from
 * Settings (`@/state/theme`) if set, otherwise the OS appearance. Always
 * resolves to a concrete value — never RN's `null`/`'unspecified'` — so
 * callers (e.g. `Colors[useColorScheme()]`) never need a fallback ternary.
 */
export function useColorScheme(): 'light' | 'dark' {
  const { mode } = useThemeMode();
  const system = useRNColorScheme();
  if (mode === 'light' || mode === 'dark') return mode;
  return system === 'dark' ? 'dark' : 'light';
}

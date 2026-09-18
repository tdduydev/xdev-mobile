import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { Fonts, ThemeColor, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Every `type` here maps to a step of the scale in `constants/theme.ts`.
 * Sizes and weights live there, not here, so the scale can be read in one
 * place instead of being reconstructed from a StyleSheet.
 *
 * The eight original names are all still accepted — 18 files import this
 * component and restyling them is a separate step from changing the scale —
 * but several now resolve to different sizes:
 *
 *   title     48 → 28   a screen title should not fill a third of the viewport
 *   subtitle  32 → 22
 *   default   16/500 → 15/400   body at weight 500 left nothing for emphasis
 *   small     14 → 13
 *
 * `cardTitle`, `bodyStrong` and `label` are new: the old scale jumped from 32
 * straight to 16, so a card's title and its excerpt were necessarily the same
 * size and could only be told apart by colour.
 */
export type ThemedTextType =
  | 'default'
  | 'title'
  | 'small'
  | 'smallBold'
  | 'subtitle'
  | 'link'
  | 'linkPrimary'
  | 'code'
  | 'cardTitle'
  | 'bodyStrong'
  | 'label';

export type ThemedTextProps = TextProps & {
  type?: ThemedTextType;
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  // `linkPrimary` used to hardcode '#3c87f7' — neither the brand blue nor
  // legible against the dark background. It now follows the theme's brand
  // token, which is deliberately a lighter blue in dark mode for contrast.
  const color = type === 'linkPrimary' ? theme.brand : theme[themeColor ?? 'text'];

  return <Text style={[{ color }, styles[type], style]} {...rest} />;
}

const styles = StyleSheet.create({
  default: Type.body as TextStyle,
  bodyStrong: Type.bodyStrong as TextStyle,
  title: Type.display as TextStyle,
  subtitle: Type.headline as TextStyle,
  cardTitle: Type.title as TextStyle,
  small: Type.caption as TextStyle,
  smallBold: { ...Type.caption, fontWeight: '700' } as TextStyle,
  label: Type.label as TextStyle,
  link: { ...Type.caption, fontWeight: '600' } as TextStyle,
  linkPrimary: { ...Type.caption, fontWeight: '600' } as TextStyle,
  code: {
    fontFamily: Fonts.mono,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
});

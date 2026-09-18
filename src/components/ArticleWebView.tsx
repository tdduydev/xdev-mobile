import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import WebView from 'react-native-webview';

import { buildArticleDocument, type ArticleColorScheme } from '@/content/render-article';
import { useTheme } from '@/hooks/use-theme';

type ArticleWebViewProps = {
  title: string;
  markdown: string;
  colorScheme: ArticleColorScheme;
};

/**
 * Renders an article's markdown body as HTML inside a WebView — see
 * `@/content/render-article` for the markdown → HTML conversion (a pure,
 * unit-tested function) and the offline-degradation story for mermaid
 * diagrams. The shell (this screen's header, back button, "open in browser"
 * fallback) stays native; only the article body itself is a WebView.
 */
export function ArticleWebView({ title, markdown, colorScheme }: ArticleWebViewProps) {
  const theme = useTheme();
  const html = useMemo(
    () => buildArticleDocument({ title, markdown, colorScheme }),
    [title, markdown, colorScheme],
  );

  return (
    <WebView
      originWhitelist={['*']}
      source={{ html }}
      style={[styles.webview, { backgroundColor: theme.background }]}
      startInLoadingState
      renderLoading={() => (
        <ActivityIndicator style={[styles.loading, { backgroundColor: theme.background }]} />
      )}
    />
  );
}

const styles = StyleSheet.create({
  webview: {
    flex: 1,
  },
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

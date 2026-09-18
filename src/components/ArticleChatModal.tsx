import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { buildChatPrompt, classifyGeminiError, formatConversationHistory, truncateArticleContext, type ChatMessage } from '@/content/chat';
import { getGeminiModel } from '@/firebase/ai';
import { useTheme } from '@/hooks/use-theme';

type ArticleChatModalProps = {
  visible: boolean;
  onClose: () => void;
  /** The article's display title — goes into the prompt so the model knows what "this article" means. */
  title: string;
  /**
   * The article's raw Markdown body (same string `post/[slug].tsx` passes
   * to `ArticleWebView`). Truncated internally via
   * `content/chat.ts#truncateArticleContext` — callers pass the full body.
   */
  articleMarkdown: string;
};

/**
 * Task-14a: "Hỏi AI về bài viết" — a chat modal scoped to the article
 * currently open, mirroring blog.xdev.asia's `AIChatWidget.tsx` (see
 * `src/content/chat.ts`'s header comment for the parity details).
 *
 * Two deliberate departures from the web widget, both directed by the
 * task-14a brief rather than web parity:
 *
 * 1. No sign-in gate. Web calls `openLoginModal()` instead of sending when
 *    signed out; this brief says the opposite — "Chạy được khi chưa đăng
 *    nhập. Đừng chặn sau login" — so this component never looks at
 *    `useAuth()` at all.
 * 2. No streaming. `generateContentStream()` needs `Response.body` as a
 *    `ReadableStream`, which the RN environment's `fetch` (via
 *    `whatwg-fetch`, see `node_modules/whatwg-fetch/fetch.js`) does not
 *    implement — confirmed by reading that polyfill's source, not
 *    assumed. Falls back to plain `generateContent()` (which is in fact
 *    what the web widget already uses too) with an explicit "AI đang trả
 *    lời..." state instead, per the brief's fallback clause.
 *
 * Rendered by `post/[slug].tsx` keyed on `entry.id`, so navigating to a
 * neighboring lesson (`router.replace`, same screen instance reused) gets
 * a fresh conversation instead of silently carrying the old article's chat
 * history into the new one.
 */
export function ArticleChatModal({ visible, onClose, title, articleMarkdown }: ArticleChatModalProps) {
  const theme = useTheme();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Computed once per article body, not per keystroke/message.
  const articleContext = useMemo(() => truncateArticleContext(articleMarkdown), [articleMarkdown]);

  const send = useCallback(async () => {
    const question = input.trim();
    if (!question || sending) return;

    setErrorNotice(null);
    setInput('');
    const history = formatConversationHistory(messages);
    setMessages((prev) => [...prev, { role: 'user', content: question }]);
    setSending(true);

    try {
      const prompt = buildChatPrompt({ title, articleContext, conversationHistory: history, question });
      const model = getGeminiModel();
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      setMessages((prev) => [...prev, { role: 'ai', content: text || 'Xin lỗi, tôi không thể trả lời lúc này.' }]);
    } catch (error) {
      // A failed call must not swallow the user's question or freeze the
      // screen (brief: "không phải màn trắng") — surface it as its own AI
      // bubble, same place a real answer would have gone, plus a banner
      // note so a glance at the top of the sheet also explains the state.
      const readable = classifyGeminiError(error);
      setErrorNotice(readable);
      setMessages((prev) => [...prev, { role: 'ai', content: readable }]);
    } finally {
      setSending(false);
    }
  }, [input, sending, messages, title, articleContext]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ThemedView style={styles.flexOne}>
        <SafeAreaView style={styles.flexOne} edges={['top', 'bottom']}>
          {/* `KeyboardAvoidingView` wraps the WHOLE body (header through
              input row), not just the input row — measured on-device
              (iPhone 16 Pro simulator): wrapping only the input row left it
              (and the whole row) invisible once the keyboard opened, a
              known interaction between `KeyboardAvoidingView`'s
              distance-from-window-bottom measurement and `Modal`'s own
              separate view hierarchy. Wrapping the full body instead lets
              the ScrollView shrink and the input row ride up above the
              keyboard as one unit, matching how `KeyboardAvoidingView` is
              normally used outside a `Modal`. */}
          <KeyboardAvoidingView style={styles.flexOne} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[styles.header, { borderBottomColor: theme.backgroundSelected }]}>
              <View style={styles.headerText}>
                <ThemedText type="smallBold">Hỏi AI về bài viết</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {title}
                </ThemedText>
              </View>
              <Pressable onPress={onClose} hitSlop={8} style={({ pressed }) => pressed && styles.pressed}>
                <ThemedText type="default">Đóng</ThemedText>
              </Pressable>
            </View>

            {errorNotice && (
              <ThemedView type="backgroundElement" style={styles.errorBanner}>
                <ThemedText type="small">{errorNotice}</ThemedText>
              </ThemedView>
            )}

            <ScrollView
              ref={scrollRef}
              style={styles.flexOne}
              contentContainerStyle={styles.messagesContent}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
              {messages.length === 0 && (
                <ThemedText type="small" themeColor="textSecondary" style={styles.emptyHint}>
                  Hỏi bất kỳ điều gì về bài viết này!
                </ThemedText>
              )}

              {messages.map((message, index) => (
                <View key={index} style={[styles.bubbleRow, message.role === 'user' ? styles.bubbleRowUser : styles.bubbleRowAi]}>
                  <View style={[styles.bubble, { backgroundColor: message.role === 'user' ? '#3c87f7' : theme.backgroundElement }]}>
                    <ThemedText type="default" style={message.role === 'user' ? styles.bubbleTextUser : undefined}>
                      {message.content}
                    </ThemedText>
                  </View>
                </View>
              ))}

              {sending && (
                <View style={[styles.bubbleRow, styles.bubbleRowAi]}>
                  <View style={[styles.bubble, styles.typingBubble, { backgroundColor: theme.backgroundElement }]}>
                    <ActivityIndicator size="small" />
                    <ThemedText type="small" themeColor="textSecondary">
                      AI đang trả lời...
                    </ThemedText>
                  </View>
                </View>
              )}
            </ScrollView>

            <View style={[styles.inputRow, { borderTopColor: theme.backgroundSelected }]}>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Nhập câu hỏi..."
                placeholderTextColor={theme.textSecondary}
                editable={!sending}
                multiline
                style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
              />
              <Pressable
                onPress={send}
                disabled={sending || !input.trim()}
                style={({ pressed }) => [styles.sendButton, (sending || !input.trim()) && styles.sendButtonDisabled, pressed && styles.pressed]}>
                <ThemedText type="smallBold" style={styles.sendButtonText}>
                  Gửi
                </ThemedText>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flexOne: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerText: {
    flex: 1,
    gap: Spacing.half,
  },
  errorBanner: {
    marginHorizontal: Spacing.three,
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
  messagesContent: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  emptyHint: {
    textAlign: 'center',
    paddingVertical: Spacing.five,
  },
  bubbleRow: {
    flexDirection: 'row',
  },
  bubbleRowUser: {
    justifyContent: 'flex-end',
  },
  bubbleRowAi: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  bubbleTextUser: {
    color: '#ffffff',
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    maxHeight: 100,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  sendButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    backgroundColor: '#3c87f7',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: '#ffffff',
  },
  pressed: {
    opacity: 0.7,
  },
});

/**
 * Pure, framework-free helpers for the per-article "Hỏi AI về bài viết" chat
 * (task-14a). Deliberately mirrors blog.xdev.asia's `AIChatWidget.tsx` (the
 * per-article widget, not `GlobalChatbot.tsx`'s site-wide one) — brief:
 * "giữ hành vi app gần với web — người dùng không nên thấy hai con trợ lý
 * khác tính cách." Kept dependency-free (no `firebase/ai` import) so these
 * can be unit-tested with plain objects, same separation as
 * `content/series-navigation.ts` / `content/quiz-scoring.ts` versus the
 * screens that call them.
 */

export type ChatRole = 'user' | 'ai';

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

/**
 * How much of the article to inject into the prompt. Matches web's
 * `AIChatWidget.getContext()` exactly (`.slice(0, 6000)` of the article's
 * plain text) rather than inventing a new number — that value is already
 * running in production against the same `gemini-2.5-flash` model on the
 * same `xdev-asia` project, so it's a known-safe request size/cost, not a
 * guess. Web slices HTML-extracted plain text; this slices the raw
 * Markdown this app already has in hand (`entry` markdown from
 * `getCachedMarkdown`) — closer to the source than round-tripping through
 * HTML, and Gemini reads Markdown structure (headings, code fences) fine.
 */
export const ARTICLE_CONTEXT_MAX_CHARS = 6000;

const TRUNCATION_NOTE = '\n\n[Nội dung bài viết đã bị cắt bớt do quá dài]';

/**
 * Cuts the article body down to `maxChars` for the prompt. A short article
 * (the common case — most xDev lessons) passes through untouched. A very
 * long one (brief: "bài rất dài... đừng ném cả bài 60 nghìn từ vào prompt")
 * is hard-cut at the character threshold and gets a trailing note so the
 * model (and, if it chooses to say so, the user) knows the context is
 * partial — plain `.slice()` alone, like web does, would silently look
 * like a complete-but-short article instead.
 */
export function truncateArticleContext(markdown: string, maxChars: number = ARTICLE_CONTEXT_MAX_CHARS): string {
  if (markdown.length <= maxChars) return markdown;
  return markdown.slice(0, maxChars) + TRUNCATION_NOTE;
}

/**
 * How many prior turns to replay back into the prompt as history. Matches
 * `AIChatWidget.tsx`'s `messages.slice(-6)` (not `GlobalChatbot.tsx`'s
 * `-8` — this is the per-article widget's twin, not the site-wide one).
 */
export const CHAT_HISTORY_TURNS = 6;

/** Formats the last few turns as `"Người dùng: ...\nAI: ..."`, same shape as web's `conversationHistory` string. Empty string (not e.g. a header with no lines) when there's no history yet, so callers can `history ? ... : ""` exactly like web does. */
export function formatConversationHistory(messages: readonly ChatMessage[], maxTurns: number = CHAT_HISTORY_TURNS): string {
  return messages
    .slice(-maxTurns)
    .map((message) => `${message.role === 'user' ? 'Người dùng' : 'AI'}: ${message.content}`)
    .join('\n');
}

export type BuildChatPromptArgs = {
  title: string;
  articleContext: string;
  conversationHistory: string;
  question: string;
};

/**
 * Builds the exact prompt sent to `generateContent`. Copied from
 * `AIChatWidget.tsx`'s template verbatim (same Vietnamese wording,
 * including "Trả về plain text, không dùng markdown" — this app renders
 * chat bubbles as plain `Text`, not a Markdown view, so that instruction
 * is load-bearing here, not just copied for flavor).
 */
export function buildChatPrompt({ title, articleContext, conversationHistory, question }: BuildChatPromptArgs): string {
  return `Bạn là trợ lý AI cho blog kỹ thuật xDev Asia. Bạn đang trả lời câu hỏi về bài viết "${title}".

Nội dung bài viết (tóm tắt):
${articleContext}

${conversationHistory ? `Lịch sử hội thoại:\n${conversationHistory}\n\n` : ''}Người dùng hỏi: ${question}

Trả lời ngắn gọn, chính xác bằng tiếng Việt. Nếu câu hỏi không liên quan đến bài viết, vẫn cố gắng trả lời hữu ích. Trả về plain text, không dùng markdown.`;
}

/** Duck-types a Firebase `AIError`-shaped value without importing `firebase/ai` (see this file's header comment on why). `@firebase/ai`'s `AIError.code` is the bare code, e.g. `"fetch-error"` — NOT the `"ai/fetch-error"` FirebaseError-style prefix (verified against `node_modules/@firebase/ai/dist/index.node.mjs`: its constructor does `this.code = code` after `super()`, overwriting the prefixed one `FirebaseError` set). */
function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === code;
}

function errorMessageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '';
}

/**
 * Turns whatever `generateContent()` threw into a readable Vietnamese
 * message for a chat bubble — brief: "Lỗi mạng và lỗi API phải hiện thành
 * thông báo đọc được, không phải màn trắng."
 *
 * Network case is matched by MESSAGE substring, not `.code`: RN's
 * `whatwg-fetch` polyfill (`node_modules/whatwg-fetch/fetch.js`) rejects
 * the underlying `fetch()` with a plain `TypeError('Network request
 * failed')` / `TypeError('Network request timed out')` when the device has
 * no connectivity, and `@firebase/ai`'s HTTP helper
 * (`index.node.mjs`'s `callCloudOrDevice` request path) re-wraps ANY
 * fetch-level throw that isn't already a `FETCH_ERROR`/`API_NOT_ENABLED`
 * `AIError` into a generic `AIError(AIErrorCode.ERROR, "Error fetching
 * from <url>: " + e.message)` — so by the time this function sees it, the
 * distinguishing information is in the message text, not the code.
 *
 * A non-2xx HTTP response (quota exhausted, bad request, safety block from
 * the API layer) instead surfaces as `AIError` with `.code ===
 * "fetch-error"`, message containing `[<status> <statusText>] ...` — kept
 * as its own branch (and its own message) rather than folded into the
 * generic fallback, since "the model reached Google but Google said no" is
 * a different, more actionable story for the user than "no network".
 */
export function classifyGeminiError(error: unknown): string {
  const message = errorMessageOf(error);

  if (/network request failed|network request timed out/i.test(message)) {
    return 'Mất kết nối mạng. Kiểm tra Internet rồi thử lại.';
  }

  if (hasErrorCode(error, 'fetch-error')) {
    if (/\[42[389]\b/.test(message)) {
      // 429 Too Many Requests, 403 (quota/permission — same shape sans
      // App Check, see README's Task-14b note), 428 Precondition Required.
      return 'Đã vượt giới hạn sử dụng AI lúc này. Vui lòng thử lại sau ít phút.';
    }
    return 'Không kết nối được tới máy chủ AI. Vui lòng thử lại sau.';
  }

  if (hasErrorCode(error, 'response-error')) {
    return 'AI không thể trả lời câu hỏi này (có thể do bộ lọc nội dung). Hãy thử diễn đạt khác.';
  }

  // Matches web's tone for the catch-all case
  // (`AIChatWidget.tsx`: "Có lỗi xảy ra. Vui lòng thử lại.").
  return 'Có lỗi xảy ra khi hỏi AI. Vui lòng thử lại.';
}

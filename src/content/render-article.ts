import hljs from "highlight.js";
import { marked, type Tokens } from "marked";
import { SITE_BASE } from "../api/config";
import { stripFrontmatter } from "./frontmatter";

/**
 * Pinned to the exact version the blog itself resolves (blog repo's
 * package-lock.json, checked 2026-09-18) so the diagrams look the same as
 * on the web. Loaded from a CDN rather than bundled: mermaid's browser
 * bundle is large, and most articles never use it — see
 * `MERMAID_SCRIPT_TAG` below for what happens when this can't load
 * (offline, or the CDN is unreachable).
 */
const MERMAID_CDN_URL = "https://cdn.jsdelivr.net/npm/mermaid@11.13.0/dist/mermaid.min.js";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

/**
 * Resolves an `href`/`src` found INSIDE a markdown body (as opposed to
 * `featuredImage`/`avatar` in the index JSON, which `@/api/config`'s
 * `resolveAssetUrl` handles under a schema-guaranteed contract). Markdown
 * content has no such guarantee — observed directly in live content
 * (2026-09-18): images use root-relative paths (e.g.
 * `/images/blog/swarm-k8s-dieu-phoi.png`) and so do internal links (e.g.
 * `/blog/outbox-va-giao-dung-mot-lan`), but a link can just as easily be an
 * absolute URL, a `mailto:`/`tel:` link, or an in-page `#fragment`. Only the
 * root-relative case is rewritten; everything else is left exactly as
 * written, since inside a WebView loaded from an inline HTML string
 * (`source={{ html }}`, no real origin) an un-rewritten root-relative link
 * would otherwise resolve against nothing.
 */
function resolveContentHref(href: string): string {
  if (href.startsWith("/")) return `${SITE_BASE}${href}`;
  return href;
}

let rendererInstalled = false;

/**
 * Registers the code/link/image overrides on marked's (module-global)
 * renderer, once. `marked.use()` merges a partial `RendererObject` onto the
 * existing renderer rather than replacing it, so calling this more than
 * once would just re-set the same overrides — the guard only avoids doing
 * that redundant work on every render call.
 */
function ensureRendererInstalled(): void {
  if (rendererInstalled) return;
  rendererInstalled = true;

  marked.use({
    renderer: {
      code({ text, lang }: Tokens.Code): string {
        // marked passes the fence's whole info string as `lang` (e.g. a
        // fence tagged ```js title=foo``` would carry "js title=foo") — only
        // the first word is the language.
        const language = lang?.trim().split(/\s+/)[0];

        // Mermaid fences are rendered client-side, in the browser, by the
        // script MERMAID_SCRIPT_TAG injects (mermaid needs a DOM — it can't
        // run ahead of time in this module the way highlight.js can).
        // `language-mermaid`/`language-mmd` matches the class name the
        // blog's own ContentRenderer.tsx looks for, and the source is left
        // completely unescaped-by-highlighting (just HTML-escaped) so
        // mermaid can parse it verbatim if the script loads.
        if (language === "mermaid" || language === "mmd") {
          return `<pre><code class="language-${language}">${escapeHtml(text)}</code></pre>`;
        }

        const known = language !== undefined && hljs.getLanguage(language) !== undefined;
        // highlight.js escapes the source itself as part of highlighting —
        // `text` must NOT be escaped again before this call, or entities in
        // the source (e.g. a literal `&` in a string) would be double-escaped.
        const highlighted = known
          ? hljs.highlight(text, { language: language as string }).value
          : hljs.highlightAuto(text).value;
        const languageClass = known ? ` language-${language}` : "";
        return `<pre><code class="hljs${languageClass}">${highlighted}</code></pre>`;
      },
      image({ href, title, text }: Tokens.Image): string {
        const resolvedHref = resolveContentHref(href);
        const titleAttr = title ? ` title="${escapeAttribute(title)}"` : "";
        return `<img src="${escapeAttribute(resolvedHref)}" alt="${escapeAttribute(text)}"${titleAttr} loading="lazy" />`;
      },
      link(this: { parser: { parseInline: (tokens: Tokens.Link["tokens"]) => string } }, {
        href,
        title,
        tokens,
      }: Tokens.Link): string {
        const resolvedHref = resolveContentHref(href);
        const titleAttr = title ? ` title="${escapeAttribute(title)}"` : "";
        const inner = this.parser.parseInline(tokens);
        // target=_blank: a tap on an in-article link should not navigate the
        // WebView away from the article itself (there is no back button
        // inside it — the shell's back button is native, one level up).
        return `<a href="${escapeAttribute(resolvedHref)}" target="_blank" rel="noopener noreferrer"${titleAttr}>${inner}</a>`;
      },
    },
  });
}

/**
 * Converts a raw markdown body into an HTML fragment (no `<html>`/`<body>`
 * wrapper). `markdown` is expected to be exactly what `getCachedMarkdown`
 * returns — frontmatter included — see `./frontmatter` for why cutting it
 * happens here rather than in the cache layer.
 */
export function renderMarkdownToHtml(markdown: string): string {
  ensureRendererInstalled();
  return marked.parse(stripFrontmatter(markdown), { async: false });
}

const HLJS_THEME_LIGHT = `pre code.hljs{display:block;overflow-x:auto;padding:1em}code.hljs{padding:3px 5px}.hljs{color:#24292e;background:#fff}.hljs-doctag,.hljs-keyword,.hljs-meta .hljs-keyword,.hljs-template-tag,.hljs-template-variable,.hljs-type,.hljs-variable.language_{color:#d73a49}.hljs-title,.hljs-title.class_,.hljs-title.class_.inherited__,.hljs-title.function_{color:#6f42c1}.hljs-attr,.hljs-attribute,.hljs-literal,.hljs-meta,.hljs-number,.hljs-operator,.hljs-selector-attr,.hljs-selector-class,.hljs-selector-id,.hljs-variable{color:#005cc5}.hljs-meta .hljs-string,.hljs-regexp,.hljs-string{color:#032f62}.hljs-built_in,.hljs-symbol{color:#e36209}.hljs-code,.hljs-comment,.hljs-formula{color:#6a737d}.hljs-name,.hljs-quote,.hljs-selector-pseudo,.hljs-selector-tag{color:#22863a}.hljs-subst{color:#24292e}.hljs-section{color:#005cc5;font-weight:700}.hljs-bullet{color:#735c0f}.hljs-emphasis{color:#24292e;font-style:italic}.hljs-strong{color:#24292e;font-weight:700}.hljs-addition{color:#22863a;background-color:#f0fff4}.hljs-deletion{color:#b31d28;background-color:#ffeef0}`;

const HLJS_THEME_DARK = `pre code.hljs{display:block;overflow-x:auto;padding:1em}code.hljs{padding:3px 5px}.hljs{color:#c9d1d9;background:#0d1117}.hljs-doctag,.hljs-keyword,.hljs-meta .hljs-keyword,.hljs-template-tag,.hljs-template-variable,.hljs-type,.hljs-variable.language_{color:#ff7b72}.hljs-title,.hljs-title.class_,.hljs-title.class_.inherited__,.hljs-title.function_{color:#d2a8ff}.hljs-attr,.hljs-attribute,.hljs-literal,.hljs-meta,.hljs-number,.hljs-operator,.hljs-selector-attr,.hljs-selector-class,.hljs-selector-id,.hljs-variable{color:#79c0ff}.hljs-meta .hljs-string,.hljs-regexp,.hljs-string{color:#a5d6ff}.hljs-built_in,.hljs-symbol{color:#ffa657}.hljs-code,.hljs-comment,.hljs-formula{color:#8b949e}.hljs-name,.hljs-quote,.hljs-selector-pseudo,.hljs-selector-tag{color:#7ee787}.hljs-subst{color:#c9d1d9}.hljs-section{color:#1f6feb;font-weight:700}.hljs-bullet{color:#f2cc60}.hljs-emphasis{color:#c9d1d9;font-style:italic}.hljs-strong{color:#c9d1d9;font-weight:700}.hljs-addition{color:#aff5b4;background-color:#033a16}.hljs-deletion{color:#ffdcd7;background-color:#67060c}`;

/**
 * Best-effort, network-dependent: loads mermaid from a CDN and renders every
 * `.language-mermaid`/`.language-mmd` code block into an SVG diagram, the
 * same target class names the blog's own ContentRenderer.tsx looks for.
 *
 * Offline (or the CDN otherwise unreachable), the `<script>` tag simply
 * fails to load and this code never runs — the mermaid SOURCE, already
 * rendered as a plain (HTML-escaped) code block by `renderMarkdownToHtml`
 * above, stays visible instead of a diagram. That degradation is
 * deliberate: the rest of the article (text, tables, syntax-highlighted
 * code) is produced entirely on the RN side with no network dependency, so
 * an already-opened article stays readable offline — only mermaid diagrams
 * specifically are best-effort.
 */
const MERMAID_SCRIPT_TAG = `<script src="${MERMAID_CDN_URL}" onload="
  try {
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
    var blocks = document.querySelectorAll('pre code.language-mermaid, pre code.language-mmd');
    blocks.forEach(function (block, i) {
      var source = block.textContent;
      mermaid.render('mermaid-' + i, source).then(function (result) {
        var wrapper = document.createElement('div');
        wrapper.className = 'mermaid-diagram';
        wrapper.innerHTML = result.svg;
        block.closest('pre').replaceWith(wrapper);
      }).catch(function () {
        // Leave the original code block in place — same fallback as the CDN-load-failure case.
      });
    });
  } catch (e) {
    // mermaid loaded but failed to initialize — leave the raw code blocks as-is.
  }
"></script>`;

const BASE_CSS = `
  :root { color-scheme: light dark; }
  body {
    margin: 0;
    padding: 16px;
    font-family: -apple-system, Roboto, "Segoe UI", sans-serif;
    font-size: 17px;
    line-height: 1.65;
    word-wrap: break-word;
  }
  h1, h2, h3, h4 { line-height: 1.3; margin-top: 1.6em; margin-bottom: 0.5em; }
  h1 { font-size: 1.6em; }
  h2 { font-size: 1.35em; }
  h3 { font-size: 1.15em; }
  p, ul, ol, blockquote, table, .mermaid-diagram { margin-top: 0; margin-bottom: 1.1em; }
  img { max-width: 100%; height: auto; border-radius: 8px; }
  pre { border-radius: 8px; }
  pre code.hljs, pre code.language-mermaid, pre code.language-mmd {
    font-family: ui-monospace, Menlo, monospace;
    font-size: 0.85em;
  }
  code:not(.hljs):not(.language-mermaid):not(.language-mmd) {
    font-family: ui-monospace, Menlo, monospace;
    font-size: 0.85em;
    padding: 0.15em 0.4em;
    border-radius: 4px;
  }
  table { border-collapse: collapse; width: 100%; display: block; overflow-x: auto; }
  th, td { border: 1px solid; padding: 6px 10px; text-align: left; }
  blockquote { border-left: 4px solid; margin-left: 0; padding-left: 1em; }
  .mermaid-diagram { text-align: center; overflow-x: auto; }
  .mermaid-diagram svg { max-width: 100%; }
`;

const LIGHT_THEME_CSS = `
  body { background: #ffffff; color: #000000; }
  code:not(.hljs):not(.language-mermaid):not(.language-mmd) { background: #F0F0F3; }
  th, td, blockquote { border-color: #E0E1E6; }
  a { color: #3c87f7; }
`;

const DARK_THEME_CSS = `
  body { background: #000000; color: #ffffff; }
  code:not(.hljs):not(.language-mermaid):not(.language-mmd) { background: #212225; }
  th, td, blockquote { border-color: #2E3135; }
  a { color: #6ba7ff; }
`;

export type ArticleColorScheme = "light" | "dark";

/**
 * Assembles a full, standalone HTML document for `ArticleWebView` to load
 * via `source={{ html }}`: base typography matching the app's own light/dark
 * palette (`@/constants/theme`'s color values — duplicated as literals here
 * rather than imported, since this module has to stay import-free of
 * react-native to run under a plain Node test), highlight.js's theme CSS
 * (bundled, not from a CDN — see `renderMarkdownToHtml`), and the
 * best-effort mermaid script.
 */
export function buildArticleDocument(options: {
  title: string;
  markdown: string;
  colorScheme: ArticleColorScheme;
}): string {
  const { title, markdown, colorScheme } = options;
  const contentHtml = renderMarkdownToHtml(markdown);
  const hljsTheme = colorScheme === "dark" ? HLJS_THEME_DARK : HLJS_THEME_LIGHT;
  const themeCss = colorScheme === "dark" ? DARK_THEME_CSS : LIGHT_THEME_CSS;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<title>${escapeHtml(title)}</title>
<style>${BASE_CSS}${themeCss}${hljsTheme}</style>
</head>
<body>
${contentHtml}
${MERMAID_SCRIPT_TAG}
</body>
</html>`;
}

/**
 * Cuts a leading YAML frontmatter block from a raw markdown body.
 *
 * `fetchMarkdown`/`getCachedMarkdown` (src/api/client.ts, src/api/cache.ts)
 * return the CMS's raw content file, verbatim — the Content API deliberately
 * serves it unparsed, since the frontmatter is itself the source of
 * `index.json`'s metadata (verified live, 2026-09-18: every markdown file
 * this API serves opens with a `---`-delimited YAML block containing `id`,
 * `title`, `slug`, `author`, etc.). Cutting it is the app's job, not the
 * API's.
 *
 * Caught by manual on-device verification (iOS Simulator, Expo Go, SDK 57):
 * without this, the frontmatter rendered as a giant bold paragraph at the
 * top of every article — a markdown parser reads the closing `---` as a
 * setext heading underline for whatever text sits above it.
 *
 * Deliberately applied at render time (`renderMarkdownToHtml`, below in
 * this module's sibling), not at cache-write time in cache.ts: the cached
 * file stays a faithful, unmodified copy of exactly what the server
 * returned, which is one less thing that could drift from the real
 * contract if this stripping logic ever changes.
 */
export function stripFrontmatter(markdown: string): string {
  // Anchored to the very START of the string (no `m` flag): only a
  // frontmatter block opening on the file's first line is eligible. A
  // `---` used as a horizontal rule further down in the body is never even
  // examined by this regex, because it isn't at position 0.
  //
  // `[\s\S]*?` (lazy) between the delimiters stops at the FIRST line that
  // is exactly `---`, which for well-formed frontmatter is its own closing
  // delimiter — so a horizontal rule appearing later in the body (AFTER the
  // real close) is never reached by this match and is left alone.
  const frontmatterPattern = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;
  return markdown.replace(frontmatterPattern, "");
}

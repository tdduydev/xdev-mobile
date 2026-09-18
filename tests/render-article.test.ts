import { describe, expect, it } from "vitest";
import { buildArticleDocument, renderMarkdownToHtml } from "../src/content/render-article";

// This is Step 7's "smoke test render một bài" — rather than mounting the
// ArticleWebView RN component (no jsdom/RN test renderer is configured in
// this project, and standing one up just for this would be a heavy
// dependency for one smoke test), it exercises the actual markdown → HTML
// conversion `ArticleWebView` calls, against the three content shapes the
// task specifically named: a fenced code block with a language, a GFM
// table, and a ```mermaid block.

describe("renderMarkdownToHtml: fenced code blocks", () => {
  it("highlights a code fence with a known language via highlight.js", () => {
    const html = renderMarkdownToHtml("```js\nconst a = 1;\n```\n");
    expect(html).toContain('class="hljs language-js"');
    expect(html).toContain('class="hljs-keyword"'); // proof highlight.js actually ran, not just wrapped in <pre>
  });

  it("falls back to auto-detection for a fence with no language tag, without throwing", () => {
    expect(() => renderMarkdownToHtml("```\nplain text block\n```\n")).not.toThrow();
    const html = renderMarkdownToHtml("```\nplain text block\n```\n");
    expect(html).toContain('<pre><code class="hljs">');
    // highlight.js's auto-detection can wrap individual tokens in <span>
    // elements even for prose, so check the words survived rather than the
    // exact substring, which highlighting spans would otherwise break up.
    const textOnly = html.replace(/<[^>]+>/g, "");
    expect(textOnly).toContain("plain");
    expect(textOnly).toContain("text");
    expect(textOnly).toContain("block");
  });
});

describe("renderMarkdownToHtml: GFM tables", () => {
  it("renders a table with th/td cells", () => {
    const html = renderMarkdownToHtml("| A | B |\n| --- | --- |\n| 1 | 2 |\n");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>A</th>");
    expect(html).toContain("<td>1</td>");
  });
});

describe("renderMarkdownToHtml: mermaid fences", () => {
  it("leaves a mermaid fence as an escaped, unhighlighted code block for the client-side script to find", () => {
    const html = renderMarkdownToHtml("```mermaid\ngraph TD;\n  A-->B;\n```\n");
    expect(html).toContain('class="language-mermaid"');
    expect(html).toContain("graph TD;");
    // Not run through highlight.js — no hljs-* spans should appear here.
    expect(html).not.toContain("hljs-");
  });

  it("HTML-escapes mermaid source instead of passing it through raw", () => {
    const html = renderMarkdownToHtml("```mermaid\nA[\"<script>\"] --> B\n```\n");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("renderMarkdownToHtml: images and links (root-relative content paths)", () => {
  // Observed directly in live content (2026-09-18):
  // content/blog/devops/docker-swarm-hay-kubernetes-chon-the-nao.md uses
  // exactly this root-relative image shape.
  it("resolves a root-relative image src against the site origin, not API_BASE", () => {
    const html = renderMarkdownToHtml("![alt text](/images/blog/swarm-k8s-dieu-phoi.png)");
    expect(html).toContain('src="https://blog.xdev.asia/images/blog/swarm-k8s-dieu-phoi.png"');
    expect(html).not.toContain("/api/v1");
  });

  it("resolves a root-relative internal link the same way", () => {
    const html = renderMarkdownToHtml("[bài outbox](/blog/outbox-va-giao-dung-mot-lan)");
    expect(html).toContain('href="https://blog.xdev.asia/blog/outbox-va-giao-dung-mot-lan"');
  });

  it("leaves an absolute link untouched", () => {
    const html = renderMarkdownToHtml("[external](https://example.com/page)");
    expect(html).toContain('href="https://example.com/page"');
  });

  it("leaves a fragment link untouched rather than mangling it against the site origin", () => {
    const html = renderMarkdownToHtml("[jump](#section)");
    expect(html).toContain('href="#section"');
  });
});

describe("renderMarkdownToHtml: leading YAML frontmatter", () => {
  // Verified live 2026-09-18, and caught by on-device manual verification
  // (iOS Simulator, Expo Go): the raw markdown this API serves opens with a
  // `---`-delimited frontmatter block (id, title, slug, author, …), and
  // without stripping it, a markdown parser reads the closing `---` as a
  // setext heading underline — the whole block rendered as one giant bold
  // paragraph at the top of the article.
  const withFrontmatter = `---
id: 019fefa0-60af-7818-8473-9d42ce7cdc28
title: 'Idempotent là điều kiện, không phải trang trí'
slug: idempotent-la-dieu-kien
featured_image: /images/blog/idempotent-la-dieu-kien/cover.png
---

Chào anh em. Bài này về một chữ mà tôi nghĩ đang bị đối xử sai.
`;

  it("does not leak frontmatter fields into the rendered HTML", () => {
    const html = renderMarkdownToHtml(withFrontmatter);
    expect(html).not.toContain("id:");
    expect(html).not.toContain("title:");
    expect(html).not.toContain("slug:");
    expect(html).not.toContain("featured_image:");
  });

  it("renders the real article body that follows the frontmatter", () => {
    const html = renderMarkdownToHtml(withFrontmatter);
    expect(html).toContain("Chào anh em.");
  });

  it("does not swallow a --- horizontal rule inside the body", () => {
    const withBodyRule = "---\ntitle: Foo\n---\n\nFirst.\n\n---\n\nSecond, after a rule.\n";
    const html = renderMarkdownToHtml(withBodyRule);
    expect(html).not.toContain("title:");
    expect(html).toContain("First.");
    expect(html).toContain("<hr>");
    expect(html).toContain("Second, after a rule.");
  });
});

describe("buildArticleDocument", () => {
  it("assembles a full document with the title, content, and a mermaid script tag", () => {
    const html = buildArticleDocument({
      title: "Idempotent là điều kiện",
      markdown: "# Heading\n\nSome body text.\n",
      colorScheme: "light",
    });
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Idempotent là điều kiện");
    expect(html).toContain("Some body text.");
    expect(html).toContain("cdn.jsdelivr.net/npm/mermaid");
  });

  it("switches embedded theme CSS by colorScheme", () => {
    const light = buildArticleDocument({ title: "T", markdown: "x", colorScheme: "light" });
    const dark = buildArticleDocument({ title: "T", markdown: "x", colorScheme: "dark" });
    expect(light).toContain("background: #ffffff");
    expect(dark).toContain("background: #000000");
  });
});

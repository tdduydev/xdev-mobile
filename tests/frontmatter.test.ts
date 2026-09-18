import { describe, expect, it } from "vitest";
import { stripFrontmatter } from "../src/content/frontmatter";

// Verified live 2026-09-18: `fetchMarkdown`'s response
// (`{API_BASE}/{path}`) is the raw content file, frontmatter included — the
// API deliberately serves it unparsed (frontmatter IS the source of
// index.json's metadata). The app is responsible for cutting it before
// rendering. Caught by manual on-device verification (iOS Simulator, Expo
// Go): the frontmatter YAML rendered as a giant bold paragraph at the top
// of every article, because the closing `---` reads as a setext heading
// marker to a markdown parser.
const REAL_SAMPLE = `---
id: 019fefa0-60af-7818-8473-9d42ce7cdc28
title: 'Idempotent là điều kiện, không phải trang trí'
slug: idempotent-la-dieu-kien
excerpt: >-
  Cú gọi gốc có thể THÀNH CÔNG mà phản hồi không về được.
featured_image: /images/blog/idempotent-la-dieu-kien/cover.png
type: blog
author: {id: 019c9616-d2b4-713f-9b2c-40e2e92a05cf, name: Duy Tran, avatar: avatars/foo.jpeg}
tags: [{name: Microservices, slug: microservices}]
comments: []
---

Chào anh em. Bài này về một chữ mà tôi nghĩ đang bị đối xử sai: **idempotent**.

## Định nghĩa
`;

describe("stripFrontmatter", () => {
  it("removes a leading YAML frontmatter block delimited by --- ... ---", () => {
    const result = stripFrontmatter(REAL_SAMPLE);
    expect(result).not.toContain("id:");
    expect(result).not.toContain("title:");
    expect(result).not.toContain("slug:");
    expect(result).not.toContain("featured_image:");
    expect(result.trimStart()).toMatch(/^Chào anh em\./);
  });

  it("handles \\r\\n line endings the same way", () => {
    const withCrlf = REAL_SAMPLE.replace(/\n/g, "\r\n");
    const result = stripFrontmatter(withCrlf);
    expect(result).not.toContain("slug:");
    expect(result.trimStart()).toMatch(/^Chào anh em\./);
  });

  it("does NOT cut a --- horizontal rule that appears in the body, only a leading frontmatter block", () => {
    const withBodyRule = `---
title: Foo
---

First paragraph.

---

Second paragraph, after a horizontal rule.
`;
    const result = stripFrontmatter(withBodyRule);
    expect(result).not.toContain("title:");
    expect(result).toContain("First paragraph.");
    expect(result).toContain("---");
    expect(result).toContain("Second paragraph, after a horizontal rule.");
  });

  it("leaves markdown with no frontmatter untouched", () => {
    const noFrontmatter = "# Just a heading\n\nSome text.\n";
    expect(stripFrontmatter(noFrontmatter)).toBe(noFrontmatter);
  });

  it("leaves a body-only horizontal rule at the very start untouched when there is no real frontmatter to close it", () => {
    // Pathological input this API has never been observed to produce (every
    // file it serves has frontmatter — see the module doc), included as a
    // documented limitation rather than silently assumed away.
    const noClosingDelimiter = "---\n\nJust a rule, then prose, no second ---.\n";
    expect(stripFrontmatter(noClosingDelimiter)).toBe(noClosingDelimiter);
  });
});

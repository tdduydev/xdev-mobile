import { describe, expect, it } from "vitest";
import { API_BASE, resolveAssetUrl, SITE_BASE } from "../src/api/config";

// featuredImage/avatar hang off the SITE root (https://blog.xdev.asia), not
// API_BASE (https://blog.xdev.asia/api/v1) — this is the exact mistake the
// task brief warned would bite if assumed.
describe("SITE_BASE", () => {
  it("is the API origin, distinct from API_BASE's /api/v1 path", () => {
    expect(SITE_BASE).toBe("https://blog.xdev.asia");
    expect(API_BASE).toBe("https://blog.xdev.asia/api/v1");
    expect(SITE_BASE).not.toBe(API_BASE);
  });
});

describe("resolveAssetUrl", () => {
  it("passes null through unchanged", () => {
    expect(resolveAssetUrl(null)).toBeNull();
  });

  it("resolves a root-relative path against SITE_BASE, not API_BASE", () => {
    const resolved = resolveAssetUrl("/images/blog/foo-featured.png");
    expect(resolved).toBe("https://blog.xdev.asia/images/blog/foo-featured.png");
    expect(resolved).not.toContain("/api/v1");
  });

  it("passes an already-absolute URL through unchanged", () => {
    const absolute = "https://cdn.example.com/avatars/foo.jpeg";
    expect(resolveAssetUrl(absolute)).toBe(absolute);
  });

  it("passes an absolute http:// URL through unchanged too", () => {
    const absolute = "http://cdn.example.com/avatars/foo.jpeg";
    expect(resolveAssetUrl(absolute)).toBe(absolute);
  });
});

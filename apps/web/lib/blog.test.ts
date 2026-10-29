import { describe, expect, it } from "vitest";
import { getPosts, parsePost, readingMinutes, renderPost, rssFeed } from "./blog";

const RAW = `---
title: "Deadlines & time zones: a \\"hard\\" problem"
date: 2026-11-02
description: Why 23:59 is not one moment.
---

Intro with **bold**.

| A | B |
|---|---|
| 1 | 2 |
`;

describe("parsePost", () => {
  it("reads quoted and bare frontmatter values and keeps the body", () => {
    const post = parsePost("deadlines", RAW);
    expect(post).toMatchObject({ slug: "deadlines", title: 'Deadlines & time zones: a "hard" problem', date: "2026-11-02", description: "Why 23:59 is not one moment." });
    expect(post.body.startsWith("Intro with")).toBe(true);
  });
  it("rejects a post without a valid date", () => {
    expect(() => parsePost("x", RAW.replace("2026-11-02", "soon"))).toThrow(/date/);
    expect(() => parsePost("x", "No frontmatter")).toThrow(/frontmatter/);
  });
  it("renders Markdown tables", () => {
    expect(renderPost(parsePost("d", RAW))).toContain("<table>");
  });
});

describe("the posts on disk", () => {
  const posts = getPosts();
  it("all parse, with unique slugs, newest first", () => {
    expect(posts.length).toBeGreaterThan(0);
    expect(new Set(posts.map((p) => p.slug)).size).toBe(posts.length);
    expect([...posts].sort((a, b) => b.date.localeCompare(a.date)).map((p) => p.slug)).toEqual(posts.map((p) => p.slug));
    for (const p of posts) {
      expect(p.slug).toMatch(/^[a-z0-9-]+$/);
      expect(readingMinutes(p)).toBeGreaterThan(0);
    }
  });
  it("do not repeat the title as a heading in the body", () => {
    for (const p of posts) expect(p.body).not.toMatch(/^# /m);
  });
});

describe("rssFeed", () => {
  it("escapes titles and links each post", () => {
    const feed = rssFeed([parsePost("deadlines", RAW)], "https://example.org");
    expect(feed).toContain("<title>Deadlines &amp; time zones: a &quot;hard&quot; problem</title>");
    expect(feed).toContain("<link>https://example.org/blog/deadlines</link>");
    expect(feed).toContain("<pubDate>Mon, 02 Nov 2026 00:00:00 GMT</pubDate>");
  });
});

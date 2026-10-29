import { describe, expect, it } from "vitest";
import { embedUrl, splitMedia } from "./media";

describe("embedUrl", () => {
  it.each([
    ["https://www.youtube.com/watch?v=abc123DEF45", "https://www.youtube-nocookie.com/embed/abc123DEF45"],
    ["https://youtu.be/abc123DEF45?t=30", "https://www.youtube-nocookie.com/embed/abc123DEF45"],
    ["https://m.youtube.com/shorts/abc123DEF45", "https://www.youtube-nocookie.com/embed/abc123DEF45"],
    ["https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk", "https://open.spotify.com/embed/episode/4rOoJ6Egrf8K2IrywzwOMk"],
  ])("embeds %s", (url, embed) => {
    expect(embedUrl(url)).toBe(embed);
  });
  it.each(["https://vimeo.com/123", "https://www.youtube.com/watch?v=short", "https://evil.example/youtube.com/watch?v=abc123DEF45", "not a url", null])("links out for %s", (url) => {
    expect(embedUrl(url)).toBeNull();
  });
});

describe("splitMedia", () => {
  const now = new Date("2026-11-01T00:00:00Z");
  const item = (id: string, kind: string, url: string | null, starts_at: string | null, published_at = "2026-10-01T00:00:00Z") => ({ id, kind, title: id, url, starts_at, published_at });
  it("lists coming webinars soonest first, and recordings newest first", () => {
    const { upcoming, recordings } = splitMedia(
      [
        item("later", "webinar", null, "2026-12-01T10:00:00Z"),
        item("soon", "webinar", "https://example.org/event", "2026-11-05T10:00:00Z"),
        item("past-recorded", "webinar", "https://youtu.be/abc123DEF45", "2026-10-20T10:00:00Z"),
        item("past-no-recording", "webinar", null, "2026-10-10T10:00:00Z"),
        item("video", "video", "https://youtu.be/abc123DEF45", null, "2026-10-25T00:00:00Z"),
      ],
      now,
    );
    expect(upcoming.map((i) => i.id)).toEqual(["soon", "later"]);
    expect(recordings.map((i) => i.id)).toEqual(["video", "past-recorded"]);
  });
});

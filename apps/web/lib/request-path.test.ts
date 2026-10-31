import { describe, expect, it } from "vitest";
import { PATH_HEADER, isAppPath, withPathHeader } from "./request-path";

const req = (path: string, headers: Record<string, string> = {}) => ({ headers: new Headers(headers), nextUrl: { pathname: path } });

describe("withPathHeader", () => {
  it("sets the header to the request's real path", () => {
    expect(withPathHeader(req("/app/tracker")).get(PATH_HEADER)).toBe("/app/tracker");
  });

  it("replaces a path the client sent", () => {
    const headers = withPathHeader(req("/courses/x", { [PATH_HEADER]: "/app" }));
    expect(headers.get(PATH_HEADER)).toBe("/courses/x");
  });

  it("keeps the other headers and leaves the original untouched", () => {
    const original = req("/app", { cookie: "a=1" });
    const headers = withPathHeader(original);
    expect(headers.get("cookie")).toBe("a=1");
    expect(original.headers.get(PATH_HEADER)).toBeNull();
  });
});

describe("isAppPath", () => {
  it("covers /app and its pages only", () => {
    expect(isAppPath("/app")).toBe(true);
    expect(isAppPath("/app/tracker/1")).toBe(true);
    expect(isAppPath("/applications")).toBe(false);
    expect(isAppPath("/courses/x")).toBe(false);
    expect(isAppPath(null)).toBe(false);
  });
});

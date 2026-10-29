import { describe, expect, it } from "vitest";
import { fileProblem, MAX_BYTES, moved, objectPath } from "./portfolio";

describe("portfolio files", () => {
  it("accepts PNG, JPEG and PDF up to 10 MB", () => {
    expect(fileProblem({ type: "application/pdf", size: MAX_BYTES })).toBeNull();
    expect(fileProblem({ type: "image/jpeg", size: 1 })).toBeNull();
    expect(fileProblem({ type: "video/mp4", size: 1 })).toMatch(/PNG, JPEG or PDF/);
    expect(fileProblem({ type: "image/png", size: MAX_BYTES + 1 })).toMatch(/over 10 MB/);
    expect(fileProblem({ type: "image/png", size: 0 })).toMatch(/empty/);
  });
  it("stores files under the owner's folder with a random name", () => {
    expect(objectPath("u1", "image/jpeg", "abc")).toBe("u1/abc.jpg");
  });
});

describe("moved", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
  it("swaps with the neighbour", () => {
    expect(moved(items, "b", "up").map((x) => x.id)).toEqual(["b", "a", "c"]);
    expect(moved(items, "b", "down")).toEqual([{ id: "a", sort: 0 }, { id: "c", sort: 1 }, { id: "b", sort: 2 }]);
  });
  it("leaves the order alone at the ends", () => {
    expect(moved(items, "a", "up").map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(moved(items, "c", "down").map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});

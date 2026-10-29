import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("writes a header and rows in column order", () => {
    expect(toCsv([{ b: 2, a: "x" }], ["a", "b"])).toBe("a,b\r\nx,2\r\n");
  });
  it("quotes commas, quotes and newlines (RFC 4180)", () => {
    expect(toCsv([{ a: 'say "hi", ok\nbye' }], ["a"])).toBe('a\r\n"say ""hi"", ok\nbye"\r\n');
  });
  it("escapes formula cells", () => {
    for (const bad of ["=1+1", "+SUM(A1)", "-2", "@cmd", "\tx"]) {
      expect(toCsv([{ a: bad }], ["a"])).toContain(`'${bad}`);
    }
  });
  it("writes null and missing values as empty, and keeps negative numbers", () => {
    expect(toCsv([{ a: null }, {}], ["a"])).toBe("a\r\n\r\n\r\n");
    expect(toCsv([{ a: -5 }], ["a"])).toBe("a\r\n-5\r\n");
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { extractProfile, keepQuoted } = await import("./profile-extract");

const CV = "Education: B.Tech Computer Science, VIT Vellore, CGPA 8.7/10 (2025).\nIELTS Academic 7.5 (Writing 7.0), March 2026.";

describe("keepQuoted", () => {
  it("drops items whose quote is not in the pasted text", () => {
    const result = keepQuoted(
      {
        qualification: { code: "bachelor_4yr", grade_value: 8.7, grade_text: "8.7/10", grade_scale: "gpa_10", confidence: 0.9, quote: "CGPA 8.7/10" },
        test_scores: [
          { exam: "ielts_academic", exam_version: null, total: 7.5, taken_on: "2026-03-01", sections: [], confidence: 0.9, quote: "IELTS Academic 7.5" },
          { exam: "gre", exam_version: null, total: 330, taken_on: null, sections: [], confidence: 0.5, quote: "GRE 330" },
        ],
      },
      CV,
    );
    expect(result.qualification?.grade_value).toBe(8.7);
    expect(result.test_scores.map((s) => s.exam)).toEqual(["ielts_academic"]);
  });
});

describe("extractProfile", () => {
  it("calls Haiku 5.5 with a schema, low effort and the CV fenced as data", async () => {
    const parse = vi.fn().mockResolvedValue({
      stop_reason: "end_turn",
      usage: { input_tokens: 1000, output_tokens: 100 },
      parsed_output: { qualification: null, test_scores: [] },
    });
    const run = await extractProfile(CV, { messages: { parse } } as never);
    const request = parse.mock.calls[0]![0];
    expect(request.model).toBe("claude-haiku-5-5");
    expect(request.output_config.effort).toBe("low");
    expect(request.output_config.format.type).toBe("json_schema");
    expect(request).not.toHaveProperty("temperature");
    expect(request.messages[0].content).toContain("<cv>");
    expect(run.costUsd).toBeCloseTo((1000 * 0.1 + 100 * 0.5) / 1e6);
    expect(run.inputHash).toHaveLength(64);
  });

  it("returns nothing on a refusal", async () => {
    const parse = vi.fn().mockResolvedValue({ stop_reason: "refusal", usage: { input_tokens: 10, output_tokens: 0 }, parsed_output: null });
    expect((await extractProfile(CV, { messages: { parse } } as never)).extraction).toBeNull();
  });
});

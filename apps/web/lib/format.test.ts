import { describe, expect, it } from "vitest";
import { waiverAmount } from "./format";

describe("waiverAmount", () => {
  it("formats a null amount as fee waived", () => expect(waiverAmount(null, null)).toBe("Fee waived"));
  it("formats a partial waiver", () => expect(waiverAmount(50, "USD")).toBe("$50 off"));
});

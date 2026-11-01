// Plan A2.3: nothing is ever generated. There is no path from the suggestion function to a field's text: the
// function answers only with a role from the list it was sent, the extension keeps only a role name, and an
// essay field is only ever offered the student's own final draft.
import { describe, expect, it } from "vitest";
import { OUTPUT_SCHEMA, pickRole } from "../../../supabase/functions/suggest-field-role/logic.ts";
import { suggestionFrom } from "../src/suggest";

describe("no path from the suggestion function to a field's text", () => {
  it("the model can only answer with one of the roles sent, or none", () => {
    const schema = OUTPUT_SCHEMA(["contact.email", "essay.personal_statement"]);
    expect(schema.properties.role.enum).toEqual(["contact.email", "essay.personal_statement", "none"]);
    expect(schema.additionalProperties).toBe(false);
    expect(pickRole('{"role":"Dear admissions team, I have always wanted"}', ["essay.personal_statement"])).toBeNull();
  });

  it("the extension keeps only a known role name from the answer, never any text", () => {
    expect(suggestionFrom(200, { role: "essay.personal_statement", text: "An essay the model wrote" })).toEqual({
      outcome: "role",
      role: "essay.personal_statement",
    });
    expect(suggestionFrom(200, { role: "Here is a personal statement you could use: ..." })).toEqual({ outcome: "none" });
    expect(suggestionFrom(200, { essay: "Generated words" })).toEqual({ outcome: "none" });
    expect(suggestionFrom(429, null)).toEqual({ outcome: "limit" });
    expect(suggestionFrom(502, { error: "model_failed" })).toEqual({ outcome: "unavailable" });
  });
});

import { describe, expect, it } from "vitest";
import { identifyPage, matchPage, type Adapter, type FieldMatch } from "../src/index";
import { practice } from "../src/practice/index";
import map from "../practice/map.json" with { type: "json" };
import { fixture, page } from "./helpers";

const byKey = (ms: FieldMatch[]) => Object.fromEntries(ms.map((m) => [m.index ? `${m.role}#${m.index}` : m.key, m]));

/** An adapter for a portal we have no map for: label rules only. */
const unmapped: Adapter = { ...practice, portal: "unmapped", map: { ...practice.map, portal: "unmapped", pages: [] } };

describe("map first: every mapped field gets its role", () => {
  // The states where every field on the page is visible.
  const STATES = ["about-you", "schooling--studying", "tests--taken", "activities", "statement", "security-check", "fee--waiver", "declaration"];
  for (const state of STATES) {
    it(state, () => {
      const pageId = state.split("--")[0]!;
      const mapped = map.pages.find((p) => p.id === pageId)!.fields;
      const got = matchPage(fixture(state), practice);
      expect(got.map((m) => m.role)).toEqual(mapped.map((f) => f.role));
      for (const m of got) {
        expect(m.via).toBe("map");
        expect(m.confidence).toBe(1);
      }
    });
  }

  it("keeps the map's action for each field, so never and pause fields stay that way", () => {
    const decl = byKey(matchPage(fixture("declaration"), practice));
    expect(decl["field-declare"]!.action).toBe("never");
    expect(decl["field-signed_name"]!.action).toBe("never");
    expect(byKey(matchPage(fixture("security-check"), practice))["field-check_word"]!.action).toBe("pause");
  });

  it("gives labels in page order with whitespace trimmed", () => {
    const got = byKey(matchPage(fixture("schooling--studying"), practice));
    expect(got["still_studying"]!.label).toBe("Are you still studying there?");
    expect(got["still_studying"]!.options).toEqual([
      { value: "yes", text: "Yes" },
      { value: "no", text: "No" },
    ]);
  });
});

describe("conditional fields count only while visible", () => {
  it("hides the completion date until 'still studying' is yes", () => {
    expect(matchPage(fixture("schooling"), practice).map((m) => m.role)).not.toContain("education.expected_completion");
    expect(matchPage(fixture("schooling--studying"), practice).map((m) => m.role)).toContain("education.expected_completion");
  });

  it("hides the test details until a test has been taken", () => {
    expect(matchPage(fixture("tests"), practice).map((m) => m.role)).toEqual(["tests.english.taken"]);
    expect(matchPage(fixture("tests--taken"), practice)).toHaveLength(4);
  });

  it("can list hidden fields when asked, marked not visible", () => {
    const all = matchPage(fixture("fee"), practice, { includeHidden: true });
    expect(all.find((m) => m.role === "fee.waiver_reason")?.visible).toBe(false);
  });
});

describe("repeated groups match in order", () => {
  it("numbers each activity entry by its place on the page", () => {
    const got = matchPage(fixture("activities--two"), practice);
    expect(got.map((m) => `${m.role}#${m.index}`)).toEqual([
      "activities[].role#1",
      "activities[].organisation#1",
      "activities[].description#1",
      "activities[].role#2",
      "activities[].organisation#2",
      "activities[].description#2",
    ]);
    expect(got[3]!.key).toBe("field-activity_2_role");
  });

  it("numbers label-matched repeats in page order too", () => {
    const doc = page(`<h1>Your activities</h1>
      <label for="a">Position</label><input id="a"><label for="b">Organization</label><input id="b">
      <label for="c">Position</label><input id="c"><label for="d">Organization</label><input id="d">`);
    expect(matchPage(doc, unmapped).map((m) => `${m.role}#${m.index}`)).toEqual([
      "activities[].role#1",
      "activities[].organisation#1",
      "activities[].role#2",
      "activities[].organisation#2",
    ]);
  });
});

describe("label rules for fields not in the map", () => {
  it("matches the practice pages by label alone, below map confidence", () => {
    const got = byKey(matchPage(fixture("about-you"), unmapped));
    expect(got["field-email"]).toMatchObject({ role: "contact.email", via: "label" });
    expect(got["field-email"]!.confidence).toBeLessThan(1);
    expect(got["field-given_names"]!.role).toBe("person.given_names");
    expect(got["field-country_of_residence"]!.role).toBe("contact.residence_country");
  });

  it("knows other wordings for the same thing", () => {
    const doc = page(`<label for="f">First name</label><input id="f">
      <label for="s">Surname</label><input id="s">
      <label>E-mail address <input id="e" type="email"></label>
      <input id="c" aria-label="Country of residence">`);
    expect(matchPage(doc, unmapped).map((m) => m.role)).toEqual([
      "person.given_names",
      "person.family_name",
      "contact.email",
      "contact.residence_country",
    ]);
  });

  it("uses the section for words that are ambiguous on their own", () => {
    const english = page(`<h1>English language test</h1><label for="o">Overall score</label><input id="o">`);
    const other = page(`<h1>Your interests</h1><label for="o">Overall score</label><input id="o">`);
    expect(matchPage(english, unmapped)[0]!.role).toBe("tests.english.total");
    expect(matchPage(other, unmapped)[0]!.role).toBeNull();
  });

  it("prefers a never or pause role when a label could be either", () => {
    // "full name" alone would be a name, but this one signs the declaration.
    const doc = page(`<label for="n">Type your full name to sign</label><input id="n">`);
    expect(matchPage(doc, unmapped)[0]).toMatchObject({ role: "declaration.signature", action: "never" });
  });
});

describe("unknown and off-limits fields", () => {
  it("leaves an unknown field unmatched", () => {
    const doc = fixture("about-you");
    doc.querySelector("form[data-page]")!.insertAdjacentHTML(
      "beforeend",
      `<label for="field-favourite_colour">Favourite colour</label><input id="field-favourite_colour" name="favourite_colour">`,
    );
    const m = byKey(matchPage(doc, practice))["field-favourite_colour"]!;
    expect(m).toMatchObject({ role: null, via: "none", confidence: 0 });
  });

  it("never matches a password field, even on a sign-in page", () => {
    const got = byKey(matchPage(fixture("sign-in"), practice, { includeHidden: true }));
    expect(got["password"]).toMatchObject({ role: null, action: "never" });
  });
});

describe("which page is this", () => {
  it("recognises each form page and checks it against the map", () => {
    expect(identifyPage(fixture("schooling"), practice)).toEqual({ kind: "form", pageId: "schooling", matchesMap: true });
    expect(identifyPage(fixture("fee"), practice)).toEqual({ kind: "fee", pageId: "fee", matchesMap: true });
  });

  it("recognises the review, confirmation and sign-in pages", () => {
    expect(identifyPage(fixture("review"), practice).kind).toBe("review");
    expect(identifyPage(fixture("confirmation"), practice)).toMatchObject({ kind: "confirmation", matchesMap: true });
    expect(identifyPage(fixture("sign-in"), practice).kind).toBe("sign_in");
  });

  it("says when a known path no longer looks like the map", () => {
    const doc = fixture("schooling");
    doc.querySelector("form[data-page]")!.innerHTML = "<p>Something new</p>";
    expect(identifyPage(doc, practice)).toEqual({ kind: "form", pageId: "schooling", matchesMap: false });
  });

  it("says unknown for a page the adapter doesn't have", () => {
    expect(identifyPage(page("<p>hi</p>", "/elsewhere"), practice).kind).toBe("unknown");
  });
});

// The guard's own tests (spec 7.2). Most use deliberately wrong adapters: the guard must hold even when the
// adapter says a dangerous control is safe.
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { guard, matchPage, type Adapter, type GuardContext } from "../src/index";
import { practice } from "../src/practice/index";
import { fixture } from "./helpers";

const RUN = { active: true, startedByStudent: true };
const PORTAL = "http://127.0.0.1:4318";
const ctx = (doc: Document, adapter: Adapter = practice, run = RUN): GuardContext => ({ doc, adapter, run });
const el = (doc: Document, id: string) => {
  const e = doc.getElementById(id);
  if (!e) throw new Error(`no #${id}`);
  return e;
};

/** A copy of the practice adapter that trusts `ids` as next-page controls on `pageId`, and forgets its never-click list. */
function wrong(pageId: string, ids: string[], change: (a: Adapter) => void = () => {}): Adapter {
  const a = structuredClone(practice);
  a.map.neverClick = [];
  a.map.allowedClicks.push(...ids.map((id) => ({ id, what: "next page (wrong)" })));
  const page = a.map.pages.find((p) => p.id === pageId);
  if (page) page.controls.continue = ids[0]!;
  change(a);
  return a;
}

/** The review page dressed up as an ordinary form page by a wrong adapter. */
const reviewAsForm = (ids: string[]) =>
  wrong("none", ids, (a) => {
    a.map.review.path = "/not-review";
    a.map.pages.push({ id: "review", path: "/review", kind: "form", title: "Review", section: null, fields: [], controls: { continue: ids[0]! } });
  });

describe("what the guard allows (the correct practice adapter)", () => {
  it("allows the declared next-page, save and add-another controls on ordinary form pages", () => {
    const about = fixture("about-you");
    expect(guard.allowClick(el(about, "save-continue"), ctx(about))).toEqual({ allow: true });
    expect(guard.allowClick(el(about, "save-only"), ctx(about))).toEqual({ allow: true });
    const acts = fixture("activities");
    expect(guard.allowClick(el(acts, "add-activity"), ctx(acts))).toEqual({ allow: true });
    const dash = fixture("dashboard");
    expect(guard.allowClick(el(dash, "continue-application"), ctx(dash))).toEqual({ allow: true });
  });

  it("allows every ordinary page's Save and continue in the recorded walk", () => {
    for (const state of ["about-you", "schooling", "tests", "activities", "statement"]) {
      const doc = fixture(state);
      expect(guard.allowClick(el(doc, "save-continue"), ctx(doc)), state).toEqual({ allow: true });
    }
  });
});

describe("deny by default", () => {
  it("blocks everything while the run is paused, stopped, or not started by the student", () => {
    const doc = fixture("about-you");
    const b = el(doc, "save-continue");
    expect(guard.allowClick(b, ctx(doc, practice, { active: false, startedByStudent: true }))).toMatchObject({ allow: false, why: "run_inactive" });
    expect(guard.allowClick(b, ctx(doc, practice, { active: true, startedByStudent: false }))).toMatchObject({ allow: false, why: "run_inactive" });
  });

  it("blocks a control the adapter doesn't declare", () => {
    const doc = fixture("about-you");
    expect(guard.allowClick(el(doc, "sign-out"), ctx(doc))).toMatchObject({ allow: false });
    expect(guard.allowClick(el(doc, "field-email"), ctx(doc))).toMatchObject({ allow: false });
  });

  it("blocks when the page no longer matches the map", () => {
    const doc = fixture("schooling");
    doc.querySelector("form[data-page]")!.querySelectorAll("input, select").forEach((x) => x.remove());
    expect(guard.allowClick(el(doc, "save-continue"), ctx(doc))).toMatchObject({ allow: false, why: "page_differs" });
  });

  it("blocks a disabled control", () => {
    const doc = fixture("about-you");
    el(doc, "save-continue").setAttribute("disabled", "");
    expect(guard.allowClick(el(doc, "save-continue"), ctx(doc))).toMatchObject({ allow: false, why: "disabled" });
  });

  it("stops before the fee, the security check, the declaration and the review, whatever the adapter declares", () => {
    for (const state of ["fee", "security-check", "declaration"]) {
      const doc = fixture(state);
      const id = state === "declaration" ? "sign-continue" : "save-continue";
      expect(guard.allowClick(el(doc, id), ctx(doc, wrong(state, [id]))), state).toMatchObject({ allow: false });
    }
  });

  it("still stops there when a wrong adapter also calls those pages ordinary forms", () => {
    const asForm = (pageId: string, id: string) =>
      wrong(pageId, [id], (a) => {
        a.map.pages.find((p) => p.id === pageId)!.kind = "form";
      });
    const cases: [string, string, string][] = [
      ["fee", "save-continue", "words"], // its form posts to /apply/fee (and holds the fee waiver)
      ["fee", "pay-fee", "words"],
      ["security-check", "save-continue", "submit_unsafe"], // the form holds the security word
      ["declaration", "sign-continue", "words"],
    ];
    for (const [state, id, why] of cases) {
      const doc = fixture(state);
      expect(guard.allowClick(el(doc, id), ctx(doc, asForm(state, id))), `${state} ${id}`).toMatchObject({ allow: false, why });
    }
    // The declaration's button renamed and its form pointed at a harmless-looking address: the declaration
    // checkbox in the form still stops it.
    const decl = fixture("declaration");
    el(decl, "sign-continue").textContent = "Next";
    el(decl, "sign-continue").setAttribute("value", "next");
    decl.querySelector("form[data-page]")!.setAttribute("action", "/apply/step-8");
    expect(guard.allowClick(el(decl, "sign-continue"), ctx(decl, asForm("declaration", "sign-continue")))).toMatchObject({
      allow: false,
      why: "submit_unsafe",
    });
  });
});

describe("a deliberately wrong adapter", () => {
  it("can't get a submit button pressed by calling it next-page", () => {
    const doc = fixture("review");
    expect(guard.allowClick(el(doc, "submit-application"), ctx(doc, reviewAsForm(["submit-application"])))).toMatchObject({ allow: false });
  });

  it("can't either when the submit button's words have been made harmless", () => {
    const doc = fixture("review");
    const b = el(doc, "submit-application");
    b.textContent = "Continue";
    b.setAttribute("value", "continue");
    // A submit button whose form has nothing to fill is a final step, not a page of questions.
    expect(guard.allowClick(b, ctx(doc, reviewAsForm(["submit-application"])))).toMatchObject({ allow: false, why: "submit_unsafe" });
  });

  it("can't get a pay button or pay link pressed", () => {
    const fee = fixture("fee");
    expect(guard.allowClick(el(fee, "pay-fee"), ctx(fee, wrong("fee", ["pay-fee"])))).toMatchObject({ allow: false });
    const doc = fixture("about-you");
    doc.querySelector("main")!.insertAdjacentHTML("beforeend", `<a id="go-on" href="/fee/pay">Next</a>`);
    expect(guard.allowClick(el(doc, "go-on"), ctx(doc, wrong("about-you", ["go-on"])))).toMatchObject({ allow: false, why: "words" });
  });

  it("can't get a certify checkbox ticked", () => {
    const doc = fixture("about-you");
    doc.querySelector("form[data-page]")!.insertAdjacentHTML(
      "beforeend",
      `<label><input type="checkbox" id="cert"> I certify that everything here is true</label>`,
    );
    expect(guard.allowClick(el(doc, "cert"), ctx(doc, wrong("about-you", ["cert"])))).toMatchObject({ allow: false, why: "checkbox" });
    // Nor does the page's Save and continue go through while that checkbox is in its form.
    expect(guard.allowClick(el(doc, "save-continue"), ctx(doc))).toMatchObject({ allow: false, why: "submit_unsafe" });
  });

  it("can't get a confirm button inside a frame pressed", () => {
    const doc = fixture("about-you");
    const frame = new JSDOM(`<button id="confirm-it">Confirm</button><button id="next">Next</button>`).window.document;
    for (const id of ["confirm-it", "next"]) {
      expect(guard.allowClick(el(frame, id), ctx(doc, wrong("about-you", [id]))), id).toMatchObject({ allow: false, why: "frame" });
    }
  });

  it("can't get a never-click control pressed after its words change at runtime", () => {
    const doc = fixture("declaration");
    const b = el(doc, "sign-continue");
    b.textContent = "Next";
    expect(guard.allowClick(b, ctx(doc))).toMatchObject({ allow: false, why: "never_click" });
    // Even with the never-click list gone and the button declared, the form still holds the declaration.
    expect(guard.allowClick(b, ctx(doc, wrong("declaration", ["sign-continue"])))).toMatchObject({ allow: false });
  });

  it("can't get an allowed control pressed after its words change to something final", () => {
    const doc = fixture("about-you");
    el(doc, "save-continue").textContent = "Submit application";
    expect(guard.allowClick(el(doc, "save-continue"), ctx(doc))).toMatchObject({ allow: false, why: "words" });
  });

  it("can't get a form sent to another site", () => {
    const doc = fixture("about-you");
    el(doc, "save-continue").setAttribute("formaction", "https://elsewhere.example/collect");
    expect(guard.allowClick(el(doc, "save-continue"), ctx(doc))).toMatchObject({ allow: false, why: "off_origin" });
  });
});

describe("the word list, English and Hindi", () => {
  const blocked = [
    "Submit", "Pay now", "Make payment", "Application fee", "Request a fee waiver", "Sign", "Add your signature", "I certify",
    "Certification", "Declaration", "I declare", "Confirm", "I agree", "Final step", "Send application", "Purchase",
    "आवेदन जमा करें", "भुगतान करें", "शुल्क", "हस्ताक्षर", "मैं सहमत हूँ", "पुष्टि करें", "घोषणा", "अंतिम", "आवेदन भेजें",
  ];
  for (const words of blocked) {
    it(`blocks "${words}"`, () => {
      const doc = fixture("about-you");
      doc.querySelector("main")!.insertAdjacentHTML("beforeend", `<a id="x" href="/apply/schooling">${words}</a>`);
      expect(guard.allowClick(el(doc, "x"), ctx(doc, wrong("about-you", ["x"])))).toMatchObject({ allow: false, why: "words" });
    });
  }

  it("reads the accessible name and title too, not just the text", () => {
    const doc = fixture("about-you");
    doc.querySelector("main")!.insertAdjacentHTML("beforeend", `<a id="x" href="/apply/schooling" aria-label="Submit">→</a><a id="y" href="/apply/schooling" title="Pay">→</a>`);
    expect(guard.allowClick(el(doc, "x"), ctx(doc, wrong("about-you", ["x"])))).toMatchObject({ allow: false, why: "words" });
    expect(guard.allowClick(el(doc, "y"), ctx(doc, wrong("about-you", ["y"])))).toMatchObject({ allow: false, why: "words" });
  });

  it("matches whole words, so 'design' and 'feedback' aren't sign or fee", () => {
    const doc = fixture("about-you");
    doc.querySelector("main")!.insertAdjacentHTML("beforeend", `<a id="x" href="/apply/schooling">Design feedback</a>`);
    expect(guard.allowClick(el(doc, "x"), ctx(doc, wrong("about-you", ["x"])))).toEqual({ allow: true });
  });
});

describe("keys", () => {
  it("never sends Enter, in a text field or anywhere else", () => {
    const doc = fixture("about-you");
    expect(guard.allowKey("Enter", el(doc, "field-given_names"), ctx(doc))).toMatchObject({ allow: false, why: "enter" });
    expect(guard.allowKey("Enter", el(doc, "save-continue"), ctx(doc))).toMatchObject({ allow: false, why: "enter" });
  });

  it("never presses Space on a button or checkbox", () => {
    const doc = fixture("declaration");
    expect(guard.allowKey(" ", el(doc, "field-declare"), ctx(doc))).toMatchObject({ allow: false });
  });

  it("never types into a password field", () => {
    const doc = fixture("sign-in");
    expect(guard.allowKey("a", el(doc, "password"), ctx(doc))).toMatchObject({ allow: false, why: "password" });
  });

  it("allows ordinary typing into a fillable text field", () => {
    const doc = fixture("about-you");
    expect(guard.allowKey("a", el(doc, "field-email"), ctx(doc))).toEqual({ allow: true });
  });
});

describe("fills", () => {
  const field = (doc: Document, key: string) => matchPage(doc, practice, { includeHidden: true }).find((m) => m.key === key)!;

  it("allows filling a fact field", () => {
    const doc = fixture("about-you");
    expect(guard.allowFill(field(doc, "field-email"), ctx(doc))).toEqual({ allow: true });
  });

  it("never fills a declaration, signature, fee waiver, security word or student-only field", () => {
    const decl = fixture("declaration");
    expect(guard.allowFill(field(decl, "field-declare"), ctx(decl))).toMatchObject({ allow: false });
    expect(guard.allowFill(field(decl, "field-signed_name"), ctx(decl))).toMatchObject({ allow: false });
    const fee = fixture("fee");
    expect(guard.allowFill(field(fee, "field-fee_waiver"), ctx(fee))).toMatchObject({ allow: false });
    const sec = fixture("security-check");
    expect(guard.allowFill(field(sec, "field-check_word"), ctx(sec))).toMatchObject({ allow: false });
    const about = fixture("about-you");
    expect(guard.allowFill(field(about, "field-given_names"), ctx(about))).toMatchObject({ allow: false });
  });

  it("never fills a password, or anything on the sign-in page", () => {
    const doc = fixture("sign-in");
    expect(guard.allowFill(field(doc, "password"), ctx(doc))).toMatchObject({ allow: false });
    expect(guard.allowFill(field(doc, "email"), ctx(doc))).toMatchObject({ allow: false });
  });

  it("never ticks a checkbox carrying declaration words, even if a wrong adapter maps it as a fact", () => {
    const a = structuredClone(practice);
    const doc = fixture("declaration");
    const m = { ...field(doc, "field-declare"), role: "contact.email" as const, action: "fill" as const };
    expect(guard.allowFill(m, ctx(doc, a))).toMatchObject({ allow: false, why: "checkbox" });
  });

  it("blocks fills while the run is paused", () => {
    const doc = fixture("about-you");
    expect(guard.allowFill(field(doc, "field-email"), ctx(doc, practice, { active: false, startedByStudent: true }))).toMatchObject({ allow: false, why: "run_inactive" });
  });
});

describe("navigation", () => {
  it("stays on the portal", () => {
    const doc = fixture("about-you");
    expect(guard.allowNavigate("http://127.0.0.1:4318/apply/schooling", ctx(doc))).toEqual({ allow: true });
    expect(guard.allowNavigate("https://elsewhere.example/", ctx(doc))).toMatchObject({ allow: false, why: "off_origin" });
    expect(guard.allowNavigate("http://127.0.0.1:4318/fee/pay", ctx(doc))).toMatchObject({ allow: false, why: "words" });
  });
});

describe("pressing: the only click anywhere", () => {
  it("presses an allowed control, and nothing else", () => {
    const doc = fixture("about-you");
    let clicks = 0;
    el(doc, "save-continue").addEventListener("click", (e) => {
      clicks++;
      e.preventDefault();
    });
    expect(guard.press(el(doc, "save-continue"), ctx(doc))).toEqual({ allow: true });
    expect(clicks).toBe(1);
  });

  it("never presses what allowClick refuses", () => {
    const doc = fixture("review");
    let clicks = 0;
    el(doc, "submit-application").addEventListener("click", (e) => {
      clicks++;
      e.preventDefault();
    });
    expect(guard.press(el(doc, "submit-application"), ctx(doc, reviewAsForm(["submit-application"])))).toMatchObject({ allow: false });
    expect(clicks).toBe(0);
  });
});

describe("navigating: only through the guard", () => {
  it("goes to a page of the portal the student picked from the summary", () => {
    const doc = fixture("review");
    expect(guard.navigate(`${PORTAL}/apply/schooling`, ctx(doc))).toEqual({ allow: true });
  });

  it("never goes to another site, or to a paying, signing or declaring address", () => {
    const doc = fixture("review");
    expect(guard.navigate("https://elsewhere.example/", ctx(doc))).toMatchObject({ allow: false, why: "off_origin" });
    expect(guard.navigate(`${PORTAL}/apply/declaration`, ctx(doc))).toMatchObject({ allow: false, why: "words" });
    expect(guard.navigate(`${PORTAL}/fee/pay`, ctx(doc))).toMatchObject({ allow: false, why: "words" });
  });
});

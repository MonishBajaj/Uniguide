// Test builds only (EXT_WRONG_ADAPTER=1): a practice adapter that is deliberately wrong in every way that could
// get a final control pressed, so the end-to-end tests can show the guard holds anyway (plan A2.2). It has no
// never-click list, it calls the fee, declaration and review pages ordinary forms, and it names each page's
// final button as its next-page control: the fee's, the declaration's "Sign and continue", and the review
// page's "Submit my application". Store builds never include it.
import type { Adapter } from "@uniguide/portal-adapters";
import { practice } from "@uniguide/portal-adapters/practice";

export function wrongPractice(): Adapter {
  const a = structuredClone(practice);
  a.version = "practice-wrong";
  a.map.neverClick = [];
  for (const p of a.map.pages) if (p.kind !== "form") p.kind = "form";
  a.map.pages.find((p) => p.id === "declaration")!.controls.continue = "sign-continue";
  a.map.review = { ...a.map.review, path: "/not-the-review" };
  a.map.pages.push({ id: "review", path: "/review", kind: "form", title: "Review", section: null, fields: [], controls: { continue: "submit-application" } });
  a.map.allowedClicks.push({ id: "sign-continue", what: "wrong" }, { id: "submit-application", what: "wrong" }, { id: "pay-fee", what: "wrong" });
  return a;
}

import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { identifyPage, matchPage, type FillProfile } from "@uniguide/portal-adapters";
import { practice } from "@uniguide/portal-adapters/practice";
import type { ScanResult } from "../src/messages";

const FIXTURES = new URL("../../../packages/portal-adapters/practice/fixtures/", import.meta.url);
const PATHS: Record<string, string> = { "sign-in": "/sign-in", dashboard: "/", review: "/review", confirmation: "/confirmation" };

/** A captured practice-portal page (A1.2) as a live document. */
export function fixture(name: string): Document {
  const html = readFileSync(new URL(`${name}.html`, FIXTURES), "utf8");
  const path = PATHS[name] ?? `/apply/${name.split("--")[0]}`;
  return new JSDOM(html, { url: `http://127.0.0.1:4318${path}` }).window.document;
}

/** What the content script would send the panel for that page. */
export function scanOf(name: string): ScanResult {
  const doc = fixture(name);
  return {
    portal: practice.portal,
    adapterVersion: practice.version,
    page: identifyPage(doc, practice),
    fields: matchPage(doc, practice).map(({ element: _e, ...v }) => v),
  };
}

export function profile(over: Partial<FillProfile> = {}): FillProfile {
  return {
    application: { id: "app-1", own: false, portal: "direct", course: { title: "MSc Test", institution: "Test University", country: "GB", level: "masters" } },
    contact: { email: "applicant@uniguide.local", residenceCountry: "IN" },
    education: { qualification: "bachelor_4yr", grade: { value: 8.4, text: null, scale: "gpa_10" }, priorCredits: { value: null, system: null } },
    testScores: [],
    activities: [],
    aiPolicy: "unknown",
    finalDrafts: [],
    ...over,
  };
}

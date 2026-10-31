import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import type { FillProfile } from "../src/index";

const FIXTURES = new URL("../practice/fixtures/", import.meta.url);
const ORIGIN = "http://127.0.0.1:4318";

/** Where each captured state was recorded (A1.2). */
const PATHS: Record<string, string> = {
  "sign-in": "/sign-in",
  dashboard: "/",
  "dashboard--submitted": "/",
  review: "/review",
  confirmation: "/confirmation",
};

/** A fixture as a document, scripts not run, at the URL it was captured from. */
export function fixture(name: string): Document {
  const html = readFileSync(new URL(`${name}.html`, FIXTURES), "utf8");
  const path = PATHS[name] ?? `/apply/${name.split("--")[0]}`;
  return new JSDOM(html, { url: `${ORIGIN}${path}` }).window.document;
}

/** A page we write ourselves, for portals and wording the practice map doesn't know. */
export function page(body: string, path = "/somewhere"): Document {
  return new JSDOM(`<!doctype html><html><head><title>t</title></head><body><main>${body}</main></body></html>`, {
    url: `https://portal.example${path}`,
  }).window.document;
}

/** A synthetic fill profile, the shape `fill_profile` returns. */
export function profile(over: Partial<FillProfile> = {}): FillProfile {
  return {
    application: { id: "app-1", own: false, portal: "direct", course: { title: "MSc Test", institution: "Test University", country: "GB", level: "masters" } },
    contact: { email: "tester@practice.test", residenceCountry: "IN" },
    education: {
      qualification: "cbse",
      grade: { value: 91.4, text: null, scale: "percent" },
      priorCredits: { value: null, system: null },
    },
    testScores: [
      { id: "t-1", exam: "ielts_academic", version: null, total: 7.5, sections: null, takenOn: "2026-06-12" },
      { id: "t-0", exam: "gre", version: null, total: 320, sections: null, takenOn: "2026-01-10" },
    ],
    activities: [
      { id: "a-1", section: "projects", title: "Robotics club lead", organisation: "City School", location: null, start: null, end: null, bullets: [] },
      { id: "a-2", section: "volunteering", title: "Library volunteer", organisation: null, location: null, start: null, end: null, bullets: [] },
    ],
    aiPolicy: "unknown",
    finalDrafts: [],
    ...over,
  };
}

// The practice portal's adapter: its recorded map (A1.2) plus which of its options mean the same as our codes.
import type { Adapter, PortalMap } from "../format";
import map from "../../practice/map.json" with { type: "json" };

export const practice: Adapter = {
  portal: "practice",
  version: "practice-1",
  map: map as PortalMap,
  optionEquivalents: {
    // Our codes (apps/web/lib/fields.ts) → the practice portal's option values. "Another qualification" is never chosen for the student.
    "education.qualification": { cbse: "cbse_12", isc: "isc_12", ib: "ib_diploma", a_levels: "a_levels", bachelor_4yr: "bachelor_4yr" },
    "education.grade.scale": { percent: "percentage", gpa_4: "gpa_4", gpa_10: "gpa_10", ib_45: "ib_points" },
    "tests.english.exam": { ielts_academic: "ielts_academic", toefl_ibt: "toefl_ibt", pte_academic: "pte_academic", duolingo: "duolingo" },
  },
};

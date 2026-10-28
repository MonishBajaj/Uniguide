import { segment } from "./segment";

/**
 * 5.7 Research statement checks. Plain pattern checks on the student's own draft: whether it
 * states a question, and whether it names how the student would answer it. They point at sentences;
 * they never suggest wording.
 */
const QUESTION_PHRASES = /\b(?:my (?:central |main )?(?:research )?question|I (?:aim|want|propose|intend|plan) to (?:investigate|understand|determine|test|explain|find out|measure|examine)|(?:investigate|ask|examine|test) (?:whether|how|why|what)|hypothes[ie]s)\b/i;

const METHODS = [
  "survey", "interview", "experiment", "randomised", "randomized", "controlled trial", "regression", "simulation", "modelling", "modeling",
  "dataset", "data set", "fieldwork", "case study", "ethnograph", "qualitative", "quantitative", "mixed methods", "archival", "archive",
  "machine learning", "neural network", "statistical", "causal inference", "difference-in-differences", "panel data", "benchmark",
  "prototype", "proof", "formal model", "user study", "focus group", "content analysis", "discourse analysis", "spectroscopy",
  "microscopy", "sequencing", "assay", "field trial", "optimisation", "optimization", "eye-tracking", "corpus",
];

export interface ResearchChecks {
  /** Sentence ids (S1, S2…) that state the question. */
  questionSentences: string[];
  /** Methods named in the draft, as written in the list above. */
  methods: string[];
}

export function researchChecks(draft: string): ResearchChecks {
  const sentences = segment(draft);
  const lower = draft.toLowerCase();
  return {
    questionSentences: sentences.filter((s) => /\?\s*$/.test(s.text) || QUESTION_PHRASES.test(s.text)).map((s) => s.id),
    methods: METHODS.filter((m) => new RegExp(`\\b${m.replace(/[-\s]/g, "[-\\s]")}`).test(lower)),
  };
}

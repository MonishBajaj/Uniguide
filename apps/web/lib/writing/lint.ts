import { segment, type Sentence } from "./segment";

export type LintKind = "cliche" | "vague" | "long" | "passive" | "unsupported_claim";

export interface LintFlag {
  sentence: string;
  kind: LintKind;
  match: string;
  question: string;
}

export interface LintReport {
  sentences: Sentence[];
  words: number;
  wordLimit: number | null;
  overLimit: boolean;
  flags: LintFlag[];
  /** Share of sentences with something only this applicant could write: a number, a name, a course. */
  specificity: number;
  iStarts: number;
}

// Openings and phrases admissions readers see in thousands of statements.
const CLICHES = [
  "ever since i was a child", "from a young age", "since childhood", "since my childhood", "i have always been passionate",
  "i have always been fascinated", "passion for", "my passion", "dream of", "my dream", "in today's world",
  "in today's fast-paced world", "in this day and age", "make a difference", "make the world a better place",
  "change the world", "webster's dictionary", "the oxford dictionary defines", "hard-working", "hardworking",
  "team player", "think outside the box", "esteemed university", "prestigious university", "world-class",
  "state-of-the-art", "cutting-edge", "cutting edge", "renowned faculty", "esteemed faculty", "golden opportunity",
  "i am writing to apply", "it would be an honour", "it would be an honor", "pursue my dreams", "reach my full potential",
  "broaden my horizons", "thirst for knowledge", "quench my thirst", "leave no stone unturned",
];

const VAGUE = ["various", "many things", "a lot of", "lots of", "stuff", "things like", "etc", "very", "really", "extremely", "somehow", "some kind of"];

const CLAIMS = ["i am passionate", "i am dedicated", "i am hardworking", "i am a quick learner", "i am highly motivated", "i am confident that", "i am the ideal candidate", "i am a perfect fit"];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const phrase = (list: string[]) => new RegExp(`\\b(${list.map(escapeRe).join("|")})\\b`, "i");
const CLICHE_RE = phrase(CLICHES);
const VAGUE_RE = phrase(VAGUE);
const CLAIM_RE = phrase(CLAIMS);
const PASSIVE_RE = /\b(?:am|is|are|was|were|be|been|being)\s+(?:\w+ly\s+)?(\w+ed|done|made|given|taken|shown|seen|known|taught|built|written|chosen)\b/i;
const SPECIFIC_RE = /\d|(?<!^)(?<![.!?]\s)\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/;

/** Deterministic first pass: limits, clichés, vague words, unsupported claims, very long and passive sentences. */
export function lint(draft: string, wordLimit: number | null): LintReport {
  const sentences = segment(draft);
  const flags: LintFlag[] = [];
  let specific = 0;
  let iStarts = 0;
  for (const s of sentences) {
    const cliche = s.text.match(CLICHE_RE);
    if (cliche) flags.push({ sentence: s.id, kind: "cliche", match: cliche[1]!, question: "What happened, specifically, that only you could describe here?" });
    const claim = s.text.match(CLAIM_RE);
    if (claim) flags.push({ sentence: s.id, kind: "unsupported_claim", match: claim[1]!, question: "Which moment shows this instead of stating it?" });
    const vague = s.text.match(VAGUE_RE);
    if (vague) flags.push({ sentence: s.id, kind: "vague", match: vague[1]!, question: "Can you name the actual thing, number or example?" });
    if (s.words > 40) flags.push({ sentence: s.id, kind: "long", match: `${s.words} words`, question: "Would a reader follow this better as two sentences?" });
    const passive = s.text.match(PASSIVE_RE);
    if (passive) flags.push({ sentence: s.id, kind: "passive", match: passive[0], question: "Who did this? Would naming them make it clearer?" });
    if (SPECIFIC_RE.test(s.text)) specific += 1;
    if (/^I\b/.test(s.text)) iStarts += 1;
  }
  const words = sentences.reduce((n, s) => n + s.words, 0);
  return {
    sentences,
    words,
    wordLimit,
    overLimit: wordLimit != null && words > wordLimit,
    flags,
    specificity: sentences.length ? specific / sentences.length : 0,
    iStarts: sentences.length ? iStarts / sentences.length : 0,
  };
}

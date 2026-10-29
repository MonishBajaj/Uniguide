import type { OutlineSection } from "./prompts";

/**
 * 5.6 Supplemental essays: a school's own short questions. Keyword rules sort the pasted question
 * into a familiar type so the coach can ask the right strategy questions and split the word
 * budget. It only asks; the answer is the student's.
 */
export type PromptType = "why_us" | "challenge" | "community" | "goals" | "activity" | "other";

interface TypeGuide {
  /** What the question is about, for "This looks like a question about …"; null when unclassified. */
  about: string | null;
  strategy: string[];
  /** STORY_QUESTIONS ids whose answers hold the material for this type. */
  stories: string[];
  outline: OutlineSection[];
}

export const PROMPT_TYPES: Record<PromptType, TypeGuide> = {
  why_us: {
    about: "why you chose this school",
    strategy: [
      "Which two or three things here could you not get anywhere else, by name?",
      "Could this answer be sent to another university by changing the name? If so, what is missing?",
      "Which of those things connects to something you have already done?",
    ],
    stories: ["why_course", "question_now", "contribution"],
    outline: [
      { id: "specifics", title: "What only they offer", share: 0.6, questions: ["Which modules, labs, people or opportunities, by name?"] },
      { id: "link", title: "How it connects to you", share: 0.4, questions: ["Which experience of yours does each one build on?"] },
    ],
  },
  challenge: {
    about: "a challenge or setback",
    strategy: [
      "Which single moment shows the challenge best? Start close to it.",
      "What did you do yourself, step by step?",
      "What do you do differently now because of it? Spend at least a third of the words here.",
    ],
    stories: ["failure", "constraints", "skill_gap"],
    outline: [
      { id: "situation", title: "The situation", share: 0.3, questions: ["What happened, when, and what was at stake?"] },
      { id: "action", title: "What you did", share: 0.35, questions: ["Which choices were yours?"] },
      { id: "change", title: "What changed", share: 0.35, questions: ["What did you learn, and where have you used it since?"] },
    ],
  },
  community: {
    about: "your community or perspective",
    strategy: [
      "Which community do you mean, and what is your place in it?",
      "Which one scene shows it, rather than a description?",
      "What would you bring from it to this campus, concretely?",
    ],
    stories: ["people", "constraints", "contribution"],
    outline: [
      { id: "community", title: "Your community", share: 0.4, questions: ["Who, where, and what you do there?"] },
      { id: "shaped", title: "How it shaped you", share: 0.35, questions: ["Which belief or habit comes from it?"] },
      { id: "bring", title: "What you bring", share: 0.25, questions: ["What will classmates gain from it?"] },
    ],
  },
  goals: {
    about: "your goals and plans",
    strategy: [
      "What is the most specific version of your goal you can honestly state?",
      "Which past step shows the goal is real, not new?",
      "Which part of this course is the bridge to it?",
    ],
    stories: ["after", "question_now", "why_now"],
    outline: [
      { id: "goal", title: "The goal", share: 0.35, questions: ["A role, a problem or a place, as narrowly as you can?"] },
      { id: "path", title: "How you got here", share: 0.35, questions: ["Which steps have you already taken?"] },
      { id: "bridge", title: "The bridge", share: 0.3, questions: ["What does this course give you that you lack?"] },
    ],
  },
  activity: {
    about: "an activity or experience",
    strategy: [
      "Why this activity out of everything you could pick?",
      "What did you do yourself, with numbers if you have them?",
      "What does it show that the rest of your application does not?",
    ],
    stories: ["proudest_work", "skill_gap", "people"],
    outline: [
      { id: "what", title: "What it is", share: 0.25, questions: ["What, where, how long, your role?"] },
      { id: "did", title: "What you did", share: 0.45, questions: ["One concrete example with a result?"] },
      { id: "meant", title: "What it means to you", share: 0.3, questions: ["Why does it matter to you?"] },
    ],
  },
  other: {
    about: null,
    strategy: [
      "What exactly is the question asking? Underline every part of it.",
      "Which one experience answers all of those parts?",
      "What should the reader know about you afterwards that they did not before?",
    ],
    stories: ["proudest_work", "turning_point"],
    outline: [
      { id: "answer", title: "Answer the question", share: 0.7, questions: ["Does each part of the question get an answer?"] },
      { id: "reflect", title: "Reflection", share: 0.3, questions: ["What did you learn, and what changed afterwards?"] },
    ],
  },
};

// First match wins: "why us" phrasing is the most specific, generic words like "experience" the least.
const RULES: [PromptType, RegExp[]][] = [
  [
    "why_us",
    [
      /\bwhy (?:do you want to |are you (?:interested in |applying to )|have you chosen |did you choose )(?:attend|join|study at|apply(?:ing)? to|this|our)\b/i,
      /\bwhy (?:this|our) (?:university|college|school|program|programme|course)/i,
      /\bwhat (?:attracts|draws) you\b|\binterested in (?:our|this) (?:university|college|school|program|programme|course)|\bfit (?:with|for|at) (?:our|this)/i,
      // "Why Stanford?": a capitalised name straight after "why", case-sensitive on purpose.
      /\b[Ww]hy (?!(?:I|A|An|The|Is|Are|Do|Does|Did|Have|Has|Was|Were|Should|Would|Could|Can|Will|Not)\b)[A-Z][a-z]+/,
    ],
  ],
  ["challenge", [/\b(?:challenge|obstacle|setback|fail(?:ure|ed)?|difficult|overc[oa]me|adversity|conflict|mistake)/i]],
  ["community", [/\b(?:communit|divers|identity|belong|perspective|culture|background)/i]],
  ["goals", [/\b(?:goals?|career|future|after (?:you )?graduat|aspir|hope to|plans?)\b/i, /\bwhy (?:do you want to |did you choose to |have you chosen to )?(?:study|major|pursue)\b/i]],
  ["activity", [/\b(?:activit|extracurricular|elaborate|hobby|involvement|experiences?|project|work)/i]],
];

export function classifyPrompt(question: string): PromptType {
  return RULES.find(([, res]) => res.some((re) => re.test(question)))?.[0] ?? "other";
}

import { classifyPrompt, PROMPT_TYPES } from "./supplemental";

/** Story mining: questions that surface material only this student has. Answers stay private notes. */
export const STORY_QUESTIONS: { id: string; group: string; question: string; hint: string }[] = [
  { id: "first_problem", group: "Where it started", question: "What is the first problem in this field you remember wanting to solve?", hint: "A specific moment, place and year beats 'since childhood'." },
  { id: "turning_point", group: "Where it started", question: "When did interest turn into a decision to study this?", hint: "What happened, who was involved, what did you do next?" },
  { id: "proudest_work", group: "Evidence", question: "What is the piece of work you are proudest of?", hint: "What did you do yourself, what was hard, and what was the result in numbers?" },
  { id: "failure", group: "Evidence", question: "Describe something that did not work. What did you change afterwards?", hint: "Admissions readers look for what you learned, not the failure." },
  { id: "skill_gap", group: "Evidence", question: "Which skill did you have to teach yourself, and how?", hint: "Name the resources, the time it took, and what you built with it." },
  { id: "people", group: "Context", question: "Who has shaped how you work, and what did they do?", hint: "A teacher, manager, patient or user. One concrete scene." },
  { id: "constraints", group: "Context", question: "What constraints have you worked under (time, money, family, access)?", hint: "Only if you want to share it. Context helps readers judge achievements fairly." },
  { id: "question_now", group: "Direction", question: "What question do you want to spend the next few years on?", hint: "As narrow as you can make it." },
  { id: "after", group: "Direction", question: "What do you want to be doing three years after the course?", hint: "A role, a problem, a place. Be specific even if it may change." },
  { id: "why_course", group: "Direction", question: "Which modules, labs or people on this course connect to your question?", hint: "Use the course page and faculty list; name them." },
  { id: "why_now", group: "Direction", question: "Why is now the right time for this course?", hint: "What do you already have, and what exactly are you missing?" },
  { id: "contribution", group: "Direction", question: "What will you bring to classmates or a research group?", hint: "An experience, a skill or a perspective they would not otherwise have." },
];

export interface OutlineSection {
  id: string;
  title: string;
  share: number;
  questions: string[];
}

/** Structure only: section order, word budget and the questions each section should answer. */
export const OUTLINES: Record<string, OutlineSection[]> = {
  statement_of_purpose: [
    { id: "hook", title: "Your question", share: 0.12, questions: ["What specific problem or question drives you?", "Which moment made it yours?"] },
    { id: "evidence", title: "What you have done", share: 0.38, questions: ["Which one or two projects show you can do this work?", "What did you do yourself, and what came of it?"] },
    { id: "gap", title: "What you need next", share: 0.15, questions: ["What can you not yet do that this course teaches?"] },
    { id: "fit", title: "Why this course", share: 0.25, questions: ["Which modules, labs or faculty connect to your question, by name?", "Why here rather than elsewhere?"] },
    { id: "after", title: "Afterwards", share: 0.1, questions: ["What will you do with it, concretely?"] },
  ],
  personal_statement: [
    { id: "interest", title: "Your interest", share: 0.25, questions: ["What do you find interesting about the subject, and why?"] },
    { id: "exploration", title: "How you explored it", share: 0.4, questions: ["What have you read, made, joined or tried beyond the syllabus?", "What did each teach you?"] },
    { id: "skills", title: "Skills from elsewhere", share: 0.2, questions: ["Which work, volunteering or responsibilities show relevant skills?"] },
    { id: "ahead", title: "Looking ahead", share: 0.15, questions: ["What do you hope to do with the subject?"] },
  ],
  why_this_university: [
    { id: "match", title: "Your question meets their work", share: 0.5, questions: ["Which papers or projects of named faculty connect to your question, and how?"] },
    { id: "resources", title: "What only they offer", share: 0.3, questions: ["Which modules, facilities or partnerships do you need, by name?"] },
    { id: "contribution", title: "What you add", share: 0.2, questions: ["What will you contribute to the group or cohort?"] },
  ],
  // A waitlisted applicant's short update. Honest commitment, then only what is new since applying.
  continued_interest: [
    { id: "commitment", title: "Where you stand", share: 0.2, questions: ["Would you accept a place if offered? Say so only if it is true.", "Is it truly your first choice? Never tell two universities that."] },
    { id: "new", title: "What is new since you applied", share: 0.5, questions: ["Which grades, results, awards, work or projects have you completed since you applied, with dates?", "What did you do yourself in each?"] },
    { id: "fit", title: "One reason this course fits", share: 0.2, questions: ["Which one module, lab or person connects to something new you have done, by name?"] },
    { id: "close", title: "Close", share: 0.1, questions: ["Have you thanked them and given your applicant ID?"] },
  ],
  // A research master's or doctorate: the question first, then why the student can answer it, here.
  research_statement: [
    { id: "question", title: "Your question", share: 0.15, questions: ["What exactly do you want to find out, in one sentence?", "Why does it matter, and to whom?"] },
    { id: "background", title: "What is known", share: 0.25, questions: ["Which two or three studies is your question built on?", "What gap or disagreement do they leave?"] },
    { id: "approach", title: "How you would answer it", share: 0.3, questions: ["Which methods and data would you use?", "Which of them have you used before, and on what?"] },
    { id: "fit", title: "Why here", share: 0.2, questions: ["Which researchers here work on something close, by name and paper?", "Which facilities or data here do you need?"] },
    { id: "feasibility", title: "Is it doable", share: 0.1, questions: ["What could go wrong, and what would you do then?", "Can a first result come within the first year?"] },
  ],
  other: [
    { id: "answer", title: "Answer the question", share: 0.7, questions: ["What exactly is the question asking?", "Which experience answers it best?"] },
    { id: "reflect", title: "Reflection", share: 0.3, questions: ["What did you learn, and what changed afterwards?"] },
  ],
};

export function outlineFor(kind: string, wordLimit: number | null, question: string | null = null) {
  const sections = kind === "supplemental" && question ? PROMPT_TYPES[classifyPrompt(question)].outline : (OUTLINES[kind] ?? OUTLINES.other!);
  return sections.map((s) => ({ ...s, words: wordLimit ? Math.round(s.share * wordLimit) : null }));
}

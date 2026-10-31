// Our canonical field schema: what a portal field asks for, in our own names, independent of any portal.
// Each role says what the extension may do with it by default and how a label for it is usually worded.

/**
 * What the extension may do with a field:
 * - fill: a confirmed fact the student fills with one press
 * - confirm: a fact the student checks in the panel before it's filled
 * - student: always left for the student
 * - pause: stop and hand over (a security check)
 * - never: never touched (sign, pay, declare)
 */
export type Action = "fill" | "confirm" | "student" | "pause" | "never";

export interface RoleSpec {
  action: Action;
  /** Label wordings, lower case. A label equal to one is a strong match; one containing it is weaker. */
  synonyms: string[];
  /** Words one of which must appear in the label or its section for the synonyms to count. */
  context?: string[];
  /** Draft kinds that may answer this role (essays only). */
  draftKinds?: string[];
  /** Repeated: one per entry, matched in order. */
  repeated?: boolean;
}

const ENGLISH_TEST = ["english", "ielts", "toefl", "pte", "duolingo", "language test"];
const ACTIVITIES = ["activit", "extracurricular", "extra-curricular"];

export const ROLES = {
  "person.given_names": { action: "student", synonyms: ["given names", "given name", "first name", "first names", "forename", "forenames"] },
  "person.family_name": { action: "student", synonyms: ["family name", "surname", "last name"] },
  "person.full_name": { action: "student", synonyms: ["full name", "full legal name", "name as in passport"] },
  "person.date_of_birth": { action: "student", synonyms: ["date of birth", "birth date", "dob"] },
  "contact.email": { action: "fill", synonyms: ["email", "email address", "e-mail", "e-mail address"] },
  "contact.residence_country": {
    action: "fill",
    synonyms: ["country you live in", "country of residence", "residence country", "country where you live", "country you currently live in"],
  },
  "contact.phone": { action: "student", synonyms: ["phone", "phone number", "telephone", "telephone number", "mobile", "mobile number"] },
  "education.school_name": { action: "student", synonyms: ["name of school or college", "school name", "name of school", "college name", "institution name"] },
  "education.qualification": { action: "confirm", synonyms: ["qualification", "qualification type", "highest qualification", "type of qualification"] },
  "education.grade.scale": { action: "confirm", synonyms: ["grading scale", "grade scale", "how your grade is given", "grading system"] },
  "education.grade.value": { action: "confirm", synonyms: ["overall grade", "your overall grade", "final grade", "overall result", "grade"] },
  "education.still_studying": { action: "student", synonyms: ["are you still studying there", "still studying"] },
  "education.expected_completion": {
    action: "student",
    synonyms: ["when do you expect to finish", "expected completion", "expected completion date", "expected graduation date"],
  },
  "tests.english.taken": {
    action: "confirm",
    synonyms: ["have you taken an english language test", "have you taken an english test", "english test taken"],
  },
  "tests.english.exam": { action: "confirm", synonyms: ["which test", "english test", "english language test", "test name"], context: ENGLISH_TEST },
  "tests.english.total": { action: "confirm", synonyms: ["overall score", "overall band score", "total score", "overall band"], context: ENGLISH_TEST },
  "tests.english.taken_on": { action: "confirm", synonyms: ["date you took it", "test date", "date of test", "date taken"], context: ENGLISH_TEST },
  "activities[].role": { action: "confirm", synonyms: ["what you did", "role", "position", "position held", "activity"], context: ACTIVITIES, repeated: true },
  "activities[].organisation": { action: "confirm", synonyms: ["organisation", "organization", "organisation name", "organization name"], context: ACTIVITIES, repeated: true },
  "activities[].description": { action: "student", synonyms: ["tell us about it", "description", "describe it", "details"], context: ACTIVITIES, repeated: true },
  "essay.personal_statement": {
    action: "confirm",
    synonyms: ["personal statement", "statement of purpose", "why do you want to study this course"],
    draftKinds: ["personal_statement", "statement_of_purpose"],
  },
  "security.challenge": { action: "pause", synonyms: ["captcha", "security check", "type the word", "verification code", "i am not a robot", "i'm not a robot"] },
  "fee.waiver": { action: "never", synonyms: ["fee waiver", "ask for a fee waiver", "request a fee waiver"] },
  "fee.waiver_reason": { action: "student", synonyms: ["why are you asking for a waiver", "waiver reason", "reason for fee waiver"] },
  "declaration.confirm": { action: "never", synonyms: ["i declare", "i certify", "i confirm that", "i agree", "declaration"] },
  "declaration.signature": { action: "never", synonyms: ["type your full name to sign", "signature", "sign", "electronic signature"] },
} as const satisfies Record<string, RoleSpec>;

export type Role = keyof typeof ROLES;

export function isRole(x: string): x is Role {
  return Object.hasOwn(ROLES, x);
}

/** Roles the extension must never fill, whatever an adapter says. */
export function isProtected(role: Role): boolean {
  const a: Action = ROLES[role].action;
  return a === "never" || a === "pause";
}

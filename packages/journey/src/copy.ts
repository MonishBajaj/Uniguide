/**
 * English titles and reasons for every step, by message key (plan I3: the web app translates by key
 * later). Templates only: no model writes these. `{name}` placeholders are filled by `render`, which
 * shortens long values (usually a course name) so a title stays within 60 characters and a reason
 * within 160.
 */

export const TITLE_MAX = 60;
export const REASON_MAX = 160;

export interface CopyTemplate {
  title: string;
  reason: string;
}

const en: Record<string, CopyTemplate> = {
  // Stage 1
  "S1.01": { title: "Tell us what and where you want to study", reason: "Your level, subjects and countries decide which courses we look at. One short form covers them." },
  "S1.01.research": { title: "Tell us about your research interests", reason: "Research courses are matched on what you want to study, so we need your interests." },
  "S1.02": { title: "Set your budget", reason: "A budget with its currency lets us compare each course's costs with what you can spend." },
  "S1.03": { title: "Choose your intake", reason: "The year you want to start decides which application rounds are still open." },
  "S1.04": { title: "Add your grades", reason: "Your grade and its scale let us check courses' published entry requirements." },
  "S1.05": { title: "Add your test scores", reason: "{course} lists a test score in its requirements." },
  "S1.05.check": { title: "Add your test scores", reason: "{course} may ask for a test score. Check this on the official page." },
  "S1.06": { title: "Ask a parent to confirm your account", reason: "Until a parent confirms, we can't save your personal details." },
  "S1.07": { title: "Invite a parent to follow along", reason: "A parent can see your plans and costs, but never your writing or scores." },
  "S1.08": { title: "Upload your CV to fill this in faster", reason: "We read your CV and suggest your qualification and grade for you to check." },
  // Stage 2
  "S2.01": { title: "Look through your matches", reason: "Shortlist the courses you'd like to look at more closely." },
  "S2.02": { title: "Find universities for your subject", reason: "We can look for more courses that fit your subject and countries." },
  "S2.03": { title: "Compare your countries", reason: "See costs, visas and work rights for {countries} side by side." },
  "S2.04": { title: "Check which English tests your matches accept", reason: "Each university lists the English tests it accepts and the score it asks for." },
  "S2.05": { title: "Close the gap to a course's minimum score", reason: "{course} asks for {minimum} in {exam}. Your best so far is {score}." },
  "S2.06": { title: "Try what-if", reason: "See which courses open up if you change one thing, like your budget or countries." },
  "S2.07": { title: "Watch courses you're unsure about", reason: "We'll tell you when {course} changes a deadline or requirement." },
  // Stage 3
  "S3.01": { title: "Build a balanced shortlist", reason: "Most students apply to 6 to 10 courses with different entry requirements." },
  "S3.02": { title: "See how your profile compares", reason: "{course} publishes entry minimums you can compare with your profile." },
  "S3.03": { title: "Check the cost of each course", reason: "Compare each course's costs with your budget before you apply." },
  "S3.04": { title: "Confirm the intake for {course}", reason: "{course} has more than one intake open." },
  "S3.05": { title: "Decide which courses you're applying to", reason: "{course} closes on {date}." },
  "S3.05.check": { title: "Decide which courses you're applying to", reason: "{course} may close soon. Check the deadline on the official page." },
  "S3.06": { title: "Look at the cost range with your parent", reason: "Talking about costs early avoids surprises later." },
  // Stage 4
  "S4.01": { title: "Work through the checklist for {course}", reason: "{course} has {count} checklist {items} still open." },
  "S4.02": { title: "Start your {rule}", reason: "This applies to applicants from {residence} going to {destination}, so start it early." },
  "S4.02-check": { title: "Check {rule} with the university", reason: "We haven't verified whether this applies to you. Check this on the official page." },
  "S4.03": { title: "Ask {recommender} for a letter", reason: "{course} asks for {count} recommendation letters." },
  "S4.03.none": { title: "Ask for your recommendation letters", reason: "{course} asks for {count} recommendation letters." },
  "S4.03.check": { title: "Ask for your recommendation letters", reason: "{course} may ask for recommendation letters. Check this on the official page." },
  "S4.04": { title: "Send a brag sheet to {recommender}", reason: "A one-page summary helps {recommender} write a specific letter." },
  "S4.05": { title: "Start your statement for {course}", reason: "{course} asks for a statement. Your writing coach asks questions; the words are yours." },
  "S4.05.check": { title: "Start your statement for {course}", reason: "{course} may ask for a statement. Check this on the official page." },
  "S4.06": { title: "Get feedback on your draft", reason: "A review points out what's unclear in {document}. It never rewrites it." },
  "S4.07": { title: "Answer {course}'s extra questions", reason: "{count} of the questions you saved for {course} have no draft yet." },
  "S4.08": { title: "Write your research statement", reason: "Research courses like {course} usually ask what you want to study and how." },
  "S4.09": { title: "Contact potential supervisors", reason: "Research courses often expect you to contact a supervisor before applying." },
  "S4.10": { title: "Build your CV", reason: "Many master's and research applications ask for a CV." },
  "S4.11": { title: "Book your test", reason: "{course} asks for a test score and you haven't saved one." },
  "S4.12": { title: "Send your {exam} score to {course}", reason: "You've saved a {exam} score. Mark it sent once the testing service sends it." },
  "S4.13": { title: "Check your passport is valid", reason: "Your passport usually needs to be valid for your whole stay." },
  "S4.14": { title: "Record the application fee", reason: "Recording each fee keeps the total cost of applying in one place." },
  "S4.15": { title: "Upload your portfolio", reason: "{course} asks for a portfolio." },
  "S4.15.check": { title: "Upload your portfolio", reason: "{course} may ask for a portfolio. Check this on the official page." },
  "S4.16": { title: "Submit {course}", reason: "Every item on the checklist is done." },
  // Stage 5
  "S5.01": { title: "Check the {course} portal", reason: "Universities post missing-document requests and decisions on their portals." },
  "S5.02": { title: "Send the missing document", reason: "Your last portal check for {course} noted something missing." },
  "S5.03": { title: "Prepare for your interview", reason: "{course} has invited you to an interview." },
  "S5.04": { title: "Record the decision", reason: "Recording the decision for {course} keeps your offers in one place." },
  "S5.05": { title: "Respond to the waitlist", reason: "A short letter of continued interest tells {course} you still want a place." },
  "S5.06": { title: "Plan for the next intake", reason: "Many students who apply again get in. Look at what to change for the next intake." },
  // Stage 6
  "S6.01": { title: "Add the details of your {course} offer", reason: "Your offer's aid and reply date let you compare it with others." },
  "S6.02": { title: "Compare the true cost of your offers", reason: "Fees, living costs and aid for each offer, side by side." },
  "S6.03": { title: "Fill in the decision matrix", reason: "Weigh your offers on what matters to you, not only on cost." },
  "S6.04": { title: "Reply to {course} by {date}", reason: "You recorded {date} as the reply date for {course}." },
  "S6.05": { title: "Meet your offer's conditions", reason: "{course}'s offer has conditions to meet before enrolling." },
  "S6.06": { title: "Pay the deposit for {course}", reason: "{course} asks for a deposit to hold your place." },
  "S6.07": { title: "Let your other universities know", reason: "Declining offers you won't take frees places for other students." },
  "S6.08": { title: "Get your admission document for the visa", reason: "Your visa application needs the admission document from {course}." },
  "S6.09": { title: "Share your outcome for research", reason: "Shared outcomes, kept separate from your account, help future students. It's optional." },
  // Stage 7
  "S7.01": { title: "Apply for your student visa", reason: "Visa processing can take weeks, so apply as soon as you can." },
  "S7.02": { title: "Prepare your proof of funds", reason: "{destination} asks students to show funds for their visa." },
  "S7.03": { title: "Apply for housing", reason: "University housing often opens early and fills fast." },
  "S7.04": { title: "Arrange health insurance", reason: "{destination} asks students to have health insurance." },
  "S7.05": { title: "Get your credential evaluation", reason: "{destination} asks for your qualifications to be evaluated." },
  "S7.06": { title: "Set up money and banking", reason: "Know how you'll pay rent and open a local account in {destination}." },
  "S7.07": { title: "Plan your arrival", reason: "Your course starts within 30 days. Check {course}'s arrival guide." },
  "S7.08": { title: "Register after you arrive", reason: "{destination} asks new residents to register their address." },
};

export const COPY: Record<"en", Record<string, CopyTemplate>> = { en };

/** Shortens text to `max` characters, ending with "…" when cut. */
export function fit(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

const PLACEHOLDER = /\{(\w+)\}/g;

function fill(template: string, params: Record<string, string>): string {
  return template.replace(PLACEHOLDER, (_, k: string) => params[k] ?? "");
}

/**
 * Fills a template and keeps it within `max`: the longest value is shortened first (so a long
 * course name gives way before the sentence does), and only then the whole text.
 */
export function fillWithin(template: string, params: Record<string, string>, max: number): string {
  const p = { ...params };
  for (let i = 0; i < 8; i++) {
    const text = fill(template, p);
    if (text.length <= max) return text;
    const used = [...template.matchAll(PLACEHOLDER)].map((m) => m[1]!);
    const longest = used.reduce<string | null>((a, k) => ((p[k]?.length ?? 0) > (p[a ?? ""]?.length ?? 0) ? k : a), null);
    if (!longest || (p[longest]?.length ?? 0) <= 12) break;
    // Each placeholder may appear more than once; share the overflow between the copies.
    const copies = used.filter((k) => k === longest).length;
    const over = Math.ceil((text.length - max) / copies);
    p[longest] = fit(p[longest]!, Math.max(12, p[longest]!.length - over));
  }
  return fit(fill(template, p), max);
}

export function render(key: string, params: Record<string, string>): { title: string; reason: string } {
  const t = en[key];
  if (!t) throw new Error(`No copy for ${key}`);
  return { title: fillWithin(t.title, params, TITLE_MAX), reason: fillWithin(t.reason, params, REASON_MAX) };
}

/** "15 January 2027", in the fact's own time zone when it has one. */
export function formatDate(iso: string, timeZone = "UTC"): string {
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  try {
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone }).format(d);
  } catch {
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d);
  }
}

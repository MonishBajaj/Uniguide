/**
 * 15.1 First-generation guide: application jargon in plain language. These are general explanations,
 * not facts about a course; a course's own requirements always come from its stored facts. Links go
 * only to the organisation that owns the term.
 */
export interface GlossaryEntry {
  term: string;
  /** What the term stands for, when it is an abbreviation. */
  expansion?: string;
  definition: string;
  link?: { href: string; label: string };
}

export const GLOSSARY = {
  sop: { term: "SOP", expansion: "Statement of purpose", definition: "An essay for postgraduate applications about what you want to study, what you have done that prepares you, and why this course. Usually 500 to 1,000 words." },
  personal_statement: { term: "Personal statement", definition: "An essay about why you want to study a subject and what you have done to explore it. Common for undergraduate applications, especially in the UK." },
  lor: { term: "LOR", expansion: "Letter of recommendation", definition: "A letter from a teacher, professor or manager about your abilities. Most courses ask for two or three and want them sent by the writer directly." },
  transcript: { term: "Transcript", definition: "The official record of every subject and grade from your school or university, issued by them. Many applications need an official copy or a certified translation." },
  gpa: { term: "GPA", expansion: "Grade point average", definition: "An average of your grades on a fixed scale, such as 4.0 or 10. Scales differ between countries, so universities convert or compare them in their own way." },
  ielts: { term: "IELTS", expansion: "International English Language Testing System", definition: "An English test scored in bands from 0 to 9. Many universities set a minimum overall band and a minimum for each section.", link: { href: "https://ielts.org", label: "IELTS" } },
  toefl: { term: "TOEFL", expansion: "Test of English as a Foreign Language", definition: "An English test. The TOEFL iBT moved to a 1 to 6 band scale in January 2026; older scores use 0 to 120, so check which scale a course states.", link: { href: "https://www.ets.org/toefl.html", label: "ETS: TOEFL" } },
  gre: { term: "GRE", expansion: "Graduate Record Examinations", definition: "A general admissions test some postgraduate courses ask for, mostly in the US. Many have made it optional.", link: { href: "https://www.ets.org/gre.html", label: "ETS: GRE" } },
  gmat: { term: "GMAT", expansion: "Graduate Management Admission Test", definition: "An admissions test for business schools, especially MBA and management masters.", link: { href: "https://www.mba.com", label: "GMAC: GMAT" } },
  ects: { term: "ECTS", expansion: "European Credit Transfer and Accumulation System", definition: "Credits used across Europe. A full year of study is 60 ECTS. Some masters ask for a minimum number from your earlier degree." },
  aps: { term: "APS", expansion: "Akademische Prüfstelle", definition: "A German office that checks academic documents from some countries, including India, China and Vietnam, before you apply to German universities or for a German student visa.", link: { href: "https://aps-india.de/", label: "APS India" } },
  cas: { term: "CAS", expansion: "Confirmation of Acceptance for Studies", definition: "A reference number a UK university gives you once you accept an unconditional offer. You need it to apply for a UK Student visa.", link: { href: "https://www.gov.uk/student-visa", label: "GOV.UK: Student visa" } },
  i20: { term: "I-20", definition: "A form a US university issues to admitted international students once they show enough funding. You need it for the F-1 visa application.", link: { href: "https://travel.state.gov/content/travel/en/us-visas/study/student-visa.html", label: "U.S. Department of State: student visas" } },
  study_permit: { term: "Study permit", definition: "Canada's permission to study, applied for after you have a letter of acceptance. It is not a visa, though you may need a visa as well.", link: { href: "https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit.html", label: "Government of Canada: study permit" } },
  proof_of_funds: { term: "Proof of funds", definition: "Documents showing you can pay tuition and living costs, such as bank statements, a loan letter or a scholarship letter. Visa offices set how much and in what form." },
  ucas: { term: "UCAS", expansion: "Universities and Colleges Admissions Service", definition: "The UK's central system for undergraduate applications. You apply to up to five courses with one personal statement.", link: { href: "https://www.ucas.com", label: "UCAS" } },
  common_app: { term: "Common App", definition: "An application system used by many US colleges for undergraduate admission. Some colleges add their own supplemental essays.", link: { href: "https://www.commonapp.org", label: "Common App" } },
  supplemental: { term: "Supplemental essay", definition: "A short extra essay answering one university's own question, such as \"Why us?\". Each university sets its own." },
  intake: { term: "Intake", definition: "When a course starts, such as autumn 2027. Deadlines, fees and requirements can differ between intakes of the same course." },
  rolling_admission: { term: "Rolling admission", definition: "Applications are reviewed as they arrive and places are offered until the course is full, so applying early can matter even before the final deadline." },
  priority_deadline: { term: "Priority deadline", definition: "An earlier date by which applications get first consideration, often for funding. Later applications may still be accepted." },
  conditional_offer: { term: "Conditional offer", definition: "A place you get once you meet stated conditions, such as final grades or an English score. Read every condition and its deadline." },
  unconditional_offer: { term: "Unconditional offer", definition: "A place with no conditions left to meet. You still need to accept it, and often pay a deposit, by the date in the offer." },
  deposit: { term: "Deposit", definition: "A payment that secures your place after you accept an offer. Check whether it is refundable, for example if your visa is refused." },
  waitlist: { term: "Waitlist", definition: "You are not admitted yet, but may be offered a place if others decline. Universities differ on whether you should send updates." },
  deferral: { term: "Deferral", definition: "Moving your place to a later intake. Some universities allow it on request; others ask you to apply again." },
  scholarship: { term: "Scholarship", definition: "Money for your studies that you do not repay. Some are automatic, many need a separate application with its own deadline." },
  assistantship: { term: "Assistantship", definition: "Paid teaching or research work during a postgraduate degree, sometimes with tuition waived. Common in US PhDs; offered by the department, not guaranteed." },
} satisfies Record<string, GlossaryEntry>;

export type TermId = keyof typeof GLOSSARY;

export const glossaryAnchor = (id: TermId) => `term-${id.replace(/_/g, "-")}`;

/** "How applying abroad works": each step and where in Uniguide to do it. */
export const STEPS: { title: string; body: string; href: string; action: string; terms: TermId[] }[] = [
  { title: "Decide what and where", body: "Pick a level and subject first, then the countries you would consider and the most you can spend on the whole course, living costs included.", href: "/courses", action: "Search courses", terms: ["intake"] },
  { title: "Check you qualify", body: "Each course lists the grades, tests and documents it asks for. Compare your own with them before you spend money on applications.", href: "/requirements", action: "Requirements table", terms: ["gpa", "ects", "transcript"] },
  { title: "Book tests early", body: "English tests and admissions tests take weeks to book and score. Find out which scores each course accepts, and which version of the test.", href: "/app/profile#scores-section", action: "Add your scores", terms: ["ielts", "toefl", "gre", "gmat"] },
  { title: "Make a shortlist with dates", body: "Put each course's deadline in one place. Some review applications as they arrive, so earlier can be better.", href: "/app/match", action: "See your matches", terms: ["rolling_admission", "priority_deadline"] },
  { title: "Write your essays", body: "Write them yourself. Admissions readers look for your own experiences and reasons; the coach asks questions and comments, but never writes for you.", href: "/app/writing", action: "Writing coach", terms: ["sop", "personal_statement", "supplemental"] },
  { title: "Ask for letters", body: "Ask your recommenders at least a month before the deadline, and tell them what each course is and when their letter is due.", href: "/app/recommenders", action: "Recommenders", terms: ["lor"] },
  { title: "Submit and keep checking", body: "After you submit, check each portal regularly. Missing documents are a common reason for delays.", href: "/app/tracker", action: "Tracker", terms: ["ucas", "common_app"] },
  { title: "Compare offers and money", body: "Compare the full cost of each offer, minus only the funding written in it, and reply by each date.", href: "/app/offers", action: "Compare offers", terms: ["conditional_offer", "unconditional_offer", "deposit", "waitlist", "scholarship", "assistantship"] },
  { title: "Apply for your visa", body: "Use your destination government's own pages and checklist, and give yourself time: some steps take weeks.", href: "/visas", action: "Visa sources", terms: ["cas", "i20", "study_permit", "aps", "proof_of_funds"] },
  { title: "Get ready to leave", body: "Housing, insurance, travel and documents, counted back from the day your course starts.", href: "/app/departure", action: "Before you leave", terms: ["deferral"] },
];

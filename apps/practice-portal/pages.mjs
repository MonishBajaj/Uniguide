// The practice portal's application, as data (M7, A1.2). This is our own invented portal for developing and
// testing assisted fill and guided apply. It copies no real portal: the sections, wording and names are ours.
// It has what real portals have and the extension must cope with: required and conditional fields, a repeated
// group, an essay with a word limit, a security check, a fee page with a waiver, a declaration, a review page
// and a confirmation page, plus dangerous controls the extension must never press.

export const SECTIONS = [
  { id: "about", title: "About you" },
  { id: "education", title: "Your education" },
  { id: "tests-activities", title: "Tests and activities" },
  { id: "statement", title: "Personal statement" },
  { id: "finish", title: "Fee and declaration" },
];

const COUNTRIES = [
  ["", "Choose a country"],
  ["IN", "India"],
  ["GB", "United Kingdom"],
  ["US", "United States"],
  ["DE", "Germany"],
  ["NG", "Nigeria"],
  ["OTHER", "Somewhere else"],
];

export const PAGES = [
  {
    id: "about-you",
    section: "about",
    title: "Your details",
    fields: [
      { name: "given_names", label: "Given names", type: "text", required: true, autocomplete: "given-name" },
      { name: "family_name", label: "Family name", type: "text", required: true, autocomplete: "family-name" },
      { name: "email", label: "Email address", type: "email", required: true, autocomplete: "email" },
      { name: "date_of_birth", label: "Date of birth", type: "date", required: true },
      { name: "country_of_residence", label: "Country you live in", type: "select", required: true, options: COUNTRIES },
      { name: "phone", label: "Phone number (optional)", type: "tel", required: false },
    ],
  },
  {
    id: "schooling",
    section: "education",
    title: "Your most recent school or college",
    fields: [
      { name: "school_name", label: "Name of school or college", type: "text", required: true },
      {
        name: "qualification",
        label: "Qualification",
        type: "select",
        required: true,
        options: [
          ["", "Choose a qualification"],
          ["cbse_12", "CBSE Class XII"],
          ["isc_12", "ISC Class XII"],
          ["ib_diploma", "IB Diploma"],
          ["a_levels", "A levels"],
          ["bachelor_4yr", "Bachelor's degree (4 years)"],
          ["other", "Another qualification"],
        ],
      },
      {
        name: "grade_scale",
        label: "How your grade is given",
        type: "select",
        required: true,
        options: [
          ["", "Choose a grading scale"],
          ["percentage", "Percentage"],
          ["gpa_4", "GPA out of 4"],
          ["gpa_10", "GPA out of 10"],
          ["ib_points", "IB points out of 45"],
        ],
      },
      { name: "grade_value", label: "Your overall grade", type: "text", required: true, hint: "Exactly as it appears on your marksheet." },
      { name: "still_studying", label: "Are you still studying there?", type: "radio", required: true, options: [["yes", "Yes"], ["no", "No"]] },
      {
        name: "expected_completion",
        label: "When do you expect to finish?",
        type: "month",
        required: true,
        showWhen: { field: "still_studying", equals: "yes" },
      },
    ],
  },
  {
    id: "tests",
    section: "tests-activities",
    title: "English language tests",
    fields: [
      { name: "english_test_taken", label: "Have you taken an English language test?", type: "radio", required: true, options: [["yes", "Yes"], ["no", "No"]] },
      {
        name: "english_test",
        label: "Which test?",
        type: "select",
        required: true,
        showWhen: { field: "english_test_taken", equals: "yes" },
        options: [
          ["", "Choose a test"],
          ["ielts_academic", "IELTS Academic"],
          ["toefl_ibt", "TOEFL iBT"],
          ["pte_academic", "PTE Academic"],
          ["duolingo", "Duolingo English Test"],
        ],
      },
      { name: "english_overall", label: "Overall score", type: "text", required: true, showWhen: { field: "english_test_taken", equals: "yes" } },
      { name: "english_date", label: "Date you took it", type: "date", required: false, showWhen: { field: "english_test_taken", equals: "yes" } },
    ],
  },
  {
    id: "activities",
    section: "tests-activities",
    title: "Activities",
    // A repeated group: at least one entry, up to five, added with "Add another activity".
    group: {
      name: "activity",
      min: 1,
      max: 5,
      fields: [
        { name: "role", label: "What you did", type: "text", required: true },
        { name: "organisation", label: "Organisation", type: "text", required: false },
        { name: "description", label: "Tell us about it", type: "textarea", required: false, maxlength: 300 },
      ],
    },
  },
  {
    id: "statement",
    section: "statement",
    title: "Personal statement",
    fields: [
      {
        name: "statement",
        label: "Why do you want to study this course?",
        type: "textarea",
        required: true,
        wordLimit: 650,
        hint: "Up to 650 words. Write it yourself.",
      },
    ],
  },
  {
    id: "security-check",
    section: "finish",
    title: "Quick security check",
    // A CAPTCHA stand-in: the extension must pause here and never answer it.
    security: true,
    fields: [{ name: "check_word", label: "Type the word PRACTICE in capital letters", type: "text", required: true }],
  },
  {
    id: "fee",
    section: "finish",
    title: "Application fee",
    // The fee must be paid, or a waiver asked for, before continuing. Both are never-click controls.
    fee: true,
    fields: [
      { name: "fee_waiver", label: "I want to ask for a fee waiver", type: "checkbox", required: false, neverClick: true },
      { name: "fee_waiver_reason", label: "Why are you asking for a waiver?", type: "textarea", required: true, showWhen: { field: "fee_waiver", equals: "on" } },
    ],
  },
  {
    id: "declaration",
    section: "finish",
    title: "Declaration",
    declaration: true,
    fields: [
      {
        name: "declare",
        label: "I declare that my application is complete and accurate, and that my personal statement is my own work.",
        type: "checkbox",
        required: true,
        neverClick: true,
      },
      { name: "signed_name", label: "Type your full name to sign", type: "text", required: true, neverFill: true },
    ],
  },
];

export const PAGE_IDS = PAGES.map((p) => p.id);

/** Every control on the portal that the extension must never press, by its id. */
export const NEVER_CLICK = [
  { id: "pay-fee", where: "fee", what: "Pays the application fee" },
  { id: "field-fee_waiver", where: "fee", what: "Asks for a fee waiver" },
  { id: "field-declare", where: "declaration", what: "Makes the declaration" },
  { id: "sign-continue", where: "declaration", what: "Signs the declaration" },
  { id: "submit-application", where: "review", what: "Submits the application" },
  { id: "withdraw-application", where: "dashboard", what: "Withdraws the application" },
];

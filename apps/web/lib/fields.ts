// Shared vocabularies for profile forms. Codes match requirements.qualification / grade_scale.

export const QUALIFICATIONS: Record<string, string> = {
  a_levels: "A-levels",
  ib: "International Baccalaureate",
  cbse: "CBSE Class XII",
  isc: "ISC Class XII",
  state_board_12: "Indian state board Class XII",
  us_high_school: "US high school diploma",
  atar: "ATAR (Australia)",
  abitur: "Abitur",
  leaving_cert: "Irish Leaving Certificate",
  bachelor_3yr: "Bachelor's degree (3 years)",
  bachelor_4yr: "Bachelor's degree (4 years)",
  bachelor_any: "Bachelor's degree (other)",
  master: "Master's degree",
};

export const GRADE_SCALES: Record<string, string> = {
  percent: "Percentage (0 to 100)",
  gpa_4: "GPA out of 4",
  gpa_10: "CGPA out of 10",
  ib_45: "IB points out of 45",
  atar: "ATAR (0 to 99.95)",
  uk_class: "UK degree class (first, 2:1, 2:2)",
  german_1_5: "German grade (1.0 best to 5.0)",
};

// ISCED-F 2013 broad fields.
export const FIELDS: Record<string, string> = {
  "01": "Education",
  "02": "Arts and humanities",
  "03": "Social sciences, journalism and information",
  "04": "Business, administration and law",
  "05": "Natural sciences, mathematics and statistics",
  "06": "Information and communication technologies",
  "07": "Engineering, manufacturing and construction",
  "08": "Agriculture, forestry, fisheries and veterinary",
  "09": "Health and welfare",
  "10": "Services",
};

export const EXAMS = [
  "ielts_academic", "ielts_ukvi", "toefl_ibt", "toefl_ibt_home", "pte_academic", "duolingo", "cambridge_c1_c2",
  "testdaf", "dsh", "goethe", "delf_dalf", "tcf", "gre", "gmat", "sat", "act",
] as const;

export const CURRENCIES = ["USD", "GBP", "EUR", "CAD", "AUD", "INR", "NZD", "SGD"] as const;

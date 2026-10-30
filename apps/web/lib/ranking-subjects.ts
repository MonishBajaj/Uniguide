/**
 * Which QS subject rankings stand for each broad field. A student's courses are ordered by the best rank their
 * university has in any of these. QS is only an ordering signal and is never shown (docs/DATA_SOURCES.md).
 */
export const FIELD_TO_QS_SUBJECTS: Record<string, readonly string[]> = {
  "01": ["Education"],
  "02": [
    "Arts & Humanities", "Archaeology", "Art & Design", "Classics & Ancient History", "English Language & Literature",
    "History", "History of Art", "Linguistics", "Modern Languages", "Music", "Performing Arts", "Philosophy",
    "Theology, Divinity & Religious Studies",
  ],
  "03": [
    "Social Sciences & Management", "Anthropology", "Communication & Media Studies", "Development Studies",
    "Economics & Econometrics", "Library & Information Management", "Politics & International Studies", "Psychology",
    "Social Policy & Administration", "Sociology",
  ],
  "04": ["Business & Management Studies", "Accounting & Finance", "Marketing", "Law", "Economics & Econometrics"],
  "05": [
    "Natural Sciences", "Biological Sciences", "Chemistry", "Earth & Marine Sciences", "Environmental Sciences",
    "Geography", "Geology", "Geophysics", "Materials Science", "Mathematics", "Physics & Astronomy",
    "Statistics & Operational Research",
  ],
  "06": ["Computer Science & Information Systems", "Data Science and Artificial Intelligence"],
  "07": [
    "Engineering & Technology", "Engineering - Chemical", "Engineering - Civil & Structural",
    "Engineering - Electrical & Electronic", "Engineering - Mechanical, Aeronautical & Manufacturing",
    "Engineering - Mineral & Mining", "Petroleum Engineering", "Architecture / Built Environment", "Materials Science",
  ],
  "08": ["Agriculture & Forestry", "Veterinary Science"],
  "09": ["Life Sciences & Medicine", "Medicine", "Nursing", "Dentistry", "Pharmacy & Pharmacology", "Anatomy & Physiology"],
  "10": ["Hospitality & Leisure Management", "Sports-related Subjects"],
};

/** The QS subjects for a student's fields, each once; field codes without a mapping add nothing. */
export function rankingSubjects(fields: string[]): string[] {
  return [...new Set(fields.flatMap((f) => FIELD_TO_QS_SUBJECTS[f] ?? []))];
}

/** The arguments of `search_programs` that depend on the student's profile. Empty lists are left out. */
export function candidateFilters(p: { target_levels: string[]; target_countries: string[]; target_fields: string[] }) {
  const subjects = rankingSubjects(p.target_fields);
  return {
    p_levels: p.target_levels as ("foundation" | "diploma" | "bachelor" | "master" | "doctorate")[],
    p_countries: p.target_countries.length ? p.target_countries : undefined,
    p_fields: p.target_fields.length ? p.target_fields : undefined,
    p_rank_subjects: subjects.length ? subjects : undefined,
  };
}

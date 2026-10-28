import type { ApplicantCategory } from "./types";

// EU member states plus Iceland, Liechtenstein and Norway.
const EEA = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV",
  "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO",
]);

/** Which applicant categories' requirements apply to this student for a program in `programCountry`. */
export function applicantCategories(residenceCountry: string, programCountry: string): ApplicantCategory[] {
  const home = residenceCountry.toUpperCase();
  const dest = programCountry.toUpperCase();
  const categories: ApplicantCategory[] = ["all"];
  if (home === dest) {
    categories.push("domestic");
    if (dest === "GB") categories.push("uk_home");
  } else {
    categories.push("international");
  }
  if (EEA.has(home) && EEA.has(dest)) categories.push("eu_eea");
  return categories;
}

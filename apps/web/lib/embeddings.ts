import "server-only";

/** Optional query embedding for the faculty matcher; without VOYAGE_API_KEY, full-text search is used. */
export async function embedQuery(text: string): Promise<number[] | null> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key || !text.trim()) return null;
  try {
    const response = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ input: [text], model: "voyage-3.5", input_type: "query", output_dimension: 1024 }),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { data: { embedding: number[] }[] };
    return body.data[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

/** ISCED-F broad field to OpenAlex fields (mirrors worker/importers/openalex.py). */
export const ISCED_TO_OPENALEX: Record<string, string[]> = {
  "01": ["Social Sciences", "Psychology"],
  "02": ["Arts and Humanities"],
  "03": ["Social Sciences", "Psychology"],
  "04": ["Business, Management and Accounting", "Economics, Econometrics and Finance", "Decision Sciences"],
  "05": ["Mathematics", "Physics and Astronomy", "Chemistry", "Biochemistry, Genetics and Molecular Biology", "Environmental Science", "Earth and Planetary Sciences", "Agricultural and Biological Sciences"],
  "06": ["Computer Science"],
  "07": ["Engineering", "Materials Science", "Chemical Engineering", "Energy"],
  "08": ["Agricultural and Biological Sciences", "Veterinary"],
  "09": ["Medicine", "Nursing", "Health Professions", "Pharmacology, Toxicology and Pharmaceutics", "Dentistry", "Neuroscience", "Immunology and Microbiology"],
  "10": ["Social Sciences"],
};

export interface Sentence {
  /** Stable reference used by reviews: S1, S2, ... in reading order. */
  id: string;
  text: string;
  paragraph: number;
  words: number;
}

const wordsIn = (text: string) => (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;

export const countWords = wordsIn;

/** Splits a draft into numbered sentences, paragraph by paragraph. */
export function segment(draft: string): Sentence[] {
  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  const sentences: Sentence[] = [];
  draft
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .forEach((paragraph, p) => {
      for (const { segment: s } of segmenter.segment(paragraph.replace(/\s+/g, " "))) {
        const text = s.trim();
        if (text) sentences.push({ id: `S${sentences.length + 1}`, text, paragraph: p + 1, words: wordsIn(text) });
      }
    });
  return sentences;
}

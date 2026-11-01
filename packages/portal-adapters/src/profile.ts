// The shape `fill_profile(p_application_id)` returns (supabase/migrations/20270107000001_assist.sql).

export type AiPolicy = "allows" | "limited" | "bans" | "unknown";

export interface FillProfile {
  application: {
    id: string;
    own: boolean;
    portal: string;
    course: { title: string | null; institution: string | null; country: string | null; level: string | null };
  };
  contact: { email: string | null; residenceCountry: string | null };
  education: {
    qualification: string | null;
    /** Exactly as the student entered it. Never converted. */
    grade: { value: number | null; text: string | null; scale: string | null };
    priorCredits: { value: number | null; system: string | null };
  };
  /** Most recent first. */
  testScores: {
    id: string;
    exam: string;
    version: string | null;
    total: number | null;
    sections: unknown;
    takenOn: string | null;
  }[];
  activities: {
    id: string;
    section: string;
    title: string | null;
    organisation: string | null;
    location: string | null;
    start: string | null;
    end: string | null;
    bullets: unknown;
  }[];
  aiPolicy: AiPolicy;
  /** Ids and sizes only; the text is fetched one field at a time after the student confirms. */
  finalDrafts: {
    documentId: string;
    kind: string;
    title: string | null;
    question: string | null;
    versionId: string;
    wordCount: number | null;
  }[];
}

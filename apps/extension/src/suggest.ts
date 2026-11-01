// What the extension keeps from the suggest-field-role function's answer (A1.6, A2.3): one of our role names, or
// nothing. No text from the answer ever reaches a page: a suggestion only names a kind of question, and an essay
// field is only ever given the student's own final draft.
import { isRole } from "@uniguide/portal-adapters";
import type { SuggestOutcome } from "./messages";

export function suggestionFrom(status: number, data: unknown): SuggestOutcome {
  if (status === 429) return { outcome: "limit" };
  if (status !== 200 || typeof data !== "object" || data === null) return { outcome: "unavailable" };
  const role = (data as { role?: unknown }).role;
  return typeof role === "string" && isRole(role) ? { outcome: "role", role } : { outcome: "none" };
}

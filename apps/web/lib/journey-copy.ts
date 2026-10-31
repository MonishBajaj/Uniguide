import { renderParentTitle, renderStep, type JourneyResult, type Locale } from "@uniguide/journey";
import { dict } from "@/lib/i18n";

/**
 * The journey as the reader sees it (M6, J6.2): steps, hidden steps and the progress line in their language. The
 * engine saves English; this translates a copy for display only, so saved states and emails don't change.
 */
export function localizeJourney<R extends Pick<JourneyResult, "stage" | "steps" | "hidden" | "stageProgress">>(result: R, locale: Locale): R {
  if (locale === "en") return result;
  return {
    ...result,
    steps: result.steps.map((s) => ({ ...s, ...renderStep(locale, s.copy.key, s.copy.params) })),
    hidden: result.hidden.map((h) => (h.copy ? { ...h, title: renderStep(locale, h.copy.key, h.copy.params).title } : h)),
    stageProgress: { ...result.stageProgress, label: localizeProgress(result.stage, result.stageProgress, locale) },
  };
}

/** The progress line in the reader's language; English keeps the engine's own label. */
export function localizeProgress(stage: number, p: { done: number; total: number; label: string }, locale: Locale): string {
  return locale === "en" ? p.label : dict(locale).journey.progress(stage, p.done, p.total);
}

/** A parent-safe step title in the reader's language, from what parent_journey() returns. */
export function parentStepTitle(s: { parentTitle: string; catalogueId?: string; params?: Record<string, string> }, locale: Locale): string {
  return (s.catalogueId && renderParentTitle(locale, s.catalogueId, s.params ?? {})) || s.parentTitle;
}

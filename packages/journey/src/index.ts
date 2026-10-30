export * from "./types";
export { ENGINE_VERSION } from "./version";
export { computeJourney } from "./engine";
export { activeApplications, computeStage, hasOpenDeadline, STAGES, type StageInfo } from "./stages";
export { checklistFields, matchingMinimumMet, profileChecklist, type ProfileChecklistItem, type ProfileFields } from "./minimum";
export { variantsFor } from "./variants";
export { CATALOGUE, ROUTES, buildCtx, evaluateCatalogue, resolveHref, type Candidate, type Ctx, type StepDef, type Subject } from "./catalogue";
export { COPY, REASON_MAX, TITLE_MAX, fit, formatDate, render } from "./copy";

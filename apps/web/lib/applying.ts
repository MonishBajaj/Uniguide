/**
 * Journey M3 (J3.2): "I'm applying to this" moves a tracked course from shortlisted to preparing.
 * Only a shortlisted application can start; preparing ones already have, and submitted, decided or
 * withdrawn ones would go backwards.
 */
export const canStartApplying = (status: string) => status === "shortlisted";

/** Where the student lands after saying they're applying: the checklist, with a short confirmation. */
export const applyingHref = (applicationId: string) => `/app/tracker/${applicationId}?applying=1#checklist`;

/**
 * 1.4 Multiple application tracks. A track replaces the profile's targets and, if it has one, the
 * budget; grades, scores and everything else still come from the profile. No track means "Main",
 * the profile's own targets.
 */
export interface TrackTargets {
  id: string;
  name: string;
  target_levels: string[];
  target_countries: string[];
  target_fields: string[];
  budget_amount: number | string | null;
  budget_currency: string | null;
}

interface ProfileTargets {
  target_levels: string[];
  target_countries: string[];
  target_fields: string[];
  budget_amount: number | string | null;
  budget_currency: string | null;
}

export function applyTrack<P extends ProfileTargets>(profile: P, track: TrackTargets | null): P {
  if (!track) return profile;
  const ownBudget = track.budget_amount != null && track.budget_currency != null;
  return {
    ...profile,
    target_levels: track.target_levels,
    target_countries: track.target_countries,
    target_fields: track.target_fields,
    budget_amount: ownBudget ? track.budget_amount : profile.budget_amount,
    budget_currency: ownBudget ? track.budget_currency : profile.budget_currency,
  };
}

/** The `?track=` value, if it names one of the student's tracks. "main" and unknown values mean none. */
export function selectedTrack<T extends { id: string }>(param: string | string[] | undefined, tracks: T[]): T | null {
  return typeof param === "string" ? (tracks.find((t) => t.id === param) ?? null) : null;
}

/** Tracker filter: all applications, those on Main (no track), or one track's. */
export function inTrack(trackId: string | null, filter: string | undefined): boolean {
  if (!filter || filter === "all") return true;
  if (filter === "main") return trackId === null;
  return trackId === filter;
}

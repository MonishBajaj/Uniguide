import type { Level, Variant } from "./types";

const VARIANT: Record<Level, Variant> = {
  foundation: "undergraduate",
  diploma: "undergraduate",
  bachelor: "undergraduate",
  master: "masters",
  doctorate: "research",
};

/** The degree variants a student follows (plan D1). Levels are a list, so a student can follow more than one. */
export function variantsFor(levels: Level[]): Variant[] {
  return [...new Set(levels.map((l) => VARIANT[l]))];
}

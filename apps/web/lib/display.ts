/**
 * 15.2 Display settings: text size, contrast and motion. Kept in one cookie so they work signed out
 * and in demo mode, and applied as data attributes on <html> before anything renders.
 */
export const DISPLAY_COOKIE = "ug_display";

export const DISPLAY_OPTIONS = {
  text: ["normal", "large", "larger"],
  contrast: ["normal", "high"],
  motion: ["normal", "reduce"],
  // 15.3 "auto" follows the browser's data saver (the Save-Data request header).
  data: ["auto", "saver", "full"],
} as const;

export type Display = { [K in keyof typeof DISPLAY_OPTIONS]: (typeof DISPLAY_OPTIONS)[K][number] };
export const DEFAULT_DISPLAY: Display = { text: "normal", contrast: "normal", motion: "normal", data: "auto" };

const keys = Object.keys(DISPLAY_OPTIONS) as (keyof Display)[];
const allowed = (key: keyof Display, value: unknown): value is Display[typeof key] =>
  (DISPLAY_OPTIONS[key] as readonly unknown[]).includes(value);

/** Reads "text=large&contrast=high"; anything unknown falls back to the default. */
export function parseDisplay(raw: string | undefined | null): Display {
  const params = new URLSearchParams(raw ?? "");
  const out = { ...DEFAULT_DISPLAY };
  for (const key of keys) {
    const value = params.get(key);
    if (allowed(key, value)) (out[key] as string) = value;
  }
  return out;
}

/** Only the settings that differ from the default; "" means all defaults. */
export function serializeDisplay(display: Display): string {
  const params = new URLSearchParams();
  for (const key of keys) if (display[key] !== DEFAULT_DISPLAY[key]) params.set(key, display[key]);
  return params.toString();
}

/** Visual settings as data attributes on <html>; data saving is applied as data-lite instead. */
export function displayAttributes(display: Display): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const key of keys) if (key !== "data" && display[key] !== DEFAULT_DISPLAY[key]) attrs[`data-${key}`] = display[key];
  return attrs;
}

/** 15.3 Low-bandwidth mode: on when chosen, or on "auto" when the browser asks to save data. */
export function liteMode(display: Display, saveDataHeader: string | null): boolean {
  if (display.data === "saver") return true;
  if (display.data === "full") return false;
  return saveDataHeader?.trim().toLowerCase() === "on";
}

/** Shorter lists in low-bandwidth mode. */
export const listSize = (normal: number, lite: boolean) => (lite ? Math.min(normal, 10) : normal);

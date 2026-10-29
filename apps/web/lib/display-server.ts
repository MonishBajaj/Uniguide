import "server-only";
import { cookies, headers } from "next/headers";
import { DISPLAY_COOKIE, liteMode, parseDisplay } from "@/lib/display";

/** The visitor's display settings and whether low-bandwidth mode is on for this request. */
export async function readDisplay() {
  const [jar, head] = await Promise.all([cookies(), headers()]);
  const display = parseDisplay(jar.get(DISPLAY_COOKIE)?.value);
  return { display, lite: liteMode(display, head.get("save-data")) };
}

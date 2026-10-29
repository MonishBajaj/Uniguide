"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { DISPLAY_COOKIE, parseDisplay, serializeDisplay } from "@/lib/display";

export async function saveDisplay(form: FormData) {
  const display = parseDisplay(new URLSearchParams([...form.entries()].map(([k, v]) => [k, String(v)])).toString());
  const value = serializeDisplay(display);
  const jar = await cookies();
  if (value) jar.set(DISPLAY_COOKIE, value, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  else jar.delete(DISPLAY_COOKIE);
  revalidatePath("/", "layout");
}

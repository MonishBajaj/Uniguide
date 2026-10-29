"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Authorisation lives in RLS: only admins can write media_items.

const done = () => {
  revalidatePath("/admin/media");
  revalidatePath("/learn");
};
const optional = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), s.nullable());

export async function addMedia(form: FormData) {
  const parsed = z
    .object({
      kind: z.enum(["video", "podcast", "webinar"]),
      title: z.string().trim().min(3).max(140),
      description: optional(z.string().max(1000)),
      url: optional(z.url({ protocol: /^https$/ })),
      starts_at: optional(z.string()),
      registration_url: optional(z.url({ protocol: /^https$/ })),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) throw new Error(parsed.error.issues[0]!.message);
  const { starts_at, ...rest } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("media_items").insert({
    ...rest,
    // datetime-local, entered in UTC as the form says.
    starts_at: starts_at ? new Date(`${starts_at}Z`).toISOString() : null,
    published: form.get("published") === "on",
  });
  if (error) throw new Error(error.message);
  done();
}

export async function setMediaPublished(id: string, published: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("media_items").update({ published }).eq("id", id);
  if (error) throw new Error(error.message);
  done();
}

export async function deleteMedia(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("media_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
  done();
}

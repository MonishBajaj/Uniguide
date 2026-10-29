"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { moved, MIME_EXT, PORTFOLIO_BUCKET, SHARE_SECONDS } from "@/lib/portfolio";
import { getUser } from "@/lib/supabase/server";

const done = () => revalidatePath("/app/portfolio");
const Text = z.object({
  title: z.string().trim().min(1, "Give it a title.").max(120),
  description: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().max(1000).nullable()),
});

export type PortfolioState = { ok: boolean; message: string } | null;

/** Records a file the browser has just uploaded into the student's own folder. */
export async function addFile(input: { title: string; description: string; path: string; mime: string }): Promise<PortfolioState> {
  const text = Text.safeParse(input);
  const mime = z.enum(Object.keys(MIME_EXT) as [keyof typeof MIME_EXT]).safeParse(input.mime);
  if (!text.success) return { ok: false, message: text.error.issues[0]!.message };
  if (!mime.success) return { ok: false, message: "Upload a PNG, JPEG or PDF." };
  const { supabase, user } = await getUser();
  const { count } = await supabase.from("portfolio_items").select("id", { count: "exact", head: true });
  const { error } = await supabase.from("portfolio_items").insert({ user_id: user!.id, kind: "file", path: input.path, mime: mime.data, sort: count ?? 0, ...text.data });
  if (error) {
    await supabase.storage.from(PORTFOLIO_BUCKET).remove([input.path]);
    return { ok: false, message: "Could not save that file. Try again." };
  }
  done();
  return { ok: true, message: "Added." };
}

export async function addLink(_prev: PortfolioState, form: FormData): Promise<PortfolioState> {
  const parsed = Text.extend({ url: z.url({ protocol: /^https$/, error: "Use a full https:// link." }) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };
  const { supabase, user } = await getUser();
  const { count } = await supabase.from("portfolio_items").select("id", { count: "exact", head: true });
  const { error } = await supabase.from("portfolio_items").insert({ user_id: user!.id, kind: "link", sort: count ?? 0, ...parsed.data });
  if (error) return { ok: false, message: "Could not save that link." };
  done();
  return { ok: true, message: "Added." };
}

export async function removeItem(id: string) {
  const { supabase } = await getUser();
  const { data: item } = await supabase.from("portfolio_items").select("path").eq("id", id).maybeSingle();
  if (item?.path) await supabase.storage.from(PORTFOLIO_BUCKET).remove([item.path]);
  await supabase.from("portfolio_items").delete().eq("id", id);
  done();
}

export async function moveItem(id: string, direction: "up" | "down") {
  const { supabase } = await getUser();
  const { data: items } = await supabase.from("portfolio_items").select("id").order("sort").order("created_at");
  for (const { id: itemId, sort } of moved(items ?? [], id, direction)) {
    await supabase.from("portfolio_items").update({ sort }).eq("id", itemId);
  }
  done();
}

/** A 7-day link to one file, for an application form or an email. */
export async function shareLink(id: string): Promise<string | null> {
  const { supabase } = await getUser();
  const { data: item } = await supabase.from("portfolio_items").select("path, url").eq("id", id).maybeSingle();
  if (!item) return null;
  if (item.url) return item.url;
  const { data } = await supabase.storage.from(PORTFOLIO_BUCKET).createSignedUrl(item.path!, SHARE_SECONDS);
  return data?.signedUrl ?? null;
}

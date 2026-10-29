"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { TablesInsert } from "@uniguide/db-types";
import { CONTACT_MESSAGES, findContactDetails, REPORT_REASONS } from "@/lib/community";
import { DESTINATIONS, LEVELS } from "@/lib/format";
import { getUser } from "@/lib/supabase/server";

const Reason = z.enum(Object.keys(REPORT_REASONS) as [keyof typeof REPORT_REASONS, ...(keyof typeof REPORT_REASONS)[]]);

export async function reportPost(postId: string, form: FormData) {
  const reason = Reason.safeParse(form.get("reason"));
  if (!reason.success) return;
  const note = String(form.get("note") ?? "").trim().slice(0, 500) || null;
  const { supabase, user } = await getUser();
  if (!user) return;
  await supabase.from("community_reports").insert({ post_id: postId, reporter_id: user.id, reason: reason.data, note });
  revalidatePath("/", "layout");
}

/** Authors can take their own post down at any time. */
export async function withdrawPost(postId: string) {
  const { supabase } = await getUser();
  await supabase.from("community_posts").delete().eq("id", postId);
  revalidatePath("/", "layout");
}

/** On failure, `values` returns what was typed: React resets a form after its action, and a story must not be lost. */
export type PostState = { ok: boolean; message: string; values?: Record<string, string> } | null;

const typed = (form: FormData) => Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));

const Base = z.object({
  pseudonym: z.string().trim().min(2, "Choose a made-up name of at least 2 characters.").max(40),
  body: z.string().trim().min(10).max(6000),
});

/**
 * Shared checks for every kind of post: no contact details, an adult account, and room in the
 * moderation queue. The database enforces all of these too; this turns them into clear messages.
 */
async function submit(row: Omit<TablesInsert<"community_posts">, "author_id">, values: Record<string, string>): Promise<PostState> {
  const fail = (message: string): PostState => ({ ok: false, message, values });
  const contact = findContactDetails(row.pseudonym, row.title, row.body);
  if (contact.length) {
    return fail(`Remove ${contact.map((k) => CONTACT_MESSAGES[k]).join(" and ")}. Posts never include contact details.`);
  }
  const { supabase, user } = await getUser();
  if (!user) return fail("Sign in to post.");
  const [{ data: allowed }, { data: pending }] = await Promise.all([
    supabase.rpc("can_post_community", { uid: user.id }),
    supabase.rpc("community_pending_count", { uid: user.id }),
  ]);
  if (!allowed) return fail("Posting is open to adults whose account is fully set up.");
  if ((pending ?? 0) >= 5) return fail("You have five posts waiting for a moderator. Please wait until they are reviewed.");
  const { error } = await supabase.from("community_posts").insert({ ...row, author_id: user.id });
  if (error) {
    if (error.code === "23505") return fail("You already have a review of this course waiting or published.");
    return fail("Could not send your post. Check it and try again.");
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Thank you. A moderator will read it before it appears; you can follow it on the Community page." };
}

const optional = <T extends z.ZodTypeAny>(schema: T) => z.preprocess((v) => (v === "" || v == null ? null : v), schema.nullable());

export async function submitStory(_prev: PostState, form: FormData): Promise<PostState> {
  const parsed = Base.extend({
    title: z.string().trim().min(3, "Give your story a title.").max(140),
    body: z.string().trim().min(200, "Tell a little more: at least 200 characters.").max(6000),
    country: optional(z.enum(DESTINATIONS)),
    level: optional(z.enum(LEVELS)),
  }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message, values: typed(form) };
  return submit({ kind: "story", ...parsed.data }, typed(form));
}

const Score = z.coerce.number().int().min(1, "Rate teaching, support and value from 1 to 5.").max(5);

export async function submitReview(programId: string, _prev: PostState, form: FormData): Promise<PostState> {
  const parsed = Base.extend({
    body: z.string().trim().min(100, "Say a little more: at least 100 characters.").max(6000),
    teaching: Score,
    support: Score,
    value: Score,
  }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message, values: typed(form) };
  const { pseudonym, body, teaching, support, value } = parsed.data;
  return submit({ kind: "review", program_id: programId, pseudonym, body, ratings: { teaching, support, value } }, typed(form));
}

export async function submitQuestion(programId: string, _prev: PostState, form: FormData): Promise<PostState> {
  const parsed = Base.extend({ body: z.string().trim().min(20, "Ask a full question: at least 20 characters.").max(1000) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message, values: typed(form) };
  return submit({ kind: "question", program_id: programId, ...parsed.data }, typed(form));
}

export async function submitAnswer(questionId: string, _prev: PostState, form: FormData): Promise<PostState> {
  const parsed = Base.extend({ body: z.string().trim().min(20, "Answer in a little more detail: at least 20 characters.").max(4000) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message, values: typed(form) };
  return submit({ kind: "answer", parent_id: questionId, ...parsed.data }, typed(form));
}

/** 11.3 Someone who studied a course asks to answer questions about it; a moderator checks first. */
export async function requestAlum(programId: string, _prev: PostState, form: FormData): Promise<PostState> {
  const parsed = z
    .object({
      graduation_year: z.coerce.number().int().min(1950).max(new Date().getFullYear() + 1),
      evidence: z.string().trim().max(500),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Give the year you finished (or will finish) the course.", values: typed(form) };
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, message: "Sign in first." };
  const { data: allowed } = await supabase.rpc("can_post_community", { uid: user.id });
  if (!allowed) return { ok: false, message: "Alumni answers are open to adults whose account is fully set up.", values: typed(form) };
  const { error } = await supabase.from("community_alumni").insert({ user_id: user.id, program_id: programId, graduation_year: parsed.data.graduation_year, evidence: parsed.data.evidence || null });
  if (error) return { ok: false, message: error.code === "23505" ? "You have already asked about this course." : "Could not send your request.", values: typed(form) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Thank you. A moderator will check and let you answer questions about this course." };
}

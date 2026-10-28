import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/supabase/server";

/** The authorship record for one document: every saved draft with how it was written. */
export async function GET(request: NextRequest, { params }: RouteContext<"/app/writing/[id]/authorship">) {
  const { id } = await params;
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  const [{ data: doc }, { data: versions }, { data: reviews }] = await Promise.all([
    supabase.from("documents").select("title, kind, created_at").eq("id", id).maybeSingle(),
    supabase.from("document_versions").select("id, body, word_count, authorship, created_at").eq("document_id", id).order("created_at"),
    supabase.from("reviews").select("version_id, kind, model, created_at"),
  ]);
  if (!doc) return new NextResponse("Not found", { status: 404 });
  const rows = (versions ?? []).map((v) => {
    const a = v.authorship as Record<string, unknown>;
    return {
      saved_at: v.created_at,
      words: v.word_count,
      sha256: createHash("sha256").update(v.body).digest("hex"),
      typed_chars: a.typed_chars ?? null,
      pasted_chars: a.pasted_chars ?? null,
      deleted_chars: a.deleted_chars ?? null,
      paste_events: Array.isArray(a.paste_events) ? a.paste_events.length : 0,
      active_seconds: a.active_seconds ?? null,
      feedback_received: (reviews ?? []).filter((r) => r.version_id === v.id).map((r) => `${r.kind} by ${r.model} on ${r.created_at}`),
    };
  });
  const record = {
    document: doc,
    statement: "Feedback tools only comment and ask questions; they do not generate text. Pasted text is recorded as pasted.",
    drafts: rows,
  };
  if (request.nextUrl.searchParams.get("format") === "csv") {
    const header = "saved_at,words,sha256,typed_chars,pasted_chars,deleted_chars,paste_events,active_seconds,feedback_received";
    const csv = [header, ...rows.map((r) => [r.saved_at, r.words, r.sha256, r.typed_chars, r.pasted_chars, r.deleted_chars, r.paste_events, r.active_seconds, `"${r.feedback_received.join("; ")}"`].join(","))].join("\n");
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="authorship-${id}.csv"` } });
  }
  return NextResponse.json(record, { headers: { "Content-Disposition": `attachment; filename="authorship-${id}.json"` } });
}

import { ImageResponse } from "next/og";
import { cleanName, shareCardLines } from "@/lib/share-card";
import { getUser } from "@/lib/supabase/server";
import { courseOf } from "@/lib/own-application";

/**
 * The "I got in" card for an admitted application, as a 1200 x 630 PNG. Only the student who owns the
 * application can make it; the optional name comes from the request and is never stored.
 */
export async function GET(request: Request, { params }: RouteContext<"/app/tracker/[id]/share-card">) {
  const { id } = await params;
  const { supabase, user } = await getUser();
  if (!user) return new Response("Not found", { status: 404 });
  const { data: app } = await supabase
    .from("applications")
    .select("user_id, decision, own_title, own_institution, program_cycles(label, programs(title, institutions(name)))")
    .eq("id", id)
    .maybeSingle();
  // RLS also lets linked parents and counselors read applications; the card is the student's alone.
  if (!app || app.user_id !== user.id || app.decision !== "admitted") return new Response("Not found", { status: 404 });

  const url = new URL(request.url);
  const lines = shareCardLines({
    title: courseOf(app).title,
    institution: courseOf(app).institution,
    intake: app.program_cycles?.label ?? null,
    name: cleanName(url.searchParams.get("name")),
  });

  const image = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#fafaf8", padding: 72, color: "#141414" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 88, fontWeight: 700, color: "#2f6b57" }}>{lines.headline}</div>
          <div style={{ fontSize: 56, fontWeight: 600, marginTop: 36, lineHeight: 1.15 }}>{lines.course}</div>
          <div style={{ fontSize: 40, marginTop: 16, color: "#5f5f5a" }}>{lines.institution}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: 30, color: "#5f5f5a" }}>
          <div style={{ display: "flex" }}>{lines.intake ? `Starting ${lines.intake}` : ""}</div>
          <div style={{ display: "flex", fontWeight: 600, color: "#141414" }}>Uniguide</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
  if (url.searchParams.get("download") === "1") {
    image.headers.set("Content-Disposition", 'attachment; filename="i-got-in.png"');
  }
  image.headers.set("Cache-Control", "private, no-store");
  return image;
}

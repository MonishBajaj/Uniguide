import { NextResponse } from "next/server";
import { COMMUNITY_ENABLED, SITE_URL } from "@/lib/env";
import { buildCalendar } from "@/lib/ics";
import { createClient } from "@/lib/supabase/server";

/** One AMA as a calendar event, with a reminder the day before. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!COMMUNITY_ENABLED) return new NextResponse("Not found", { status: 404 });
  const { id } = await params;
  const supabase = await createClient();
  const { data: ama } = await supabase.from("community_amas").select("id, title, host_name, host_role, topic, starts_at").eq("id", id).eq("published", true).maybeSingle();
  if (!ama) return new NextResponse("Not found", { status: 404 });
  const ics = buildCalendar("Uniguide AMA", [
    {
      uid: `ama-${ama.id}`,
      title: `AMA: ${ama.title} with ${ama.host_name}`,
      description: [ama.host_role, ama.topic].filter(Boolean).join(". "),
      url: `${SITE_URL}/community/ama/${ama.id}`,
      start: ama.starts_at,
      allDay: false,
      timezone: "UTC",
      alarms: [1],
    },
  ]);
  return new NextResponse(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="uniguide-ama.ics"` } });
}

import { NextResponse } from "next/server";
import { SITE_URL } from "@/lib/env";
import { buildCalendar } from "@/lib/ics";
import { createClient } from "@/lib/supabase/server";

/** One published webinar as a calendar event, with a reminder the day before. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: w } = await supabase.from("media_items").select("id, title, description, starts_at, registration_url").eq("id", id).eq("kind", "webinar").eq("published", true).maybeSingle();
  if (!w?.starts_at) return new NextResponse("Not found", { status: 404 });
  const ics = buildCalendar("Uniguide webinars", [
    { uid: `webinar-${w.id}`, title: `Webinar: ${w.title}`, description: w.description ?? undefined, url: w.registration_url ?? `${SITE_URL}/learn`, start: w.starts_at, allDay: false, timezone: "UTC", alarms: [1] },
  ]);
  return new NextResponse(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="uniguide-webinar.ics"` } });
}

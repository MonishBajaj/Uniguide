import { NextResponse, type NextRequest } from "next/server";
import { loadDeparture } from "@/lib/departure-data";
import { buildCalendar, type CalendarEvent } from "@/lib/ics";
import { getUser } from "@/lib/supabase/server";

/** The open pre-departure tasks, as all-day events on their due dates. */
export async function GET(request: NextRequest) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  const data = await loadDeparture(supabase, user.id);
  const events: CalendarEvent[] = (data?.tasks ?? [])
    .filter((t) => t.due && !data!.done.has(t.key))
    .map((t) => ({
      uid: `departure-${data!.app.id}-${t.key}`,
      title: t.title,
      description: data!.start?.approximate ? `${t.body} The date is approximate: the course start is estimated from the intake.` : t.body,
      url: t.link ?? undefined,
      start: `${t.due}T00:00:00Z`,
      allDay: true,
      timezone: "UTC",
      alarms: [3],
    }));
  return new NextResponse(buildCalendar("Uniguide pre-departure", events), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="uniguide-departure.ics"`,
    },
  });
}

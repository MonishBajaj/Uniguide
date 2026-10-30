import { NextResponse, type NextRequest } from "next/server";
import { buildCalendar, type CalendarEvent } from "@/lib/ics";
import { SITE_URL } from "@/lib/env";
import { getUser } from "@/lib/supabase/server";
import { courseLabel } from "@/lib/own-application";

/** All deadlines and dated checklist steps, or one application's, as an .ics file. */
export async function GET(request: NextRequest) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  const only = request.nextUrl.searchParams.get("application");
  const { data: profile } = await supabase.from("profiles").select("reminder_days").eq("user_id", user.id).single();

  let query = supabase
    .from("checklist_items")
    .select("id, title, due_at, done, application_id, deadlines(due_at, timezone, precision), applications(own_title, own_institution, program_cycles(programs(slug, title, institutions(name))))")
    .eq("done", false)
    .not("due_at", "is", null);
  if (only) query = query.eq("application_id", only);
  const { data } = await query;

  const events: CalendarEvent[] = (data ?? []).map((item) => {
    const program = item.applications?.program_cycles?.programs;
    const d = item.deadlines;
    return {
      uid: item.id,
      title: `${item.title}: ${courseLabel(item.applications)}`,
      description: "Confirm the date on the official page before relying on it.",
      url: program ? `${SITE_URL}/courses/${program.slug}` : undefined,
      start: d?.due_at ?? item.due_at!,
      allDay: d ? d.precision !== "exact_time" : true,
      timezone: d?.timezone ?? "UTC",
      alarms: d ? (profile?.reminder_days ?? [7, 1]) : [],
    };
  });

  // Own applications (J3.3): the deadline the student entered, as their own date, never as a checked fact.
  let own = supabase.from("applications").select("id, own_title, own_institution, own_due_at").eq("user_id", user.id).not("own_due_at", "is", null).gte("own_due_at", new Date().toISOString());
  if (only) own = own.eq("id", only);
  const { data: ownApps } = await own;
  for (const a of ownApps ?? []) {
    events.push({
      uid: `own-${a.id}`,
      title: `Deadline (your date): ${courseLabel(a)}`,
      description: "This is the date you entered. Check it with the university.",
      start: a.own_due_at!,
      allDay: true,
      timezone: "UTC",
      alarms: profile?.reminder_days ?? [7, 1],
    });
  }

  return new NextResponse(buildCalendar("Uniguide deadlines", events), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="uniguide-deadlines.ics"`,
    },
  });
}

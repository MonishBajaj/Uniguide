import { isRole, ROLE_NAMES } from "@uniguide/portal-adapters";
import { shortDate } from "@/lib/format";
import type { Dict } from "@/lib/i18n/en";
import type { Locale } from "@/lib/i18n";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Portal names are names: never translated. Only our own practice portal is described in words. */
const PORTAL_NAMES: Record<string, string> = { common_app: "Common App", ucas: "UCAS", uni_assist: "uni-assist", ouac: "OUAC", studielink: "Studielink", slate: "Slate" };

interface Run {
  id: string;
  portal: string;
  feature: string;
  started_at: string;
  ended_at: string | null;
  outcome: string | null;
  assist_events: { id: number; at: string; kind: string; field_role: string | null; page: string | null; source: string | null; reason: string | null }[];
}

/**
 * M7 A1.7: what the UniGuide Assist extension did on this application's portal. The log can't hold a value
 * (assist_events has no column for one), so this lists the field, what happened and why, never what was filled.
 * Students see their own; counselors with an active share see it read only (owner decision 2).
 */
export async function AssistLog({
  supabase,
  applicationId,
  locale,
  t,
  counselor = false,
  headingLevel = 2,
}: {
  supabase: Supabase;
  applicationId: string;
  locale: Locale;
  t: Dict["assist"];
  counselor?: boolean;
  headingLevel?: 2 | 4;
}) {
  const { data } = await supabase
    .from("assist_runs")
    .select("id, portal, feature, started_at, ended_at, outcome, assist_events(id, at, kind, field_role, page, source, reason)")
    .eq("application_id", applicationId)
    .order("started_at", { ascending: false })
    .limit(10)
    .returns<Run[]>();
  const runs = data ?? [];
  const id = `assist-log-${applicationId}`;
  const Heading = headingLevel === 2 ? "h2" : "h4";
  const field = (role: string | null) => (role && isRole(role) ? ROLE_NAMES[locale][role] : t.fieldUnknown);

  return (
    <section aria-labelledby={id} className={headingLevel === 2 ? "grid gap-3 rounded-2xl border border-border bg-surface p-6" : "grid gap-2"}>
      <div>
        <Heading id={id} className={headingLevel === 2 ? "text-lg font-semibold" : "font-semibold"}>{t.logTitle}</Heading>
        <p className="text-sm text-muted">{counselor ? t.counselorNote : t.logIntro}</p>
      </div>
      {runs.length === 0 ? <p className="text-sm text-muted">{t.logEmpty}</p> : null}
      <ul className="grid gap-2 text-sm">
        {runs.map((r) => {
          const events = [...r.assist_events].sort((a, b) => a.id - b.id);
          return (
            <li key={r.id} className="rounded-lg border border-border bg-background">
              <details>
                <summary className="cursor-pointer px-3 py-2">
                  <span className="font-semibold">{[shortDate(r.started_at), r.portal === "practice" ? t.practicePortal : (PORTAL_NAMES[r.portal] ?? r.portal), t.feature[r.feature] ?? r.feature].join(" · ")}</span>
                  <span className="text-muted"> · {r.outcome ? t.ended(t.outcome[r.outcome] ?? r.outcome) : t.stillOpen}</span>
                </summary>
                {events.length === 0 ? (
                  <p className="px-3 pb-3 text-muted">{t.noEvents}</p>
                ) : (
                  <ol className="grid gap-1 px-3 pb-3" data-run={r.id}>
                    {events.map((e) => (
                      <li key={e.id} className="assist-event flex flex-wrap gap-x-2">
                        <span className="font-semibold">{t.kind[e.kind] ?? e.kind}</span>
                        {e.field_role || e.kind !== "navigated" ? <span>· {field(e.field_role)}</span> : null}
                        {e.source ? <span className="text-muted">· {t.source(e.source)}</span> : null}
                        {e.reason ? <span className="text-muted">· {t.reason[e.reason] ?? e.reason}</span> : null}
                      </li>
                    ))}
                  </ol>
                )}
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

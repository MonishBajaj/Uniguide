import { Evidence, FactBadge } from "@/components/facts";
import { getLocale } from "@/lib/i18n/server";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

interface PolicyRow {
  policy: string;
  status: "verified" | "unverified" | "conflicting" | "unknown";
  evidence_quote: string;
  verified_at: string | null;
  created_at: string;
  sources: { url: string; owner: string } | null;
}

/**
 * M7 A1.7: the course's policy on AI help in application essays, a sourced fact like any other. Only a verified
 * "allows" lets the extension paste a final draft; anything else, including no policy, counts as a ban
 * (owner decision 3), and the page says what that means.
 */
export async function CourseAiPolicy({ supabase, programId }: { supabase: Supabase; programId: string }) {
  const { t: all } = await getLocale();
  const t = all.assist;
  const { data } = await supabase
    .from("program_ai_policies")
    .select("policy, status, evidence_quote, verified_at, created_at, sources(url, owner)")
    .eq("program_id", programId)
    .eq("published", true)
    .order("created_at", { ascending: false })
    .returns<PolicyRow[]>();
  const rows = data ?? [];
  // The latest verified policy decides; otherwise the latest one, shown as not yet checked.
  const shown = rows.find((r) => r.status === "verified") ?? rows[0] ?? null;

  return (
    <section id="ai-policy" aria-labelledby="ai-policy-title" className="grid gap-2 rounded-2xl border border-border bg-surface p-6">
      <h2 id="ai-policy-title" className="text-lg font-semibold">{t.policyTitle}</h2>
      {shown ? (
        <>
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{t.policy[shown.policy] ?? shown.policy}</span>
            <FactBadge status={shown.status} />
          </p>
          {shown.status !== "verified" ? (
            <p className="text-sm text-muted">{t.policyUnverifiedHelp}</p>
          ) : shown.policy !== "allows" ? (
            <p className="text-sm text-muted">{t.policyLimitedHelp}</p>
          ) : null}
          <Evidence source={shown.sources} quote={shown.evidence_quote} verifiedAt={shown.verified_at} />
        </>
      ) : (
        <>
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{t.policyUnknown}</span>
            <FactBadge status="unknown" />
          </p>
          <p className="text-sm text-muted">{t.policyUnknownHelp}</p>
        </>
      )}
    </section>
  );
}

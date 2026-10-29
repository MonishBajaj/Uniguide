import type { Metadata } from "next";
import { countryName, shortDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Trend insights",
  description: "What students who shared their results reported, by destination. Small groups are never shown.",
};

export default async function Insights() {
  const supabase = await createClient();
  const { data } = await supabase.from("public_insights").select("metric, dimension, value, group_size, computed_at").eq("metric", "admit_share").order("group_size", { ascending: false });
  const rows = (data ?? []).map((r) => ({ country: String((r.dimension as { country?: string }).country ?? ""), share: Number(r.value), n: r.group_size, at: r.computed_at }));

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-semibold">Trend insights</h1>
      <p className="mt-3 max-w-[680px] text-muted">
        Results shared by students who agreed to it, by destination country. A group appears only when at least 10 students
        shared, so no one can be singled out. These are reports from a self-selected group, not a prediction of your chances.
      </p>
      {rows.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-border bg-surface p-6 text-muted">Not enough shared results yet to show any group.</p>
      ) : (
        <>
          <div className="mt-8 overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-2"><tr><th scope="col" className="p-3">Destination</th><th scope="col" className="p-3">Admitted, of those decided</th><th scope="col" className="p-3">Results shared</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.country} className="border-t border-border">
                    <th scope="row" className="p-3 font-semibold">{countryName(r.country)}</th>
                    <td className="p-3">{Math.round(r.share * 100)}%</td>
                    <td className="p-3">{r.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-muted">Updated {shortDate(rows[0]!.at)}.</p>
        </>
      )}
    </div>
  );
}

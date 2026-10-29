import { COST_KINDS } from "@/lib/application-costs";
import { CURRENCIES } from "@/lib/fields";
import { addCost } from "./actions";

/** Add-a-cost form, either fixed to one application or with a choice of application. */
export function CostForm({
  applicationId,
  applications,
  defaultCurrency,
}: {
  applicationId?: string;
  applications?: { id: string; title: string }[];
  defaultCurrency: string;
}) {
  const id = applicationId ?? "all";
  return (
    <form action={addCost} className="grid gap-3 sm:grid-cols-[180px_120px_110px_170px_1fr_auto] sm:items-end">
      {applicationId ? <input type="hidden" name="application_id" value={applicationId} /> : null}
      <label className="grid gap-1 text-sm">
        What
        <select name="kind" className="field" id={`cost-kind-${id}`}>
          {Object.entries(COST_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        Amount
        <input name="amount" type="number" min="0.01" step="0.01" required className="field" id={`cost-amount-${id}`} />
      </label>
      <label className="grid gap-1 text-sm">
        Currency
        <select name="currency" defaultValue={defaultCurrency} className="field" id={`cost-currency-${id}`}>
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        Paid on
        <input name="paid_on" type="date" className="field" id={`cost-date-${id}`} />
      </label>
      {applications ? (
        <label className="grid gap-1 text-sm">
          For
          <select name="application_id" className="field" id={`cost-app-${id}`}>
            <option value="">Not one application</option>
            {applications.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
          </select>
        </label>
      ) : (
        <label className="grid gap-1 text-sm">
          Note (optional)
          <input name="note" maxLength={300} className="field" id={`cost-note-${id}`} />
        </label>
      )}
      <button className="btn btn-secondary">Add cost</button>
    </form>
  );
}

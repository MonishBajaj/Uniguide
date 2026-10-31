import Link from "next/link";
import type { Dict } from "@/lib/i18n/en";
import { shortDate } from "@/lib/format";
import { saveConditions, setEnrollmentMark } from "./actions";

export interface Accepted {
  id: string;
  title: string;
  depositDueAt: string | null;
  depositPaidAt: string | null;
  documentAt: string | null;
  conditions: { text: string; metAt: string | null } | null;
}

/** One thing to do after accepting, with its "mark done" button or when it was done. */
function Mark({ label, at, onDo, onUndo, t, children }: { label: string; at: string | null; onDo: () => Promise<void>; onUndo: () => Promise<void>; t: Dict["journey"]["enroll"]; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {at ? (
        <>
          <span className="text-sm text-verified">{t.doneOn(shortDate(at))}</span>
          <form action={onUndo}><button className="btn btn-secondary btn-sm">{t.undo}<span className="sr-only">: {label}</span></button></form>
        </>
      ) : (
        <form action={onDo}><button className="btn btn-primary btn-sm">{label}</button></form>
      )}
      {children}
    </div>
  );
}

/**
 * "After you accept" (journey M5, J5.1, G13): the conditions, the deposit and the admission document for the
 * accepted offer, each marked by the student. Dates here are the student's own, never facts.
 */
export function AfterAccept({ app, t }: { app: Accepted; t: Dict["journey"]["enroll"] }) {
  return (
    <section id="after-accept" aria-labelledby="after-accept-title" className="grid scroll-mt-24 gap-5 rounded-2xl border border-accent/40 bg-surface p-6">
      <div>
        <h2 id="after-accept-title" className="text-2xl font-semibold">{t.title}</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">{t.intro(app.title)}</p>
      </div>

      <div className="grid gap-2">
        <h3 className="font-semibold">{t.conditions}</h3>
        <form action={saveConditions.bind(null, app.id)} className="grid gap-2">
          <label htmlFor="conditions" className="text-sm text-muted">{t.conditionsHint}</label>
          <textarea id="conditions" name="conditions" rows={2} maxLength={1000} defaultValue={app.conditions?.text ?? ""} className="field" />
          <button className="btn btn-secondary btn-sm justify-self-start">{t.saveConditions}</button>
        </form>
        {app.conditions ? (
          <Mark
            label={t.conditionsMet}
            at={app.conditions.metAt}
            onDo={setEnrollmentMark.bind(null, app.id, "conditions", true)}
            onUndo={setEnrollmentMark.bind(null, app.id, "conditions", false)}
            t={t}
          />
        ) : null}
      </div>

      <div className="grid gap-2">
        <h3 className="font-semibold">{t.deposit}</h3>
        {app.depositDueAt ? <p className="text-sm text-muted">{t.replyBy(shortDate(app.depositDueAt))}</p> : null}
        <Mark
          label={t.depositPaid}
          at={app.depositPaidAt}
          onDo={setEnrollmentMark.bind(null, app.id, "deposit", true)}
          onUndo={setEnrollmentMark.bind(null, app.id, "deposit", false)}
          t={t}
        />
      </div>

      <div className="grid gap-2">
        <h3 className="font-semibold">{t.document}</h3>
        <p className="max-w-2xl text-sm text-muted">{t.documentHint}</p>
        <Mark
          label={t.documentReceived}
          at={app.documentAt}
          onDo={setEnrollmentMark.bind(null, app.id, "document", true)}
          onUndo={setEnrollmentMark.bind(null, app.id, "document", false)}
          t={t}
        />
      </div>

      <div className="grid gap-1">
        <h3 className="font-semibold">{t.housing}</h3>
        <Link href="/app/departure" className="text-sm underline underline-offset-2">{t.housingLink}</Link>
      </div>
    </section>
  );
}

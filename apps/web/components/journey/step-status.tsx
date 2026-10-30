import { restoreStep } from "@/app/app/steps/actions";
import type { Dict } from "@/lib/i18n/en";
import type { StepStatus as Status } from "@/lib/journey-actions";

/** What just happened to a step, with Undo (journey M2, J2.4). */
export function StepStatus({ status, t, from }: { status: Status | null; t: Dict["journey"]["steps"]; from: "/app" | "/app/steps" }) {
  if (!status) return null;
  const message = { snooze: t.didSnooze, dismiss: t.didDismiss, markDone: t.didMarkDone, restore: t.didRestore }[status.did];
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl bg-foreground px-4 py-3 text-sm text-background">
      <span>{message}</span>
      {status.did !== "restore" ? (
        <form action={restoreStep.bind(null, status.stepId)}>
          <input type="hidden" name="from" value={from} />
          <button className="font-semibold underline underline-offset-2">{t.undo}</button>
        </form>
      ) : null}
    </div>
  );
}

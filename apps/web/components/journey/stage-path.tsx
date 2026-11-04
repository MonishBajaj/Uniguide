import type { Dict } from "@/lib/i18n/en";

const STAGE_NUMBERS = ["1", "2", "3", "4", "5", "6", "7"] as const;

/** The seven stages as an ordered list; the current one is marked and shows its progress (spec 6.2). */
export function StagePath({
  stage,
  progress,
  t,
  headingId = "journey-path",
}: {
  stage: number;
  progress: { done: number; total: number; label: string };
  t: Dict["journey"];
  /** Unique per page: the parent view shows one path per linked student. */
  headingId?: string;
}) {
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <section aria-labelledby={headingId} className="rounded-xl border border-border bg-surface p-5 ambient-shadow grid gap-3">
      <h2 id={headingId} className="sr-only">{t.home.path}</h2>
      <ol className="grid grid-cols-7 gap-2">
        {STAGE_NUMBERS.map((n) => {
          const i = Number(n);
          const state = i < stage ? "done" : i === stage ? "now" : "later";
          return (
            <li key={n} aria-current={state === "now" ? "step" : undefined} className="grid min-w-0 gap-1.5 text-xs">
              <span
                aria-hidden="true"
                className={`h-2 rounded-full transition-all ${
                  state === "done" ? "bg-verified" : "bg-surface-container-high"
                }`}
                style={
                  state === "now"
                    ? { background: `linear-gradient(to right, var(--primary) ${pct}%, var(--surface-container-high) ${pct}%)` }
                    : undefined
                }
              />
              {/* Phones show only the bars; the summary above names the stage. Screen readers get every label. */}
              <span className={`hidden sm:block ${state === "later" ? "text-muted" : "text-foreground"} ${state === "now" ? "font-bold text-primary" : ""}`}>
                <span className="font-mono text-xs">{state === "done" ? "✓ " : ""}{n}</span> <span className="break-words">{t.stages[n].name}</span>
                {state !== "later" ? <span className="sr-only"> ({state === "done" ? t.home.stageDone : t.home.stageNow})</span> : null}
              </span>
              <span className="sr-only sm:hidden">
                {n} {t.stages[n].name}
                {state !== "later" ? ` (${state === "done" ? t.home.stageDone : t.home.stageNow})` : ""}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="flex items-center justify-between text-xs text-muted pt-1">
        <span>{progress.label}</span>
        <span className="font-semibold text-primary font-mono">{`${pct}%`}</span>
      </div>
    </section>
  );
}

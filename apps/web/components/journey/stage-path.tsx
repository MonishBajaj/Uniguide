import type { Dict } from "@/lib/i18n/en";

const STAGE_NUMBERS = ["1", "2", "3", "4", "5", "6", "7"] as const;

/** The seven stages as an ordered list; the current one is marked and shows its progress (spec 6.2). */
export function StagePath({ stage, progress, t }: { stage: number; progress: { done: number; total: number; label: string }; t: Dict["journey"] }) {
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <section aria-labelledby="journey-path" className="grid gap-3">
      <h2 id="journey-path" className="sr-only">{t.home.path}</h2>
      <ol className="grid grid-cols-7 gap-1.5">
        {STAGE_NUMBERS.map((n) => {
          const i = Number(n);
          const state = i < stage ? "done" : i === stage ? "now" : "later";
          return (
            <li key={n} aria-current={state === "now" ? "step" : undefined} className="grid min-w-0 gap-1.5 text-xs">
              <span
                aria-hidden="true"
                className={`h-1.5 rounded-full ${state === "done" ? "bg-accent/45" : "bg-border"}`}
                style={state === "now" ? { background: `linear-gradient(to right, var(--accent) ${pct}%, var(--border) ${pct}%)` } : undefined}
              />
              {/* Phones show only the bars; the summary above names the stage. Screen readers get every label. */}
              <span className={`hidden sm:block ${state === "later" ? "text-muted" : "text-foreground"} ${state === "now" ? "font-semibold" : ""}`}>
                <span className="font-mono">{state === "done" ? "✓ " : ""}{n}</span> <span className="break-words">{t.stages[n].name}</span>
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
      <p className="text-sm text-muted">{progress.label}</p>
    </section>
  );
}

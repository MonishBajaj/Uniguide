import { CV_SECTIONS } from "@/lib/cv";

type Entry = {
  section: string;
  title: string;
  organisation: string | null;
  location: string | null;
  start_month: string | null;
  end_month: string | null;
  bullets: string[];
};

/** Add or edit one CV entry. Bullets are one per line, in the student's own words. */
export function EntryForm({ action, entry, submit, idPrefix }: { action: (form: FormData) => Promise<void>; entry?: Entry; submit: string; idPrefix: string }) {
  const id = (name: string) => `${idPrefix}-${name}`;
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm" htmlFor={id("section")}>
        Section
        <select id={id("section")} name="section" defaultValue={entry?.section ?? "experience"} className="field">
          {Object.entries(CV_SECTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm" htmlFor={id("title")}>
        Title (role, degree, project or skill group)
        <input id={id("title")} name="title" required maxLength={160} defaultValue={entry?.title} className="field" />
      </label>
      <label className="grid gap-1 text-sm" htmlFor={id("organisation")}>
        Organisation (optional)
        <input id={id("organisation")} name="organisation" maxLength={160} defaultValue={entry?.organisation ?? ""} className="field" />
      </label>
      <label className="grid gap-1 text-sm" htmlFor={id("location")}>
        Place (optional)
        <input id={id("location")} name="location" maxLength={120} defaultValue={entry?.location ?? ""} className="field" />
      </label>
      <label className="grid gap-1 text-sm" htmlFor={id("start")}>
        From (optional)
        <input id={id("start")} name="start" type="month" defaultValue={entry?.start_month?.slice(0, 7) ?? ""} className="field" />
      </label>
      <div className="grid gap-1 text-sm">
        <label htmlFor={id("end")}>To</label>
        <input id={id("end")} name="end" type="month" defaultValue={entry?.end_month?.slice(0, 7) ?? ""} className="field" />
        <label className="flex items-center gap-2">
          <input type="checkbox" name="current" defaultChecked={Boolean(entry?.start_month && !entry.end_month)} className="accent-[var(--accent)]" />
          I still do this
        </label>
      </div>
      <label className="grid gap-1 text-sm sm:col-span-2" htmlFor={id("bullets")}>
        What you did, one point per line (up to 8)
        <textarea id={id("bullets")} name="bullets" rows={4} defaultValue={entry?.bullets.join("\n")} className="field" />
      </label>
      <button className="btn btn-primary justify-self-start">{submit}</button>
    </form>
  );
}

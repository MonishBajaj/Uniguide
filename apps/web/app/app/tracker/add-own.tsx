import type { Dict } from "@/lib/i18n/en";
import { DESTINATIONS, countryName } from "@/lib/format";
import { addOwnApplication } from "./actions";

/** "Add a course that isn't listed" (J3.3): the student's own words, tracked like any application. */
export function AddOwnCourse({ t, invalid }: { t: Dict["journey"]["own"]; invalid: boolean }) {
  return (
    <section id="add-own" aria-labelledby="add-own-title" className="grid gap-3 rounded-2xl border border-border bg-surface p-6 scroll-mt-24">
      <h2 id="add-own-title" className="text-lg font-semibold">{t.addTitle}</h2>
      <p className="max-w-[680px] text-muted">{t.addIntro}</p>
      {invalid ? <p role="alert" className="font-semibold text-conflicting">{t.invalid}</p> : null}
      <form action={addOwnApplication} className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-semibold">
          {t.institution}
          <input name="own_institution" required maxLength={200} className="field font-normal" />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          {t.courseTitle}
          <input name="own_title" required maxLength={200} className="field font-normal" />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          {t.country}
          <select name="own_country" required defaultValue="" className="field font-normal">
            <option value="" disabled>{t.chooseCountry}</option>
            {DESTINATIONS.map((c) => <option key={c} value={c}>{countryName(c)}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          {t.deadline}
          <input name="own_due_at" type="date" className="field font-normal" />
        </label>
        <div className="sm:col-span-2">
          <button className="btn btn-primary">{t.add}</button>
        </div>
      </form>
    </section>
  );
}

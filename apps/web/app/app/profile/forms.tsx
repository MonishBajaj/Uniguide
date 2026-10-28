"use client";

import { useActionState, useState } from "react";
import type { Tables } from "@uniguide/db-types";
import { CURRENCIES, EXAMS, FIELDS, GRADE_SCALES, QUALIFICATIONS } from "@/lib/fields";
import { LEVELS, WAVE_1, countryName, label } from "@/lib/format";
import { addTestScore, applyCvItems, readCv, saveProfile, type ExtractState, type FormState } from "./actions";

function Status({ state }: { state: FormState }) {
  if (!state) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-verified" : "text-conflicting"}`}>
      {state.message}
    </p>
  );
}

type Prefs = { preferredDelivery?: string; weights?: Record<string, number> };

export function ProfileForm({ profile }: { profile: Tables<"profiles"> }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveProfile, null);
  const prefs = (profile.preferences ?? {}) as Prefs;
  const weight = (k: string) => Math.round((prefs.weights?.[k] ?? 0.5) * 10);

  return (
    <form action={action} className="grid gap-6 rounded-2xl bg-surface p-6">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-lg font-semibold">Your most recent qualification</legend>
        <label className="grid gap-2 text-sm font-semibold sm:col-span-2">
          Qualification
          <select name="home_qualification" defaultValue={profile.home_qualification ?? ""} className="field font-normal">
            <option value="">Not set</option>
            {Object.entries(QUALIFICATIONS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Grade (number)
          <input name="grade_value" inputMode="decimal" defaultValue={profile.grade_value ?? ""} className="field font-normal" />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          On this scale
          <select name="grade_scale" defaultValue={profile.grade_scale ?? ""} className="field font-normal">
            <option value="">Not set</option>
            {Object.entries(GRADE_SCALES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold sm:col-span-2">
          Grade as written (optional)
          <input name="grade_text" maxLength={60} defaultValue={profile.grade_text ?? ""} placeholder="For example: AAB, 2:1, 8.7 CGPA" className="field font-normal" />
        </label>
        <p className="text-sm text-muted sm:col-span-2">We keep your grade on its own scale and never convert it to a 4.0 GPA.</p>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-lg font-semibold">Budget for the whole course</legend>
        <label className="grid gap-2 text-sm font-semibold">
          Amount
          <input name="budget_amount" inputMode="numeric" defaultValue={profile.budget_amount ?? ""} className="field font-normal" />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Currency
          <select name="budget_currency" defaultValue={profile.budget_currency ?? ""} className="field font-normal">
            <option value="">Not set</option>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <p className="text-sm text-muted sm:col-span-2">Include tuition, fees and living costs. Courses well over this are set aside, with the reason shown.</p>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-lg font-semibold">What and where</legend>
        <p className="mb-2 text-sm font-semibold">Levels</p>
        <div className="flex flex-wrap gap-2">
          {LEVELS.map((l) => (
            <label key={l} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm has-[:checked]:border-accent">
              <input type="checkbox" name="target_levels" value={l} defaultChecked={profile.target_levels.includes(l)} className="accent-[var(--accent)]" />
              {label(l)}
            </label>
          ))}
        </div>
        <p className="mt-4 mb-2 text-sm font-semibold">Countries you would consider</p>
        <div className="flex flex-wrap gap-2">
          {WAVE_1.map((c) => (
            <label key={c} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm has-[:checked]:border-accent">
              <input type="checkbox" name="target_countries" value={c} defaultChecked={profile.target_countries.includes(c)} className="accent-[var(--accent)]" />
              {countryName(c)}
            </label>
          ))}
        </div>
        <label className="mt-4 grid max-w-xs gap-2 text-sm font-semibold">
          Favourite among them
          <select name="favourite_country" defaultValue={profile.target_countries[0] ?? ""} className="field font-normal">
            <option value="">No favourite</option>
            {WAVE_1.map((c) => <option key={c} value={c}>{countryName(c)}</option>)}
          </select>
        </label>
        <p className="mt-4 mb-2 text-sm font-semibold">Fields of study</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(FIELDS).map(([code, name]) => (
            <label key={code} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm has-[:checked]:border-accent">
              <input type="checkbox" name="target_fields" value={code} defaultChecked={profile.target_fields.includes(code)} className="accent-[var(--accent)]" />
              {name}
            </label>
          ))}
        </div>
        <label className="mt-4 grid max-w-xs gap-2 text-sm font-semibold">
          Preferred format
          <select name="preferred_delivery" defaultValue={prefs.preferredDelivery ?? ""} className="field font-normal">
            <option value="">No preference</option>
            <option value="on_campus">On campus</option>
            <option value="online">Online</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </label>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-2 text-lg font-semibold">What matters most when ranking</legend>
        <p className="text-sm text-muted">These weights only order courses you are eligible for and can afford. They are not admission chances.</p>
        {(["field", "budget", "location", "delivery"] as const).map((k) => (
          <label key={k} className="grid grid-cols-[120px_1fr] items-center gap-3 text-sm">
            {{ field: "Subject match", budget: "Money left over", location: "Country order", delivery: "Format" }[k]}
            <input type="range" min={0} max={10} name={`weight_${k}`} defaultValue={weight(k)} className="accent-[var(--accent)]" />
          </label>
        ))}
      </fieldset>

      <Status state={state} />
      <button disabled={pending} className="btn btn-primary justify-self-start">{pending ? "Saving…" : "Save profile"}</button>
    </form>
  );
}

export function TestScoreForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(addTestScore, null);
  const [exam, setExam] = useState("ielts_academic");
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <label className="grid gap-2 text-sm font-semibold">
        Exam
        <select name="exam" value={exam} onChange={(e) => setExam(e.target.value)} className="field font-normal">
          {EXAMS.map((e) => <option key={e} value={e}>{label(e)}</option>)}
        </select>
      </label>
      {exam.startsWith("toefl") ? (
        <label className="grid gap-2 text-sm font-semibold">
          Version
          <select name="exam_version" className="field font-normal">
            <option value="2026-01">From 21 January 2026 (bands 1 to 6)</option>
            <option value="legacy">Before 21 January 2026 (0 to 120)</option>
          </select>
        </label>
      ) : null}
      <label className="grid gap-2 text-sm font-semibold">
        Date taken
        <input type="date" name="taken_on" className="field font-normal" />
      </label>
      <label className="grid gap-2 text-sm font-semibold">
        Overall score
        <input name="total" inputMode="decimal" required className="field font-normal" />
      </label>
      <fieldset className="grid grid-cols-2 gap-3 sm:col-span-2 sm:grid-cols-4">
        <legend className="mb-2 text-sm font-semibold">Section scores (if your test has them)</legend>
        {["reading", "writing", "listening", "speaking"].map((s) => (
          <label key={s} className="grid gap-1 text-sm">
            {label(s)}
            <input name={s} inputMode="decimal" className="field" />
          </label>
        ))}
      </fieldset>
      <Status state={state} />
      <button disabled={pending} className="btn btn-secondary justify-self-start">{pending ? "Adding…" : "Add score"}</button>
    </form>
  );
}

export function CvReader({ hasConsent }: { hasConsent: boolean }) {
  const [state, action, pending] = useActionState<ExtractState, FormData>(readCv, null);
  const [saveState, save, saving] = useActionState<FormState, FormData>(applyCvItems, null);
  const extraction = state?.extraction;
  const [kept, setKept] = useState<Record<string, boolean>>({});

  if (saveState?.ok) return <Status state={saveState} />;

  if (extraction) {
    const items = {
      qualification: kept.qualification ? extraction.qualification : null,
      test_scores: extraction.test_scores.filter((_, i) => kept[`score${i}`]),
    };
    return (
      <form action={save} className="grid gap-4">
        <p className="text-sm text-muted">{state?.message}</p>
        {extraction.qualification ? (
          <Proposal
            checked={Boolean(kept.qualification)}
            onChange={(v) => setKept({ ...kept, qualification: v })}
            title={`${QUALIFICATIONS[extraction.qualification.code] ?? extraction.qualification.code}${
              extraction.qualification.grade_value != null ? `, ${extraction.qualification.grade_value}` : ""
            }${extraction.qualification.grade_scale ? ` (${GRADE_SCALES[extraction.qualification.grade_scale]})` : ""}`}
            quote={extraction.qualification.quote}
            confidence={extraction.qualification.confidence}
          />
        ) : null}
        {extraction.test_scores.map((s, i) => (
          <Proposal
            key={i}
            checked={Boolean(kept[`score${i}`])}
            onChange={(v) => setKept({ ...kept, [`score${i}`]: v })}
            title={`${label(s.exam)} ${s.total ?? ""}${s.exam_version ? ` (${s.exam_version})` : ""}${s.taken_on ? `, ${s.taken_on}` : ""}`}
            quote={s.quote}
            confidence={s.confidence}
          />
        ))}
        <input type="hidden" name="items" value={JSON.stringify(items)} />
        <Status state={saveState} />
        <button disabled={saving || Object.values(kept).every((v) => !v)} className="btn btn-primary justify-self-start">
          {saving ? "Saving…" : "Save the items I kept"}
        </button>
      </form>
    );
  }

  return (
    <form action={action} className="grid gap-4">
      <label className="grid gap-2 text-sm font-semibold">
        Paste the education and test score parts of your CV or transcript
        <textarea name="cv" rows={8} maxLength={20000} className="field font-normal" />
      </label>
      {!hasConsent ? (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="ai_consent" required className="mt-1 accent-[var(--accent)]" />
          <span>
            Send this text to Anthropic&apos;s Claude to suggest profile fields. Anthropic may keep it for up to 30 days. We keep
            only a fingerprint of it, not the text.
          </span>
        </label>
      ) : null}
      <Status state={state} />
      <button disabled={pending} className="btn btn-secondary justify-self-start">{pending ? "Reading…" : "Suggest fields"}</button>
    </form>
  );
}

function Proposal(props: { checked: boolean; onChange: (v: boolean) => void; title: string; quote: string; confidence: number }) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-lg border border-border bg-background p-3 has-[:checked]:border-accent">
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} className="mt-1 accent-[var(--accent)]" />
      <span>
        <span className="block font-semibold">{props.title}</span>
        <span className="block text-sm text-muted">From your text: &ldquo;{props.quote}&rdquo;</span>
        {props.confidence < 0.7 ? <span className="block text-xs text-unverified">Low confidence: check this one carefully.</span> : null}
      </span>
    </label>
  );
}

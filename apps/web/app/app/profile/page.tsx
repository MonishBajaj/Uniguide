import type { Metadata } from "next";
import { countryName, label, money, shortDate } from "@/lib/format";
import { profileChecklist } from "@/lib/profile-completeness";
import { getUser } from "@/lib/supabase/server";
import Link from "next/link";
import { FindUniversitiesButton } from "../matching/find-button";
import { getLocale } from "@/lib/i18n/server";
import { CURRENCIES, EXAMS, FIELDS, GRADE_SCALES, QUALIFICATIONS } from "@/lib/fields";
import { deleteTestPlan, deleteTestScore, removeTrack, saveReadiness, saveTestPlan, setAiConsent } from "./actions";
import { CvReader, ProfileForm, TestScoreForm, TrackForm } from "./forms";
import {
  CheckCircle2,
  Award,
  ShieldCheck,
  Trash2,
  LayoutGrid,
  GraduationCap,
  Heart,
  FileText,
  MessageSquare,
  PlusCircle,
  Pencil,
  Camera,
} from "lucide-react";

export const metadata: Metadata = { title: "Student Profile Dashboard · UniGuide AI" };

const FLAG_MAP: Record<string, string> = {
  US: "🇺🇸 United States",
  CA: "🇨🇦 Canada",
  GB: "🇬🇧 United Kingdom",
  DE: "🇩🇪 Germany",
  AU: "🇦🇺 Australia",
  IE: "🇮🇪 Ireland",
  NL: "🇳🇱 Netherlands",
  FR: "🇫🇷 France",
  NZ: "🇳🇿 New Zealand",
  IN: "🇮🇳 India",
  SG: "🇸🇬 Singapore",
  JP: "🇯🇵 Japan",
  KR: "🇰🇷 South Korea",
  AE: "🇦🇪 UAE",
  QA: "🇶🇦 Qatar",
};

const LABELS: Record<string, string> = {
  ielts_academic: "IELTS Academic",
  ielts_ukvi: "IELTS UKVI",
  toefl_ibt: "TOEFL iBT",
  toefl_ibt_home: "TOEFL iBT Home",
  pte_academic: "PTE Academic",
  duolingo: "Duolingo",
  cambridge_c1_c2: "Cambridge C1/C2",
  testdaf: "TestDaF",
  dsh: "DSH",
  goethe: "Goethe",
  delf_dalf: "DELF/DALF",
  tcf: "TCF",
  gre: "GRE",
  gmat: "GMAT",
  sat: "SAT",
  act: "ACT",
};

function StudentAvatar({
  name,
  avatarUrl,
  size = "md",
}: {
  name: string;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const dim = size === "lg" ? "w-20 h-20 text-2xl" : size === "md" ? "w-16 h-16 text-xl" : "w-10 h-10 text-sm";
  if (avatarUrl) {
    return (
      <img
        alt={name}
        className={`${dim} rounded-full object-cover border-2 border-[#edeeef] shadow-sm shrink-0`}
        src={avatarUrl}
      />
    );
  }
  const initials =
    name
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "ST";

  return (
    <div
      aria-label={name}
      className={`${dim} rounded-full bg-gradient-to-br from-[#00183d] to-[#0f2d5c] text-white flex items-center justify-center font-serif font-bold border-2 border-white shadow-sm shrink-0 tracking-wider`}
    >
      <span>{initials}</span>
    </div>
  );
}

export default async function ProfilePage({ searchParams }: PageProps<"/app/profile">) {
  const { supabase, user } = await getUser();
  const planInvalid = (await searchParams).plan === "invalid";
  const { t: all } = await getLocale();
  const tp = all.journey.plans;
  const [{ data: profile }, { data: scores }, { data: consent }, { data: tracks }, { data: plans }, { data: readiness }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user!.id).single(),
    supabase.from("test_scores").select("*").order("taken_on", { ascending: false }),
    supabase.from("consents").select("id").eq("kind", "ai_processing").is("withdrawn_at", null).limit(1).maybeSingle(),
    supabase.from("tracks").select("*").order("created_at"),
    supabase.from("test_plans").select("id, exam, status, booked_for").eq("user_id", user!.id).order("created_at"),
    supabase.from("readiness_items").select("kind, ready, expires_on").eq("user_id", user!.id),
  ]);
  const ready = (kind: string) => (readiness ?? []).find((r) => r.kind === kind);
  const tr = all.journey.readiness;
  if (!profile) return <p>Profile not found.</p>;
  const checklist = profileChecklist(profile, (scores ?? []).length);
  const done = checklist.filter((i) => i.done).length;
  const remaining = checklist.filter((i) => !i.done);
  const pct = Math.round((done / checklist.length) * 100);

  // Derive dynamic identity from user data
  const studentName =
    profile.display_name?.trim() ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    (user?.email ? user.email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) : null) ||
    "Student";
  const avatarUrl = user?.user_metadata?.avatar_url || null;

  const prefs = (profile.preferences ?? {}) as { preferredDelivery?: string };

  return (
    <div className="flex flex-col md:flex-row min-h-[calc(100vh-64px)] bg-[#F7F6F2] relative">
      {/* LEFT SIDEBAR (Stitch Design: student_profile_dashboard) */}
      <aside className="w-full md:w-[240px] md:sticky md:top-16 md:h-[calc(100vh-64px)] bg-white border-r border-[#e1e3e4] flex flex-col shrink-0 z-30">
        {/* User Identity */}
        <div className="p-6 flex flex-col items-center text-center border-b border-[#e1e3e4]/40">
          <div className="relative group cursor-pointer mb-4">
            <StudentAvatar name={studentName} avatarUrl={avatarUrl} size="lg" />
            <a
              href="#identity"
              aria-label="Edit name"
              className="absolute inset-0 bg-[#00183d]/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Camera className="text-white h-5 w-5" />
            </a>
          </div>
          <h2 className="text-primary font-bold text-[16px]">{studentName}</h2>
          <p className="text-[13px] text-[#747780] mt-1 leading-tight">
            {profile.target_levels?.length ? profile.target_levels.map(label).join(", ") : "Graduate Studies"}
            <br />
            {profile.intake_year ? `Fall ${profile.intake_year}` : "Next Intake"}
            {profile.target_countries?.length
              ? ` | ${profile.target_countries.map(countryName).join(" & ")}`
              : profile.residence_country
              ? ` | ${countryName(profile.residence_country)}`
              : ""}
          </p>
        </div>

        {/* Progress Donut Ring */}
        <div className="p-6 flex flex-col items-center">
          <div className="relative flex items-center justify-center w-[120px] h-[120px]">
            <svg className="w-full h-full -rotate-90 origin-center" viewBox="0 0 120 120">
              <circle className="text-[#edeeef] stroke-current" cx="60" cy="60" fill="transparent" r="50" strokeWidth="8" />
              <circle
                className="text-secondary stroke-current transition-all duration-1000 ease-out"
                cx="60"
                cy="60"
                fill="transparent"
                r="50"
                strokeWidth="8"
                strokeDasharray="314.159"
                strokeDashoffset={314.159 - (314.159 * pct) / 100}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center inset-0">
              <span className="text-[18px] font-bold text-primary">{pct}%</span>
              <span className="text-[10px] text-[#c4c6d0] uppercase font-bold tracking-wider">complete</span>
            </div>
          </div>
          <p className="text-[12px] text-secondary font-semibold mt-3">
            {remaining.length} {remaining.length === 1 ? "section" : "sections"} left
          </p>
        </div>

        {/* Navigation List */}
        <nav aria-label="Profile navigation" className="flex-1 mt-2">
          <ul className="space-y-1">
            <li>
              <a href="#overview" className="flex items-center px-6 py-3 text-secondary text-sm font-bold border-l-[3px] border-secondary bg-[#fef2f2] gap-3">
                <LayoutGrid className="h-4 w-4" />
                <span>Overview</span>
              </a>
            </li>
            <li>
              <a href="#academic-bg" className="flex items-center px-6 py-3 text-[#44474f] hover:bg-[#f3f4f5] text-sm transition-colors gap-3">
                <GraduationCap className="h-4 w-4" />
                <span>Education</span>
              </a>
            </li>
            <li>
              <a href="#test-scores-card" className="flex items-center px-6 py-3 text-[#44474f] hover:bg-[#f3f4f5] text-sm transition-colors gap-3">
                <Award className="h-4 w-4" />
                <span>Certificates</span>
              </a>
            </li>
            <li>
              <Link href="/app/shortlist" className="flex items-center px-6 py-3 text-[#44474f] hover:bg-[#f3f4f5] text-sm transition-colors gap-3">
                <Heart className="h-4 w-4" />
                <span>Wishlist</span>
              </Link>
            </li>
            <li>
              <Link href="/app/cv" className="flex items-center px-6 py-3 text-[#44474f] hover:bg-[#f3f4f5] text-sm transition-colors gap-3">
                <FileText className="h-4 w-4" />
                <span>Documents</span>
              </Link>
            </li>
          </ul>
        </nav>

        {/* Bottom Support */}
        <div className="p-6 mt-auto">
          <Link href="/app/onboarding?screen=3&chat=1" className="flex items-center text-primary font-semibold text-sm hover:translate-x-1 transition-transform gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            <span>Ask Sage to update →</span>
          </Link>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 min-w-0 bg-[#F7F6F2] py-8 px-4 sm:px-6 lg:px-8 overflow-y-auto">
        <div className="max-w-[960px] mx-auto space-y-6" id="overview">
          {/* Section 1: Profile Header Card */}
          <section className="bg-white rounded-xl border border-[#e1e3e4] p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shadow-xs">
            <div className="flex items-center gap-6">
              <StudentAvatar name={studentName} avatarUrl={avatarUrl} size="md" />
              <div>
                <h1 className="text-primary font-bold text-[22px]">{studentName}</h1>
                <p className="text-[#44474f] text-sm">
                  Targeting {profile.target_levels?.length ? profile.target_levels.map(label).join(", ") : "Programs"}{" "}
                  {profile.target_fields?.length ? `in ${profile.target_fields.map((f) => FIELDS[f] ?? f).join(", ")}` : ""}
                </p>
                <div className="flex gap-2 mt-3 flex-wrap">
                  {profile.intake_year ? (
                    <span className="px-3 py-1 bg-[#e7e8e9] rounded-full text-[12px] font-semibold text-[#44474f]">
                      Fall {profile.intake_year}
                    </span>
                  ) : null}
                  {profile.target_countries?.map((c) => (
                    <span key={c} className="px-3 py-1 bg-[#e7e8e9] rounded-full text-[12px] font-semibold text-[#44474f]">
                      {countryName(c)}
                    </span>
                  ))}
                  {profile.target_fields?.map((f) => (
                    <span key={f} className="px-3 py-1 bg-[#e7e8e9] rounded-full text-[12px] font-semibold text-[#44474f]">
                      {FIELDS[f] ?? f}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 md:mt-0 flex flex-col items-end gap-3 w-full md:w-auto">
              <a
                href="#full-profile-editor"
                className="px-4 py-2 rounded-full border border-[#c4c6d0] text-[#44474f] font-semibold text-sm hover:bg-[#edeeef] transition-all flex items-center gap-2"
              >
                <Pencil className="h-4 w-4" />
                <span>Edit Profile</span>
              </a>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#747780] uppercase tracking-wider">Profile Strength</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((idx) => (
                    <div
                      key={idx}
                      className={`w-6 h-1.5 rounded-full transition-colors ${
                        idx <= Math.min(5, Math.max(1, Math.ceil(pct / 20))) ? "bg-secondary" : "bg-[#c4c6d0]/40"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Section 2: Two-column grid (2x2 Cards) */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Card A: Academic Background */}
            <div id="academic-bg" className="bg-white p-6 rounded-xl border border-[#e1e3e4] group flex flex-col justify-between shadow-xs">
              <div>
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-primary font-bold text-[18px]">Academic Background</h3>
                  <a href="#qualification" aria-label="Edit academic background">
                    <Pencil className="h-4 w-4 text-[#c4c6d0] opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" />
                  </a>
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between border-b border-[#e1e3e4]/40 pb-2">
                    <span className="text-[#44474f] text-sm">Residence</span>
                    <span className="text-primary font-semibold text-sm">
                      {profile.residence_country ? countryName(profile.residence_country) : "Not set"}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-[#e1e3e4]/40 pb-2">
                    <span className="text-[#44474f] text-sm">Qualification</span>
                    <span className="text-primary font-semibold text-sm">
                      {profile.home_qualification ? (QUALIFICATIONS[profile.home_qualification] ?? label(profile.home_qualification)) : "Not set"}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-[#e1e3e4]/40 pb-2">
                    <span className="text-[#44474f] text-sm">GPA / Grade</span>
                    <span className="text-primary font-semibold text-sm font-mono">
                      {profile.grade_value
                        ? `${profile.grade_value} (${GRADE_SCALES[profile.grade_scale ?? ""] ?? "out of 4"})`
                        : profile.grade_text || "Not set"}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-[#e1e3e4]/40 pb-2">
                    <span className="text-[#44474f] text-sm">Intake Target</span>
                    <span className="text-primary font-semibold text-sm font-mono">
                      {profile.intake_year ? `Fall ${profile.intake_year}` : "Next available"}
                    </span>
                  </div>
                </div>
              </div>
              <a
                href="#cv"
                className="mt-6 w-full py-3 rounded-xl border border-dashed border-[#c4c6d0] text-[#44474f] font-semibold text-sm hover:bg-[#f3f4f5] transition-all flex items-center justify-center gap-2"
              >
                <PlusCircle className="h-4 w-4" />
                <span>Add work experience</span>
              </a>
            </div>

            {/* Card B: Test Scores */}
            <div id="test-scores-card" className="bg-white p-6 rounded-xl border border-[#e1e3e4] flex flex-col justify-between shadow-xs">
              <div>
                <h3 className="text-primary font-bold text-[18px] mb-6">Test Scores</h3>
                <div className="flex flex-wrap gap-3 mb-8">
                  {scores?.length ? (
                    scores.map((sc) => {
                      const isEnglish = [
                        "toefl_ibt",
                        "toefl_ibt_home",
                        "ielts_academic",
                        "ielts_ukvi",
                        "pte_academic",
                        "duolingo",
                        "cambridge_c1_c2",
                      ].includes(sc.exam);
                      const examName = LABELS[sc.exam] ?? sc.exam.replace(/_/g, " ").toUpperCase();
                      return (
                        <div
                          key={sc.id}
                          className={`px-4 py-2 rounded-xl flex items-center gap-3 border ${
                            isEnglish
                              ? "bg-[#53a58a]/15 border-[#53a58a]/40 text-primary"
                              : "bg-[#7d96cb]/15 border-[#7d96cb]/40 text-primary"
                          }`}
                        >
                          <span className={`text-xs font-bold uppercase ${isEnglish ? "text-[#00513e]" : "text-[#2c4676]"}`}>
                            {examName}
                          </span>
                          <span className="text-lg font-bold font-mono text-primary">{sc.total}</span>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-xs text-[#747780] py-1">No official test scores recorded yet.</p>
                  )}
                  <a
                    href="#test-scores-section"
                    className="px-4 py-2 border border-[#c4c6d0] border-dashed rounded-xl flex items-center gap-2 text-[#747780] hover:text-primary hover:border-primary transition-colors text-xs font-bold uppercase"
                  >
                    <span>Add test</span>
                    <span className="text-base font-normal leading-none">+</span>
                  </a>
                </div>
              </div>
              <a
                href="#test-scores-section"
                className="w-full py-2 bg-[#e7e8e9] rounded-full text-primary font-bold text-sm hover:bg-[#d9dadb] transition-all text-center block"
              >
                + Add Score
              </a>
            </div>

            {/* Card C: Country & Program Preferences */}
            <div id="preferences-card" className="bg-white p-6 rounded-xl border border-[#e1e3e4] shadow-xs">
              <h3 className="text-primary font-bold text-[18px] mb-6">Country &amp; Program</h3>
              <div className="space-y-6">
                <div>
                  <label className="text-[11px] font-bold text-[#747780] uppercase mb-2 block tracking-wider">Destination Countries</label>
                  <div className="flex gap-2 flex-wrap">
                    {profile.target_countries?.length ? (
                      profile.target_countries.map((c) => (
                        <span key={c} className="px-3 py-1.5 bg-secondary text-white rounded-full text-[13px] font-semibold flex items-center gap-2 shadow-xs">
                          {FLAG_MAP[c] ?? `🌍 ${countryName(c)}`}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-[#747780]">Any country / Not set</span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-bold text-[#747780] uppercase mb-2 block tracking-wider">Annual Budget</label>
                    <span className="text-primary font-semibold text-sm font-mono">
                      {profile.budget_amount ? `${money(profile.budget_amount, profile.budget_currency ?? "USD")}/yr` : "Not set"}
                    </span>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-[#747780] uppercase mb-2 block tracking-wider">Program Type</label>
                    <div className="flex gap-2 flex-wrap">
                      {profile.target_levels?.length ? (
                        profile.target_levels.map((lvl) => (
                          <span key={lvl} className="px-2.5 py-0.5 bg-[#e7e8e9] rounded text-[12px] font-semibold text-primary">
                            {label(lvl)}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-[#747780]">Not set</span>
                      )}
                      {prefs.preferredDelivery ? (
                        <span className="px-2.5 py-0.5 bg-[#e7e8e9] rounded text-[12px] font-semibold text-primary">
                          {label(prefs.preferredDelivery)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card D: Career Goals */}
            <div className="bg-white p-6 rounded-xl border border-[#e1e3e4] flex flex-col justify-between shadow-xs">
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-primary font-bold text-[18px]">Career Goals</h3>
                  <a href="#research" aria-label="Edit career goals">
                    <Pencil className="h-4 w-4 text-[#c4c6d0] hover:text-primary transition-colors cursor-pointer" />
                  </a>
                </div>
                <p className="text-sm text-[#44474f] leading-relaxed">
                  {profile.research_interests ||
                    "No career goals or research interests recorded yet. Add your intended field of study or career goals to refine match accuracy."}
                </p>
              </div>
              <div className="mt-4 pt-4 border-t border-[#e1e3e4]/40 flex justify-between items-center">
                <span className="text-[11px] text-[#747780] italic">
                  {profile.updated_at ? `Updated ${shortDate(profile.updated_at)}` : "Recently saved"}
                </span>
                {profile.research_interests ? <CheckCircle2 className="h-5 w-5 text-secondary" /> : null}
              </div>
            </div>
          </section>

          {/* Section 3: Analytics Chart Card */}
          <section className="bg-white p-8 rounded-xl border border-[#e1e3e4] shadow-xs">
            <h3 className="text-primary font-bold text-[20px] mb-8 font-serif">How your profile compares to admitted students</h3>
            <div className="space-y-10">
              {/* Top 10 Schools */}
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-sm font-bold text-primary">Top 10 Schools</h4>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 bg-secondary rounded-full" />
                      <span className="text-[10px] uppercase font-bold text-[#747780]">You</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 border-2 border-dashed border-primary rounded-full" />
                      <span className="text-[10px] uppercase font-bold text-[#747780]">Admitted Avg</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  {/* GPA */}
                  {profile.grade_value != null ? (
                    <div className="relative h-6 w-full bg-[#e7e8e9] rounded-full overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 bg-secondary rounded-full transition-all duration-1000"
                        style={{ width: `${Math.min(100, Math.max(15, Math.round((profile.grade_value / 4.0) * 100)))}%` }}
                      />
                      <div className="absolute inset-y-0 left-[95%] border-l-2 border-dashed border-primary z-10" />
                      <div className="absolute inset-0 flex items-center px-4 justify-between">
                        <span className="text-[11px] font-bold text-white z-20">GPA: {profile.grade_value}</span>
                        <span className="text-[11px] font-bold text-primary z-20">Target: 3.92</span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-[#f3f4f5] rounded-xl text-xs text-[#747780]">
                      Add your numerical GPA in the editor to view Top 10 academic benchmark comparisons.
                    </div>
                  )}

                  {/* Standardized Test Score */}
                  {scores?.length ? (
                    scores.slice(0, 1).map((sc) => {
                      const examName = LABELS[sc.exam] ?? sc.exam.toUpperCase();
                      const num = Number(sc.total) || 0;
                      const isToefl = sc.exam.includes("toefl");
                      const isIelts = sc.exam.includes("ielts");
                      const isGre = sc.exam.includes("gre");

                      const pctWidth = isToefl
                        ? Math.min(100, Math.round((num / 120) * 100))
                        : isIelts
                        ? Math.min(100, Math.round((num / 9) * 100))
                        : isGre
                        ? Math.min(100, Math.round(((num - 260) / 80) * 100))
                        : 85;
                      const targetStr = isToefl ? "108" : isIelts ? "7.5" : isGre ? "328" : "Above Min";
                      const targetPos = isToefl ? "left-[90%]" : isIelts ? "left-[83%]" : isGre ? "left-[85%]" : "left-[80%]";

                      return (
                        <div key={sc.id} className="relative h-6 w-full bg-[#e7e8e9] rounded-full overflow-hidden">
                          <div
                            className="absolute inset-y-0 left-0 bg-secondary rounded-full transition-all duration-1000"
                            style={{ width: `${Math.max(15, pctWidth)}%` }}
                          />
                          <div className={`absolute inset-y-0 ${targetPos} border-l-2 border-dashed border-primary z-10`} />
                          <div className="absolute inset-0 flex items-center px-4 justify-between">
                            <span className="text-[11px] font-bold text-white z-20">{examName}: {sc.total}</span>
                            <span className="text-[11px] font-bold text-primary z-20">Target: {targetStr}</span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-3 bg-[#f3f4f5] rounded-xl text-xs text-[#747780]">
                      No standardized test recorded. <a href="#test-scores-section" className="text-secondary font-semibold underline">Add test score</a> to view test benchmarks.
                    </div>
                  )}
                </div>
              </div>

              {/* Top 50 Schools */}
              <div>
                <h4 className="text-sm font-bold text-primary mb-4">Top 50 Schools</h4>
                <div className="space-y-4">
                  {profile.grade_value != null ? (
                    <div className="relative h-6 w-full bg-[#e7e8e9] rounded-full overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 bg-secondary rounded-full transition-all duration-1000"
                        style={{ width: `${Math.min(100, Math.max(20, Math.round((profile.grade_value / 4.0) * 100)))}%` }}
                      />
                      <div className="absolute inset-y-0 left-[88%] border-l-2 border-dashed border-primary z-10" />
                      <div className="absolute inset-0 flex items-center px-4">
                        <span className="text-[11px] font-bold text-white z-20">
                          GPA: {profile.grade_value >= 3.7 ? "Well Above Average" : profile.grade_value >= 3.3 ? "Competitive" : "Average"}
                        </span>
                      </div>
                    </div>
                  ) : null}

                  {scores?.length ? (
                    scores.slice(0, 1).map((sc) => {
                      const num = Number(sc.total) || 0;
                      const isToefl = sc.exam.includes("toefl");
                      const isIelts = sc.exam.includes("ielts");
                      const isGre = sc.exam.includes("gre");
                      const rating = isToefl
                        ? (num >= 105 ? "Highly Competitive" : num >= 95 ? "Competitive" : "Meets Minimum")
                        : isIelts
                        ? (num >= 7.5 ? "Highly Competitive" : num >= 6.5 ? "Competitive" : "Meets Minimum")
                        : isGre
                        ? (num >= 320 ? "Highly Competitive" : num >= 310 ? "Competitive" : "Average")
                        : "Competitive";

                      return (
                        <div key={sc.id} className="relative h-6 w-full bg-[#e7e8e9] rounded-full overflow-hidden">
                          <div className="absolute inset-y-0 left-0 bg-secondary w-[90%] rounded-full transition-all duration-1000" />
                          <div className="absolute inset-y-0 left-[82%] border-l-2 border-dashed border-primary z-10" />
                          <div className="absolute inset-0 flex items-center px-4">
                            <span className="text-[11px] font-bold text-white z-20">
                              {LABELS[sc.exam] ?? sc.exam.toUpperCase()}: {rating}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          {/* Section 4: Completion Banner */}
          <section className="bg-secondary p-8 rounded-xl shadow-lg relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-[#fe694a]/20 to-transparent opacity-50" />
            <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="flex-1">
                {remaining.length === 0 ? (
                  <>
                    <h3 className="text-white font-bold text-[20px] mb-2 font-serif">
                      Your profile is 100% complete and ready for university matching!
                    </h3>
                    <p className="text-white/80 text-xs">
                      All criteria used for admissions requirements, matching, and cost estimations are verified.
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="text-white font-bold text-[20px] mb-4">
                      Complete {remaining.length} more {remaining.length === 1 ? "section" : "sections"} to unlock your personalized match list →
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {remaining.slice(0, 3).map((item) => (
                        <a
                          key={item.key}
                          href={item.href}
                          className="px-4 py-1.5 border border-white/40 bg-white/10 rounded-full text-white text-[13px] font-semibold flex items-center gap-2 hover:bg-white/20 transition-all cursor-pointer"
                        >
                          <span className="text-base font-normal leading-none">+</span> {item.label}
                        </a>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <Link
                href="/app/match"
                className="whitespace-nowrap px-8 py-3 bg-white text-secondary font-bold rounded-full shadow-sm hover:scale-105 transition-transform"
              >
                View My Matches →
              </Link>
            </div>
          </section>

          {/* Section 5: Full Detailed Profile Editor */}
          <div id="full-profile-editor" className="space-y-6 pt-4">
            <div className="border-b border-[#e1e3e4] pb-3">
              <h2 className="font-serif font-bold text-2xl text-primary">Edit Profile Details</h2>
              <p className="text-xs text-[#747780] mt-1">
                Update your qualifications, budget, and targets. Matching updates instantly without hallucinations.
              </p>
            </div>

            <section aria-labelledby="complete" className="rounded-xl border border-[#e1e3e4] bg-white p-6 sm:p-8 shadow-xs space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="complete" className="font-serif font-bold text-base text-primary">What matching needs from you</h2>
                <span className="text-xs font-semibold text-[#747780]">{done} of {checklist.length} done</span>
              </div>
              {done === checklist.length ? (
                <p className="text-xs text-verified font-medium flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  Everything matching uses is filled in. Keep it current as your plans change.
                </p>
              ) : (
                <ul className="grid gap-2 text-xs">
                  {checklist.map((item) => (
                    <li key={item.key} className="flex items-center gap-2">
                      <span aria-hidden="true" className={item.done ? "text-verified font-bold" : "text-[#747780]/60"}>
                        {item.done ? "✓" : "○"}
                      </span>
                      {item.done ? (
                        <span className="text-[#747780] line-through">{item.label}<span className="sr-only"> (done)</span></span>
                      ) : (
                        <span>
                          <a href={item.href} className="font-semibold text-primary underline underline-offset-2 hover:text-secondary">{item.label}</a>
                          <span className="text-[#747780]"> · {item.why}</span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="find" className="rounded-xl border border-[#e1e3e4] bg-white p-6 sm:p-8 shadow-xs">
              <h2 id="find" className="font-serif font-bold text-lg text-primary mb-2">Find universities for me</h2>
              <p className="text-xs text-[#747780] mb-4">We choose courses that fit this profile and read their official pages for deadlines, requirements and fees. Save your profile first.</p>
              <FindUniversitiesButton />
            </section>

            <section aria-labelledby="form-heading">
              <h2 id="form-heading" className="sr-only">Profile details</h2>
              <ProfileForm profile={profile} />
            </section>

            {/* Test Scores Manager */}
            <section id="test-scores-section" aria-labelledby="scores-section" className="rounded-xl border border-[#e1e3e4] bg-white p-6 sm:p-8 shadow-xs grid gap-5">
              <div className="flex items-center gap-2 border-b border-[#e1e3e4] pb-3">
                <Award className="h-5 w-5 text-secondary" />
                <h2 id="scores-section" className="font-serif text-xl font-bold text-primary scroll-mt-24">Official Test Scores</h2>
              </div>
              <p className="text-xs text-[#747780]">
                Add your taken test scores (GRE, GMAT, TOEFL, IELTS). Matching compares them directly against verified course minimums.
              </p>
              {scores?.length ? (
                <div className="grid gap-3">
                  {scores.map((sc) => (
                    <div key={sc.id} className="flex items-center justify-between gap-4 p-4 rounded-xl bg-[#f3f4f5] border border-[#e1e3e4]">
                      <div>
                        <span className="font-serif text-base font-bold text-primary">{label(sc.exam)}</span>
                        <div className="text-xs text-[#747780] mt-0.5">
                          Score: <strong className="text-primary font-mono">{sc.total}</strong>
                          {sc.taken_on ? ` · Taken on ${sc.taken_on}` : ""}
                        </div>
                      </div>
                      <form action={deleteTestScore.bind(null, sc.id)}>
                        <button className="text-xs text-conflicting hover:underline inline-flex items-center gap-1">
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Delete</span>
                        </button>
                      </form>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#747780]">No test scores recorded yet.</p>
              )}
              <div className="pt-2">
                <h3 className="font-semibold text-sm text-primary mb-3">Add a new score</h3>
                <TestScoreForm />
              </div>
            </section>

            {/* Test Plans */}
            <section id="test-plans" aria-labelledby="test-plans-title" className="grid scroll-mt-24 gap-4 rounded-xl border border-[#e1e3e4] bg-white p-6 sm:p-8 shadow-xs">
              <h2 id="test-plans-title" className="font-serif text-xl font-bold text-primary">{tp.title}</h2>
              <p className="text-xs text-[#747780]">{tp.intro}</p>
              {plans?.length ? (
                <ul className="grid gap-2">
                  {plans.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-4 p-3 rounded-xl bg-[#f3f4f5] border border-[#e1e3e4] text-xs">
                      <div>
                        <span className="font-bold text-primary">{label(p.exam)}</span> · <span className="text-[#747780]">{p.status === "booked" ? tp.booked : tp.notTaken}</span>
                        {p.booked_for ? ` · ${p.booked_for}` : ""}
                      </div>
                      <form action={deleteTestPlan.bind(null, p.id)}>
                        <button className="text-conflicting hover:underline text-xs">Delete</button>
                      </form>
                    </li>
                  ))}
                </ul>
              ) : null}
              <form action={saveTestPlan} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end pt-2">
                <label className="grid gap-1 text-xs font-semibold">
                  {tp.exam}
                  <select name="exam" required className="field text-sm font-normal">
                    {EXAMS.map((e) => <option key={e} value={e}>{label(e)}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-semibold">
                  {tp.status}
                  <select name="status" className="field text-sm font-normal">
                    <option value="not_taken">{tp.notTaken}</option>
                    <option value="booked">{tp.booked}</option>
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-semibold">
                  {tp.bookedFor}
                  <input type="date" name="booked_for" className="field text-sm font-normal" />
                </label>
                <button className="btn btn-secondary btn-sm">{tp.save}</button>
              </form>
            </section>

            {/* Readiness */}
            <section id="readiness" aria-labelledby="readiness-title" className="grid scroll-mt-24 gap-4 rounded-xl border border-[#e1e3e4] bg-white p-6 sm:p-8 shadow-xs">
              <h2 id="readiness-title" className="font-serif text-xl font-bold text-primary">{tr.title}</h2>
              <p className="text-xs text-[#747780]">{tr.intro}</p>
              <form action={saveReadiness} className="grid gap-3 text-xs">
                <label className="grid max-w-xs gap-1 font-semibold">
                  {tr.passport}
                  <input type="date" name="passport_expires" defaultValue={ready("passport")?.expires_on ?? ""} className="field text-sm font-normal" />
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="transcript_ready" defaultChecked={ready("transcript")?.ready ?? false} className="accent-primary" />
                  <span>{tr.transcript}</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="translation_ready" defaultChecked={ready("translation")?.ready ?? false} className="accent-primary" />
                  <span>{tr.translation}</span>
                </label>
                <button className="btn btn-secondary btn-sm justify-self-start">{tr.save}</button>
              </form>
            </section>

            {/* Application Tracks */}
            <section id="tracks" aria-labelledby="tracks-title" className="grid scroll-mt-24 gap-4 rounded-xl border border-[#e1e3e4] bg-white p-6 sm:p-8 shadow-xs">
              <div>
                <h2 id="tracks-title" className="font-serif text-xl font-bold text-primary">Application Tracks</h2>
                <p className="text-xs text-[#747780] mt-1 leading-relaxed">
                  Applying for two different fields or degrees, such as an MS and an MBA? Give each its own levels, countries, subjects, and budget.
                </p>
              </div>
              {(tracks ?? []).length ? (
                <ul className="grid gap-2 text-xs">
                  {tracks!.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-[#f3f4f5] border border-[#e1e3e4]">
                      <div>
                        <Link href={`/app/match?track=${t.id}`} className="font-bold text-primary underline-offset-2 hover:underline">{t.name}</Link>
                        <span className="text-[#747780]">
                          {" · "}{t.target_levels.map(label).join(", ")}
                          {" · "}{t.target_countries.length ? t.target_countries.map(countryName).join(", ") : "any country"}
                          {t.budget_amount && t.budget_currency ? ` · budget ${Number(t.budget_amount).toLocaleString("en")} ${t.budget_currency}` : ""}
                        </span>
                      </div>
                      <form action={removeTrack.bind(null, t.id)}>
                        <button className="btn btn-secondary btn-sm text-xs" aria-label={`Remove the ${t.name} track`}>Remove</button>
                      </form>
                    </li>
                  ))}
                </ul>
              ) : null}
              <details className="rounded-xl border border-[#e1e3e4] p-4 group">
                <summary className="cursor-pointer font-bold text-xs text-primary flex items-center justify-between">
                  <span>Add a track</span>
                  <span className="text-[#747780] group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="mt-4"><TrackForm /></div>
              </details>
            </section>

            {/* CV Reader */}
            <section id="cv" aria-labelledby="cv-reader-title" className="rounded-xl border border-[#e1e3e4] bg-white p-6 sm:p-8 shadow-xs">
              <h2 id="cv-reader-title" className="font-serif text-xl font-bold text-primary mb-2">Import from Resume / CV</h2>
              <p className="text-xs text-[#747780] mb-4">Paste or upload your CV text to automatically extract and populate education and test scores.</p>
              <CvReader hasConsent={Boolean(consent)} />
            </section>

            {/* AI Privacy & Consent */}
            <section id="ai" aria-labelledby="ai-consent" className="rounded-xl border border-[#e1e3e4] bg-white p-6 sm:p-8 shadow-xs">
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <h2 id="ai-consent" className="font-serif text-lg font-bold text-primary">AI Features & Privacy</h2>
              </div>
              <p className="text-xs text-[#747780] leading-relaxed mb-4">
                The CV reader, setup chat, course questions and result explanations send the text involved to Claude, which may keep it for up to 30 days. Facts about courses never come from the AI.
              </p>
              <form action={setAiConsent.bind(null, !consent)}>
                <button className={`btn btn-sm ${consent ? "btn-secondary" : "btn-coral-bright shadow-xs"}`}>
                  {consent ? "Disable AI features" : "Enable AI features"}
                </button>
              </form>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

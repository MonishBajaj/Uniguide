import { AlumRequestForm, AnswerForm, QuestionForm } from "@/components/alum-forms";
import { CommunityPost } from "@/components/community-post";
import { ReviewForm } from "@/components/review-form";
import { MIN_REVIEWS_FOR_AVERAGE, ratingSummary, type Ratings } from "@/lib/community";
import { COMMUNITY_ENABLED } from "@/lib/env";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const SCALE_LABELS: Record<keyof Ratings, string> = { teaching: "Teaching", support: "Support", value: "Value" };

/** Part 3 on course pages: student reviews (11.1) and questions for alumni (11.3). Nothing renders while community features are off. */
export async function CourseCommunity({ supabase, programId, userId }: { supabase: Supabase; programId: string; userId: string | null }) {
  if (!COMMUNITY_ENABLED) return null;
  const [{ data: reviews }, { data: admitted }, { data: questions }, { data: alum }, { data: myRequest }] = await Promise.all([
    supabase
      .from("community_posts")
      .select("id, pseudonym, badge, body, ratings, created_at")
      .eq("program_id", programId)
      .eq("kind", "review")
      .eq("status", "published")
      .order("created_at", { ascending: false }),
    userId ? supabase.rpc("admitted_to", { uid: userId, p_program: programId }) : Promise.resolve({ data: false }),
    supabase
      .from("community_posts")
      .select("id, pseudonym, badge, body, created_at")
      .eq("program_id", programId)
      .eq("kind", "question")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(30),
    userId ? supabase.rpc("is_alum", { uid: userId, p_program: programId }) : Promise.resolve({ data: false }),
    userId ? supabase.from("community_alumni").select("status").eq("program_id", programId).eq("user_id", userId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const questionIds = (questions ?? []).map((q) => q.id);
  const { data: answers } = questionIds.length
    ? await supabase.from("community_posts").select("id, parent_id, pseudonym, badge, body, created_at").eq("kind", "answer").eq("status", "published").in("parent_id", questionIds).order("created_at")
    : { data: [] };
  const list = reviews ?? [];
  const summary = ratingSummary(list.map((r) => r.ratings as Ratings));

  return (
    <>
    <section aria-labelledby="reviews" className="mt-12 grid gap-4">
      <div>
        <h2 id="reviews" className="text-2xl font-semibold">Student reviews</h2>
        <p className="mt-1 text-sm text-muted">
          From students who say they were admitted to this course. Self-reported and read by a moderator, but not verified
          by us; one person&apos;s experience is not the course&apos;s facts.
        </p>
      </div>
      {summary.averages ? (
        <dl className="flex flex-wrap gap-6 rounded-2xl border border-border bg-surface p-5">
          {(Object.keys(SCALE_LABELS) as (keyof Ratings)[]).map((k) => (
            <div key={k}>
              <dt className="text-sm text-muted">{SCALE_LABELS[k]}</dt>
              <dd className="text-2xl font-semibold">{summary.averages![k]}<span className="text-sm font-normal text-muted"> / 5</span></dd>
            </div>
          ))}
          <div>
            <dt className="text-sm text-muted">Reviews</dt>
            <dd className="text-2xl font-semibold">{summary.count}</dd>
          </div>
        </dl>
      ) : (
        <p className="text-sm text-muted">
          Averages appear once {MIN_REVIEWS_FOR_AVERAGE} students have reviewed this course ({summary.count} so far).
        </p>
      )}
      {list.map((r) => {
        const ratings = r.ratings as Ratings;
        return (
          <CommunityPost key={r.id} post={r} signedIn={Boolean(userId)}>
            <p className="text-xs text-muted">{(Object.keys(SCALE_LABELS) as (keyof Ratings)[]).map((k) => `${SCALE_LABELS[k]} ${ratings[k]}/5`).join(" · ")}</p>
          </CommunityPost>
        );
      })}
      {admitted ? (
        <ReviewForm programId={programId} />
      ) : userId ? (
        <p className="text-sm text-muted">You can review this course once you record an admission to it in your tracker.</p>
      ) : null}
    </section>
    <section aria-labelledby="alumni" className="mt-12 grid gap-4">
      <div>
        <h2 id="alumni" className="text-2xl font-semibold">Ask an alum</h2>
        <p className="mt-1 text-sm text-muted">
          Questions answered by people who studied this course, checked by a moderator. There are no private messages;
          everything stays here.
        </p>
      </div>
      {(questions ?? []).length === 0 ? <p className="text-sm text-muted">No questions yet.</p> : null}
      {(questions ?? []).map((q) => {
        const replies = (answers ?? []).filter((a) => a.parent_id === q.id);
        return (
          <CommunityPost key={q.id} post={q} signedIn={Boolean(userId)}>
            {replies.length ? (
              <div className="grid gap-2 border-l-2 border-border pl-4">
                {replies.map((a) => <CommunityPost key={a.id} post={a} signedIn={Boolean(userId)} headingLevel={4} />)}
              </div>
            ) : <p className="text-xs text-muted">No answer yet.</p>}
            {alum ? <AnswerForm questionId={q.id} /> : null}
          </CommunityPost>
        );
      })}
      {userId ? <QuestionForm programId={programId} /> : <p className="text-sm text-muted">Sign in to ask a question.</p>}
      {userId && !alum ? (
        myRequest ? (
          <p className="text-sm text-muted">{myRequest.status === "pending" ? "Your request to answer as an alum is waiting for a moderator." : "Your request to answer as an alum was not approved."}</p>
        ) : (
          <AlumRequestForm programId={programId} />
        )
      ) : null}
    </section>
    </>
  );
}
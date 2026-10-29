import { CommunityPost } from "@/components/community-post";
import { ReviewForm } from "@/components/review-form";
import { MIN_REVIEWS_FOR_AVERAGE, ratingSummary, type Ratings } from "@/lib/community";
import { COMMUNITY_ENABLED } from "@/lib/env";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const SCALE_LABELS: Record<keyof Ratings, string> = { teaching: "Teaching", support: "Support", value: "Value" };

/** Part 3 on course pages: student reviews (11.1). Nothing renders while community features are off. */
export async function CourseCommunity({ supabase, programId, userId }: { supabase: Supabase; programId: string; userId: string | null }) {
  if (!COMMUNITY_ENABLED) return null;
  const [{ data: reviews }, { data: admitted }] = await Promise.all([
    supabase
      .from("community_posts")
      .select("id, pseudonym, badge, body, ratings, created_at")
      .eq("program_id", programId)
      .eq("kind", "review")
      .eq("status", "published")
      .order("created_at", { ascending: false }),
    userId ? supabase.rpc("admitted_to", { uid: userId, p_program: programId }) : Promise.resolve({ data: false }),
  ]);
  const list = reviews ?? [];
  const summary = ratingSummary(list.map((r) => r.ratings as Ratings));

  return (
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
  );
}

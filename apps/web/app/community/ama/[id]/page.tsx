import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { answerAmaQuestion } from "@/app/admin/community/actions";
import { AmaQuestionForm } from "@/components/ama-question-form";
import { CommunityPost } from "@/components/community-post";
import { amaPhase, amaWhen } from "@/lib/ama";
import { COMMUNITY_ENABLED } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Ask me anything" };

export default async function Ama({ params }: PageProps<"/community/ama/[id]">) {
  if (!COMMUNITY_ENABLED) notFound();
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: ama }, { data: questions }, { data: admin }] = await Promise.all([
    supabase.from("community_amas").select("*").eq("id", id).maybeSingle(),
    supabase.from("community_posts").select("id, pseudonym, badge, body, staff_answer, created_at").eq("ama_id", id).eq("kind", "ama_question").eq("status", "published").order("created_at"),
    user ? supabase.from("admins").select("user_id").eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!ama) notFound();
  const phase = amaPhase(ama);

  return (
    <div className="mx-auto grid max-w-3xl gap-8 px-6 py-16">
      <header className="grid gap-2">
        <Link href="/community/ama" className="text-sm text-muted underline underline-offset-2">Ask me anything</Link>
        <h1 className="text-4xl font-semibold">{ama.title}</h1>
        <p className="font-semibold">{ama.host_name}{ama.host_role ? <span className="font-normal text-muted">, {ama.host_role}</span> : null}</p>
        <p className="text-muted">{amaWhen(ama)}{phase === "live" ? " · happening now" : phase === "past" ? " · this session has ended" : ""}</p>
        {ama.topic ? <p>{ama.topic}</p> : null}
        {!ama.published ? <p className="text-sm font-semibold text-unverified">Draft: only admins can see this.</p> : null}
        {phase !== "past" ? <a href={`/community/ama/${ama.id}/event.ics`} className="btn btn-secondary btn-sm mt-2 justify-self-start">Add to calendar (.ics)</a> : null}
      </header>

      <section aria-labelledby="questions" className="grid gap-3">
        <h2 id="questions" className="text-2xl font-semibold">Questions</h2>
        {(questions ?? []).length === 0 ? <p className="text-muted">No questions published yet.</p> : null}
        {(questions ?? []).map((q) => (
          <CommunityPost key={q.id} post={q} signedIn={Boolean(user)} answerBy={ama.host_name}>
            {admin && !q.staff_answer ? (
              <form action={answerAmaQuestion.bind(null, q.id)} className="grid gap-2">
                <label className="grid gap-1 text-xs">
                  {ama.host_name}&apos;s answer (admin)
                  <textarea name="answer" required rows={3} maxLength={6000} className="field text-sm" />
                </label>
                <button className="btn btn-secondary btn-sm justify-self-start">Post answer</button>
              </form>
            ) : null}
          </CommunityPost>
        ))}
      </section>

      {phase !== "past" && ama.published ? (
        user ? <AmaQuestionForm amaId={ama.id} /> : <p className="text-sm text-muted"><Link href={`/login?next=/community/ama/${ama.id}`} className="underline underline-offset-2">Sign in</Link> to send a question.</p>
      ) : null}
    </div>
  );
}

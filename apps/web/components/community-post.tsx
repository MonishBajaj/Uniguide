import { reportPost } from "@/app/community/actions";
import { REPORT_REASONS } from "@/lib/community";
import { shortDate } from "@/lib/format";

export interface PublicPost {
  id: string;
  pseudonym: string;
  badge: string | null;
  title?: string | null;
  body: string;
  created_at: string;
  staff_answer?: string | null;
}

/** A published community post: pseudonym, the database's label, the text, and a way to report it. */
export function CommunityPost({ post, signedIn, headingLevel = 3, children }: { post: PublicPost; signedIn: boolean; headingLevel?: 2 | 3 | 4; children?: React.ReactNode }) {
  const Heading = `h${headingLevel}` as const;
  return (
    <article aria-label={post.title ?? `Post by ${post.pseudonym}`} className="grid gap-2 rounded-2xl border border-border bg-surface p-5 text-sm">
      {post.title ? <Heading className="text-lg font-semibold">{post.title}</Heading> : null}
      <p className="text-muted">
        <span className="font-semibold text-foreground">{post.pseudonym}</span>
        {post.badge ? <span> · {post.badge}</span> : null}
        <span> · {shortDate(post.created_at)}</span>
      </p>
      <div className="grid gap-2">{post.body.split(/\n{2,}/).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}</div>
      {post.staff_answer ? (
        <div className="mt-1 grid gap-1 rounded-lg bg-background p-3">
          <p className="font-semibold">Answer</p>
          <p className="whitespace-pre-line">{post.staff_answer}</p>
        </div>
      ) : null}
      {children}
      {signedIn ? (
        <details className="text-muted">
          <summary className="cursor-pointer text-xs underline underline-offset-2">Report this post</summary>
          <form action={reportPost.bind(null, post.id)} className="mt-2 flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-xs">
              Reason
              <select name="reason" className="field py-1 text-sm">
                {Object.entries(REPORT_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs">
              Details (optional)
              <input name="note" maxLength={500} className="field py-1 text-sm" style={{ width: "16rem" }} />
            </label>
            <button className="btn btn-secondary btn-sm">Send report</button>
          </form>
        </details>
      ) : null}
    </article>
  );
}

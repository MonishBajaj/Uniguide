import type { Metadata } from "next";
import Link from "next/link";
import { confirmParentalConsent } from "../../actions";

export const metadata: Metadata = { title: "Confirm your child's account", robots: { index: false } };

/** The parent confirms with a button, so link scanners that open the URL do not grant consent. */
export default async function ParentConsentPage({ params, searchParams }: PageProps<"/consent/parent/[token]">) {
  const { token } = await params;
  const result = (await searchParams).result;

  async function confirm() {
    "use server";
    const { redirect } = await import("next/navigation");
    const ok = await confirmParentalConsent(token);
    redirect(`/consent/parent/${token}?result=${ok ? "ok" : "invalid"}`);
  }

  if (result === "ok") {
    return (
      <div className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-3xl font-semibold">Thank you, the account is confirmed</h1>
        <p className="mt-3 text-muted">Your child can now save their profile and shortlist. You can withdraw consent at any time; the privacy policy explains how.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-3xl font-semibold">Confirm your child&apos;s Uniguide account</h1>
      {result === "invalid" ? (
        <p role="alert" className="mt-4 text-conflicting">This link has expired or was already used. Ask your child to send a new request.</p>
      ) : null}
      <div className="mt-6 grid gap-3 text-muted">
        <p>Uniguide helps students find courses abroad and check entry requirements, costs and deadlines against official sources.</p>
        <p>If you agree, we will store what your child enters: their grades, test scores, budget, target countries and shortlist. We never ask for ethnicity, religion or health information, and we do not sell data or share it with universities.</p>
        <p>If your child uses the optional CV reader, the text they paste is sent to Anthropic to extract profile fields and may be kept by Anthropic for up to 30 days.</p>
        <p>Read the <Link href="/legal/privacy" className="underline underline-offset-2">privacy policy</Link> for details.</p>
      </div>
      <form action={confirm} className="mt-8">
        <button className="btn btn-primary">I am their parent or guardian and I agree</button>
      </form>
    </div>
  );
}

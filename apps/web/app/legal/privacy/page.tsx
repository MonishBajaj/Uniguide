import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy policy" };

export default function Privacy() {
  return (
    <article className="mx-auto grid max-w-3xl gap-4 px-6 py-16 text-muted">
      <h1 className="text-4xl font-semibold text-foreground">Privacy policy</h1>
      <p className="rounded-2xl bg-surface p-4 text-sm">Draft for review by counsel before launch. Not yet in force.</p>
      <h2 className="mt-4 text-xl font-semibold text-foreground">What we collect</h2>
      <p>Your email, birth month and country of residence when you create an account. If you choose to add them: your qualification and grades, test scores, budget, target countries and subjects, and your shortlist. We do not ask for ethnicity, religion or health information.</p>
      <h2 className="mt-4 text-xl font-semibold text-foreground">Children</h2>
      <p>Accounts are not available under 13. Where the law of your country requires it, a parent or guardian confirms by email before we store grades, scores or a shortlist.</p>
      <h2 className="mt-4 text-xl font-semibold text-foreground">AI processing</h2>
      <p>If you use the optional CV reader, the text you paste is sent to Anthropic&apos;s Claude API to suggest profile fields. Anthropic may retain it for up to 30 days. We store only a fingerprint (hash) of the text and the fields you confirm.</p>
      <h2 className="mt-4 text-xl font-semibold text-foreground">Who sees your data</h2>
      <p>Only you. We do not sell data and do not share it with universities or agents. Our hosting and email providers process it on our behalf.</p>
      <h2 className="mt-4 text-xl font-semibold text-foreground">Your choices</h2>
      <p>You can export or delete your data and withdraw any consent at any time by contacting us.</p>
    </article>
  );
}

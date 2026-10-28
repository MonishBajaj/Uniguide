import type { Metadata } from "next";
import { OnboardingChat } from "./chat";

export const metadata: Metadata = { title: "Set up by chatting" };

export default function OnboardingPage() {
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-4xl font-semibold">Set up your profile by chatting</h1>
        <p className="mt-2 max-w-[680px] text-muted">A few short questions. Nothing is saved until you tick a suggestion and confirm it. The form on your profile page does the same job.</p>
      </header>
      <OnboardingChat />
    </div>
  );
}

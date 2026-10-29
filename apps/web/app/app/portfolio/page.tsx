import type { Metadata } from "next";
import { PortfolioList } from "@/components/portfolio-list";
import { getUser } from "@/lib/supabase/server";
import { LinkForm } from "./link-form";
import { UploadForm } from "./upload-form";

export const metadata: Metadata = { title: "Portfolio" };

export default async function PortfolioPage() {
  const { supabase, user } = await getUser();
  return (
    <div className="grid gap-8">
      <header>
        <h1 className="text-4xl font-semibold">Portfolio</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Work for art, design, architecture or any course that asks to see it: images and PDFs up to 10 MB, or links.
          Only you can see it, and a counselor you share with. A share link works for 7 days.
        </p>
      </header>
      <PortfolioList supabase={supabase} userId={user!.id} editable />
      <div className="grid gap-4 md:grid-cols-2">
        <UploadForm userId={user!.id} />
        <LinkForm />
      </div>
    </div>
  );
}

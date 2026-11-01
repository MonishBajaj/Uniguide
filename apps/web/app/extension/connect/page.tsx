import type { Metadata } from "next";
import { AUTH_DISABLED } from "@/lib/env";
import { EXTENSION_ID } from "@/lib/extension";
import { getLocale } from "@/lib/i18n/server";
import { ConnectForm } from "./connect-form";

export const metadata: Metadata = { title: "Connect the extension", robots: { index: false } };

/** Signs the UniGuide Assist extension in with a session of its own (M7, A1.5). */
export default async function ConnectExtensionPage() {
  const { t } = await getLocale();
  const c = t.extensionConnect;
  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-semibold">{c.title}</h1>
      <p className="mt-4 text-muted">{c.intro}</p>
      <p className="mt-3 text-sm text-muted">{c.privacy}</p>
      <div className="mt-8">
        {AUTH_DISABLED ? (
          <p role="status">{c.signInOff}</p>
        ) : !EXTENSION_ID ? (
          <p role="status">{c.notAvailable}</p>
        ) : (
          <ConnectForm extensionId={EXTENSION_ID} words={c} />
        )}
      </div>
    </div>
  );
}

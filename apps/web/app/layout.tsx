import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { LiteProvider } from "@/components/lite";
import { displayAttributes } from "@/lib/display";
import { readDisplay } from "@/lib/display-server";
import { SITE_URL } from "@/lib/env";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Uniguide: verified course requirements and deadlines", template: "%s · Uniguide" },
  description:
    "Find courses abroad at any level and see entry requirements, fees and deadlines with a link to the official source on every fact.",
  openGraph: { type: "website", siteName: "Uniguide" },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { display, lite } = await readDisplay();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      {...displayAttributes(display)}
      {...(lite ? { "data-lite": "on" } : {})}
    >
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-foreground"
        >
          Skip to content
        </a>
        <LiteProvider lite={lite}>
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter lite={lite} />
        </LiteProvider>
      </body>
    </html>
  );
}

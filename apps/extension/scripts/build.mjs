// Builds the extension into dist/ (or the directory given as the first argument).
//
// Settings come from the environment, falling back to apps/web/.env.local for local work:
// - SUPABASE_URL, SUPABASE_KEY (else NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
// - WEB_ORIGIN: where the sign-in page lives (else NEXT_PUBLIC_SITE_URL, else http://localhost:3000)
// - EXT_TEST=1: a test build. It adds the practice portal to the host permissions and content scripts, and
//   lets the panel be opened as a page for a given tab. Store builds never include the practice portal.
// - EXT_STORE=1: leave out the development key, so the Web Store assigns the extension's id.
import { build } from "esbuild";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

/** The practice portal (apps/practice-portal), reached only by test builds. */
export const PRACTICE_ORIGIN = "http://127.0.0.1:4318";

async function webEnv() {
  try {
    const text = await readFile(resolve(root, "../web/.env.local"), "utf8");
    return Object.fromEntries(
      text
        .split("\n")
        .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
        .filter(Boolean)
        .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
    );
  } catch {
    return {};
  }
}

export async function settings(env = process.env) {
  const web = await webEnv();
  const supabaseUrl = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? web.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = env.SUPABASE_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? web.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const webOrigin = new URL(env.WEB_ORIGIN ?? env.NEXT_PUBLIC_SITE_URL ?? web.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").origin;
  if (!supabaseUrl || !supabaseKey) throw new Error("Set SUPABASE_URL and SUPABASE_KEY, or create apps/web/.env.local (docs/SETUP.md).");
  return {
    supabaseOrigin: new URL(supabaseUrl).origin,
    supabaseKey,
    webOrigin,
    test: env.EXT_TEST === "1",
    store: env.EXT_STORE === "1",
  };
}

/** A match pattern for an origin. Chrome's match patterns don't carry a port, so the port is dropped. */
const pattern = (origin) => {
  const u = new URL(origin);
  return `${u.protocol}//${u.hostname}/*`;
};

export async function manifest(s) {
  const portals = s.test ? [PRACTICE_ORIGIN] : []; // cleared real portals are added here, one per gate
  const m = {
    manifest_version: 3,
    name: "UniGuide Application Assist",
    short_name: "UniGuide Assist",
    version: "0.1.0",
    description: "Fill your own applications from your own UniGuide profile, one field at a time. Nothing is ever submitted for you.",
    minimum_chrome_version: "116",
    // Only what is used: the session and run in storage, and the side panel. No tabs, history, cookies or scripting.
    permissions: ["storage", "sidePanel"],
    host_permissions: [...new Set([pattern(s.supabaseOrigin), ...portals.map(pattern)])],
    background: { service_worker: "background.js", type: "module" },
    side_panel: { default_path: "panel.html" },
    action: { default_title: "UniGuide Assist" },
    externally_connectable: { matches: [pattern(s.webOrigin)] },
    content_security_policy: {
      extension_pages: `script-src 'self'; object-src 'self'; connect-src ${s.supabaseOrigin}; base-uri 'none'; form-action 'none'`,
    },
    ...(portals.length ? { content_scripts: [{ matches: portals.map(pattern), js: ["content.js"], run_at: "document_idle", all_frames: false }] } : {}),
  };
  if (!s.store) m.key = (await readFile(join(here, "dev-key.txt"), "utf8")).trim();
  return m;
}

export async function buildExtension(outDir = join(root, "dist"), env = process.env) {
  const s = await settings(env);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await build({
    entryPoints: { background: join(root, "src/background.ts"), panel: join(root, "src/panel/panel.ts") },
    bundle: true,
    format: "esm",
    target: "chrome116",
    outdir: outDir,
    legalComments: "none",
    // Readable for REA step B and the Web Store, but with dead branches removed, so a store build carries no
    // test-only adapter.
    minifySyntax: true,
    define: {
      __SUPABASE_URL__: JSON.stringify(s.supabaseOrigin),
      __SUPABASE_KEY__: JSON.stringify(s.supabaseKey),
      __WEB_ORIGIN__: JSON.stringify(s.webOrigin),
      __TEST_BUILD__: JSON.stringify(s.test),
    },
    logLevel: "warning",
  });
  // The content script is a classic script, not a module.
  await build({
    entryPoints: [join(root, "src/content.ts")],
    bundle: true,
    format: "iife",
    target: "chrome116",
    outfile: join(outDir, "content.js"),
    legalComments: "none",
    minifySyntax: true,
    define: { __SUPABASE_URL__: '""', __SUPABASE_KEY__: '""', __WEB_ORIGIN__: '""', __TEST_BUILD__: JSON.stringify(s.test) },
    logLevel: "warning",
  });
  await copyFile(join(root, "static/panel.html"), join(outDir, "panel.html"));
  await copyFile(join(root, "static/panel.css"), join(outDir, "panel.css"));
  await writeFile(join(outDir, "manifest.json"), JSON.stringify(await manifest(s), null, 2) + "\n");
  return { outDir, settings: s };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = process.argv[2] ? resolve(process.argv[2]) : undefined;
  const { outDir, settings: s } = await buildExtension(out);
  console.log(`built ${s.test ? "test" : s.store ? "store" : "dev"} extension in ${outDir} (Supabase ${s.supabaseOrigin}, sign-in at ${s.webOrigin})`);
}

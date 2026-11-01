// Our own build checks (plan A1.5), besides REA step B:
// 1. Network: the built extension can reach only our Supabase project. Every address in it is either that
//    project, our web app's sign-in page (opened as a tab, never fetched) or a supported portal's origin (where
//    the content script runs). Only the background worker may call fetch, and nothing may open sockets,
//    beacons or event streams. The manifest's connect-src and host permissions say the same.
// 2. Actions: no source file outside the guard can click, submit, navigate or press keys.
//
// Usage: node scripts/check.mjs [dist]   (exits 1 and lists every problem)
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PRACTICE_ORIGIN, settings } from "./build.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

async function files(dir, test) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await files(p, test)));
    else if (test(p)) out.push(p);
  }
  return out;
}

const URL_RE = /\b(?:https?|wss?):\/\/[a-zA-Z0-9.-]+(?::\d+)?/g;
const FORBIDDEN_NET = [
  [/\bnew\s+WebSocket\s*\(/, "opens a WebSocket"],
  [/\bXMLHttpRequest\b/, "uses XMLHttpRequest"],
  [/\bsendBeacon\s*\(/, "sends a beacon"],
  [/\bnew\s+EventSource\s*\(/, "opens an event stream"],
  [/\bimportScripts\s*\(/, "imports remote scripts"],
  [/<script[^>]+src=["']https?:/i, "loads a remote script"],
];

/** Problems with the built extension's network reach. */
export async function checkNetwork(dist, { supabaseOrigin, webOrigin, portalOrigins }) {
  const problems = [];
  const allowed = new Set([supabaseOrigin, webOrigin, ...portalOrigins]);
  for (const f of await files(dist, (p) => /\.(js|html|css)$/.test(p))) {
    const name = relative(dist, f);
    const text = await readFile(f, "utf8");
    for (const m of text.matchAll(URL_RE)) {
      const origin = new URL(m[0]).origin;
      if (!allowed.has(origin)) problems.push(`${name}: address ${origin} isn't our Supabase project`);
    }
    for (const [re, what] of FORBIDDEN_NET) if (re.test(text)) problems.push(`${name}: ${what}`);
    if (name !== "background.js" && /\bfetch\s*\(/.test(text)) problems.push(`${name}: calls fetch; only the background worker may`);
  }
  const manifest = JSON.parse(await readFile(join(dist, "manifest.json"), "utf8"));
  const connect = /connect-src ([^;]+)/.exec(manifest.content_security_policy?.extension_pages ?? "")?.[1]?.trim().split(/\s+/) ?? [];
  if (connect.length !== 1 || connect[0] !== supabaseOrigin) problems.push(`manifest: connect-src is "${connect.join(" ")}", not only ${supabaseOrigin}`);
  const hostOk = new Set([supabaseOrigin, ...portalOrigins].map((o) => `${new URL(o).protocol}//${new URL(o).hostname}/*`));
  for (const h of manifest.host_permissions ?? []) if (!hostOk.has(h)) problems.push(`manifest: host permission ${h} isn't our project or a supported portal`);
  for (const p of manifest.permissions ?? []) if (!["storage", "sidePanel"].includes(p)) problems.push(`manifest: permission ${p} isn't needed`);
  return problems;
}

const FORBIDDEN_ACTIONS = [
  [/\.click\s*\(/, "clicks"],
  [/\.submit\s*\(/, "submits a form"],
  [/\.requestSubmit\s*\(/, "submits a form"],
  [/new\s+(?:Mouse|Pointer|Keyboard|Submit|Touch)Event\s*\(/, "makes a click, key or submit event"],
  [/new\s+\w*Event\s*\(\s*["'`](?:click|dblclick|submit|keydown|keypress|keyup|mousedown|mouseup|pointerdown|pointerup)["'`]/, "makes a click, key or submit event"],
  [/dispatchEvent\s*\([^)]*\b(?:click|submit|key\w*)\b/i, "dispatches a click, key or submit event"],
  [/\blocation(?:\.href)?\s*=(?!=)/, "navigates the page"],
  [/\blocation\.(?:assign|replace|reload)\s*\(/, "navigates the page"],
  [/\bwindow\.open\s*\(/, "opens a window"],
  [/\bhistory\.(?:pushState|replaceState|back|forward|go)\s*\(/, "navigates the page"],
  [/["'`]Enter["'`]/, "uses the Enter key"],
  [/chrome\.tabs\.update\s*\(/, "navigates a tab"],
  [/chrome\.scripting\./, "injects scripts"],
];

/** Problems in source files: anything outside the guard that could click, submit, navigate or press keys. */
export async function checkActions(sourceDirs) {
  const problems = [];
  for (const dir of sourceDirs) {
    for (const f of await files(dir, (p) => /\.(ts|tsx|js|mjs)$/.test(p) && !/\.test\./.test(p))) {
      if (/[\\/]guard\.ts$/.test(f)) continue;
      const lines = (await readFile(f, "utf8")).split("\n");
      lines.forEach((line, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // comments describe; they don't act
        for (const [re, what] of FORBIDDEN_ACTIONS) if (re.test(line)) problems.push(`${relative(resolve(root, "../.."), f)}:${i + 1}: ${what}`);
      });
    }
  }
  return problems;
}

export const SOURCE_DIRS = [join(root, "src"), resolve(root, "../../packages/portal-adapters/src")];

export async function checkAll(dist = join(root, "dist")) {
  const s = await settings();
  const manifest = JSON.parse(await readFile(join(dist, "manifest.json"), "utf8"));
  const test = (manifest.content_scripts ?? []).some((c) => c.matches.includes(`${new URL(PRACTICE_ORIGIN).protocol}//${new URL(PRACTICE_ORIGIN).hostname}/*`));
  const portalOrigins = test ? [PRACTICE_ORIGIN] : [];
  return [...(await checkNetwork(dist, { supabaseOrigin: s.supabaseOrigin, webOrigin: s.webOrigin, portalOrigins })), ...(await checkActions(SOURCE_DIRS))];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = await checkAll(process.argv[2] ? resolve(process.argv[2]) : undefined);
  if (problems.length) {
    console.error(`Build checks failed:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  console.log("Build checks passed: Supabase only, no clicks, submits, navigation or keys outside the guard.");
}

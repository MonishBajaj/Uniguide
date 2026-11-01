// The build checks must pass on the real extension and fail on planted problems.
import { appendFile, cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error plain JavaScript build scripts
import { buildExtension, PRACTICE_ORIGIN } from "../scripts/build.mjs";
// @ts-expect-error plain JavaScript build scripts
import { checkActions, checkNetwork, SOURCE_DIRS } from "../scripts/check.mjs";

const ENV = {
  SUPABASE_URL: "https://project.supabase.example",
  SUPABASE_KEY: "publishable-key",
  WEB_ORIGIN: "https://uniguide.example",
  EXT_TEST: "1",
};
const ORIGINS = { supabaseOrigin: ENV.SUPABASE_URL, webOrigin: ENV.WEB_ORIGIN, portalOrigins: [PRACTICE_ORIGIN] };

let work: string;
let dist: string;
beforeAll(async () => {
  work = await mkdtemp(join(tmpdir(), "ext-check-"));
  dist = join(work, "dist");
  await buildExtension(dist, ENV);
});
afterAll(() => rm(work, { recursive: true, force: true }));

async function copyDist(): Promise<string> {
  const d = await mkdtemp(join(work, "planted-"));
  await cp(dist, d, { recursive: true });
  return d;
}

describe("network allowlist over the built bundle", () => {
  it("passes on the real build", async () => {
    expect(await checkNetwork(dist, ORIGINS)).toEqual([]);
  });

  it("allows only storage and the side panel, and connects only to Supabase", async () => {
    const manifest = JSON.parse(await readFile(join(dist, "manifest.json"), "utf8"));
    expect(manifest.permissions).toEqual(["storage", "sidePanel"]);
    expect(manifest.content_security_policy.extension_pages).toContain(`connect-src ${ENV.SUPABASE_URL};`);
  });

  it("fails on a planted fetch to another host", async () => {
    const d = await copyDist();
    await appendFile(join(d, "background.js"), `\nfetch("https://collector.example/x");\n`);
    expect(await checkNetwork(d, ORIGINS)).toContain("background.js: address https://collector.example isn't our Supabase project");
  });

  it("fails on a fetch outside the background worker, even to Supabase", async () => {
    const d = await copyDist();
    await appendFile(join(d, "content.js"), `\nfetch("${ENV.SUPABASE_URL}/rest/v1/x");\n`);
    expect(await checkNetwork(d, ORIGINS)).toContain("content.js: calls fetch; only the background worker may");
  });

  it("fails on sockets and beacons", async () => {
    const d = await copyDist();
    await appendFile(join(d, "panel.js"), `\nnavigator.sendBeacon("/x"); new WebSocket("${ENV.SUPABASE_URL.replace("https", "wss")}");\n`);
    const problems = await checkNetwork(d, ORIGINS);
    expect(problems).toContain("panel.js: sends a beacon");
    expect(problems).toContain("panel.js: opens a WebSocket");
  });

  it("fails on a widened manifest", async () => {
    const d = await copyDist();
    const m = JSON.parse(await readFile(join(d, "manifest.json"), "utf8"));
    m.permissions.push("tabs");
    m.host_permissions.push("<all_urls>");
    m.content_security_policy.extension_pages = m.content_security_policy.extension_pages.replace("connect-src ", "connect-src https://collector.example ");
    await writeFile(join(d, "manifest.json"), JSON.stringify(m));
    const problems = await checkNetwork(d, ORIGINS);
    expect(problems).toContain("manifest: permission tabs isn't needed");
    expect(problems).toContain("manifest: host permission <all_urls> isn't our project or a supported portal");
    expect(problems.some((p: string) => p.startsWith("manifest: connect-src"))).toBe(true);
  });

  it("leaves the practice portal out of a store build", async () => {
    const store = join(work, "store");
    await buildExtension(store, { ...ENV, EXT_TEST: "0", EXT_STORE: "1" });
    const m = JSON.parse(await readFile(join(store, "manifest.json"), "utf8"));
    expect(m.content_scripts).toBeUndefined();
    expect(m.key).toBeUndefined();
    expect(JSON.stringify(m)).not.toContain("127.0.0.1");
    expect(await checkNetwork(store, { ...ORIGINS, portalOrigins: [] })).toEqual([]);
  });
});

describe("no clicks, submits, navigation or keys outside the guard", () => {
  it("passes on the real sources", async () => {
    expect(await checkActions(SOURCE_DIRS)).toEqual([]);
  });

  it("fails on a planted .click() outside the guard", async () => {
    const src = join(work, "src-planted");
    await mkdir(src, { recursive: true });
    await writeFile(join(src, "writer.ts"), `export function go(b: HTMLElement) {\n  b.click();\n}\n`);
    expect((await checkActions([src])).some((p: string) => p.endsWith("writer.ts:2: clicks"))).toBe(true);
  });

  it("fails on submits, synthetic clicks and keys, and navigation", async () => {
    const src = join(work, "src-planted-2");
    await mkdir(src, { recursive: true });
    await writeFile(
      join(src, "sneaky.ts"),
      [
        `form.requestSubmit();`,
        `el.dispatchEvent(new MouseEvent("click"));`,
        `el.dispatchEvent(new Event("submit"));`,
        `el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));`,
        `location.href = "/review";`,
        `location.assign("/fee/pay");`,
      ].join("\n"),
    );
    const problems = await checkActions([src]);
    expect(problems.length).toBeGreaterThanOrEqual(6);
  });

  it("lets the guard itself name these things", async () => {
    const src = join(work, "src-guard");
    await mkdir(src, { recursive: true });
    await writeFile(join(src, "guard.ts"), `if (key === "Enter") return no("enter", "Enter can send a form");\n`);
    expect(await checkActions([src])).toEqual([]);
  });
});

// The content script, injected only on supported portal hosts. It reads the page (labels and structure, in the
// browser only) and fills one field when the student asks. It has no network access of its own and can't
// read the UniGuide session.
import { guard, identifyPage, matchPage, type FieldMatch } from "@uniguide/portal-adapters";
import { adapterFor } from "./adapters";
import type { FieldView, PressResult, ScanResult, ToContent } from "./messages";
import { fill } from "./writer";

function scan(): ScanResult | null {
  const adapter = adapterFor(location.href);
  if (!adapter) return null;
  const page = identifyPage(document, adapter);
  const fields: FieldView[] = matchPage(document, adapter).map(({ element, ...view }) => ({ ...view, hasValue: hasValue(element, view) }));
  const marker = adapter.map.errors?.marker;
  return {
    portal: adapter.portal,
    adapterVersion: adapter.version,
    page,
    fields,
    errors: !!marker && !!document.getElementById(marker),
    guided: adapter.guided === true,
  };
}

/** Whether a field already holds something: text, a chosen option, a tick. */
function hasValue(el: Element, f: Omit<FieldMatch, "element">): boolean {
  if (f.control === "radio") return !!document.querySelector(`input[type="radio"][name="${CSS.escape(f.name)}"]:checked`);
  if (f.control === "checkbox") return (el as HTMLInputElement).checked;
  return ((el as HTMLInputElement).value ?? "").trim() !== "";
}

/**
 * Guided apply's next-page control (A2.2): the adapter's Continue for this page, or the dashboard's way in.
 * The guard decides; the reply goes back first, then the guard presses (and checks again) a moment later, so
 * the reply isn't lost to the page unloading.
 */
function press(control: "continue" | "start"): PressResult {
  const adapter = adapterFor(location.href);
  if (!adapter) return { status: "not_found" };
  const where = identifyPage(document, adapter);
  const page = where.pageId ? adapter.map.pages.find((p) => p.id === where.pageId) : undefined;
  const id = control === "start" ? adapter.map.dashboard?.start : page?.controls.continue;
  const el = id ? document.getElementById(id) : null;
  if (!el) return { status: "not_found" };
  const ctx = { doc: document, adapter, run: { active: true, startedByStudent: true } };
  const decision = guard.allowClick(el, ctx);
  if (!decision.allow) return { status: "blocked", why: decision.why };
  setTimeout(() => guard.press(el, ctx), 0);
  return { status: "pressed" };
}

// Only our own extension pages can message a content script.
chrome.runtime.onMessage.addListener((msg: ToContent, sender, respond) => {
  if (sender.id !== chrome.runtime.id || msg?.to !== "content") return;
  if (msg.type === "scan") {
    respond(scan());
    return;
  }
  if (msg.type === "press") {
    respond(press(msg.control));
    return;
  }
  if (msg.type === "fill") {
    const adapter = adapterFor(location.href);
    respond(adapter ? fill(document, adapter, msg) : { status: "not_found" });
  }
});

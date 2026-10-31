// The content script, injected only on supported portal hosts. It reads the page (labels and structure, in the
// browser only) and fills one field when the student asks. It has no network access of its own and can't
// read the UniGuide session.
import { identifyPage, matchPage } from "@uniguide/portal-adapters";
import { adapterFor } from "./adapters";
import type { FieldView, ScanResult, ToContent } from "./messages";
import { fill } from "./writer";

function scan(): ScanResult | null {
  const adapter = adapterFor(location.href);
  if (!adapter) return null;
  const page = identifyPage(document, adapter);
  const fields: FieldView[] = matchPage(document, adapter).map(({ element: _element, ...view }) => view);
  return { portal: adapter.portal, adapterVersion: adapter.version, page, fields };
}

// Only our own extension pages can message a content script.
chrome.runtime.onMessage.addListener((msg: ToContent, sender, respond) => {
  if (sender.id !== chrome.runtime.id || msg?.to !== "content") return;
  if (msg.type === "scan") {
    respond(scan());
    return;
  }
  if (msg.type === "fill") {
    const adapter = adapterFor(location.href);
    respond(adapter ? fill(document, adapter, msg) : { status: "not_found" });
  }
});

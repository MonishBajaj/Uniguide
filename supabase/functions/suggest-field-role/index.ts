// suggest-field-role (M7, A1.6): one unmatched field's visible label in, a suggested role out.
//
// - Accepts only { label, roles }: no student data (logic.ts rejects anything else).
// - The provider key stays here, as the function's ANTHROPIC_API_KEY secret; the extension never has it.
// - Each call counts against the student's limit and needs consent (take_role_suggestion), checked with the
//   student's own token before the model is asked.
// - Nothing is stored: not the label, not the suggestion.
import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { handle, OUTPUT_SCHEMA, pickRole, prompt, type Quota } from "./logic.ts";

/** The project's small, fast model for one-label classification, as for the web app's other short tasks. */
const MODEL = "claude-haiku-5-5";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY

Deno.serve((req) =>
  handle(req, {
    async quota(): Promise<Quota> {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/take_role_suggestion`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          authorization: req.headers.get("authorization") ?? "",
          "content-type": "application/json",
        },
        body: "{}",
      });
      if (res.status === 401) return "signed_out";
      if (!res.ok) throw new Error(`quota check failed (${res.status})`);
      return (await res.json()) as Quota;
    },
    async classify(label, roles) {
      const p = prompt(label, roles);
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: p.system,
        messages: [{ role: "user", content: p.user }],
        output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA(roles) }, effort: "low" },
      });
      if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") return null;
      const block = response.content.find((b) => b.type === "text");
      return block && block.type === "text" ? pickRole(block.text, roles) : null;
    },
  }),
);

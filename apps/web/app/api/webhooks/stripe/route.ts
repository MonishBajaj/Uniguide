import { handleWebhook } from "@/lib/payments";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const token = process.env.PAYMENT_WEBHOOK_TOKEN;
  if (!secret || !token) return new Response("Payments are not configured", { status: 503 });
  const supabase = await createClient();
  const res = await handleWebhook("stripe", await request.text(), request.headers.get("stripe-signature") ?? "", {
    secret,
    prices: { usd: Number(process.env.PASS_PRICE_USD ?? "1900"), inr: Number(process.env.PASS_PRICE_INR ?? "149900") },
    rpc: async (r) =>
      supabase.rpc("record_payment", {
        p_token: token, p_provider: "stripe", p_external_id: r.externalId, p_user_id: r.userId, p_amount: r.amount, p_currency: r.currency,
      }),
  });
  return new Response(res.body, { status: res.status });
}

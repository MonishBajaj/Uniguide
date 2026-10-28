import { createHmac, timingSafeEqual } from "node:crypto";

export type Provider = "stripe" | "razorpay";
export type PaymentRecord = { externalId: string; userId: string; amount: number; currency: string };

const hex = (key: string, data: string) => createHmac("sha256", key).update(data).digest("hex");

function safeEqualHex(a: string, b: string): boolean {
  if (!/^[0-9a-f]+$/i.test(a) || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/** Razorpay signs the raw request body with the webhook secret (HMAC SHA-256, hex). */
export function verifyRazorpaySignature(body: string, signature: string, secret: string): boolean {
  return safeEqualHex(signature, hex(secret, body));
}

/** Stripe's header is `t=<unix>,v1=<hex>`; the signed payload is `<t>.<body>`. Old timestamps are refused. */
export function verifyStripeSignature(body: string, header: string, secret: string, now = Math.floor(Date.now() / 1000), toleranceSeconds = 300): boolean {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!parts.v1 || !Number.isFinite(t) || Math.abs(now - t) > toleranceSeconds) return false;
  return safeEqualHex(parts.v1, hex(secret, `${t}.${body}`));
}

/** The payment in a webhook event, or null when the event is not a completed payment. */
export function toPaymentRecord(provider: Provider, event: unknown): PaymentRecord | null {
  const e = event as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (provider === "stripe") {
    const s = e?.data?.object;
    if (e?.type !== "checkout.session.completed" || s?.payment_status !== "paid") return null;
    const userId = s.client_reference_id ?? s.metadata?.user_id;
    if (!s.id || !userId || typeof s.amount_total !== "number" || !s.currency) return null;
    return { externalId: s.id, userId, amount: s.amount_total / 100, currency: String(s.currency).toUpperCase() };
  }
  const p = e?.payload?.payment?.entity;
  if (e?.event !== "payment.captured" || !p?.id || !p.notes?.user_id || typeof p.amount !== "number") return null;
  return { externalId: p.id, userId: p.notes.user_id, amount: p.amount / 100, currency: String(p.currency).toUpperCase() };
}

/**
 * Verify, then record. The signature check comes first: a bad one never reaches the database. A recording failure
 * answers 500 so the provider retries; record_payment is idempotent, so retries are safe.
 */
export async function handleWebhook(
  provider: Provider,
  rawBody: string,
  signature: string,
  deps: { secret: string; rpc: (record: PaymentRecord) => Promise<{ error: { message: string } | null }> },
): Promise<{ status: number; body: string }> {
  const valid = provider === "stripe" ? verifyStripeSignature(rawBody, signature, deps.secret) : verifyRazorpaySignature(rawBody, signature, deps.secret);
  if (!valid) return { status: 400, body: "Invalid signature" };
  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: "Invalid body" };
  }
  const record = toPaymentRecord(provider, event);
  if (!record) return { status: 200, body: "Ignored" };
  const { error } = await deps.rpc(record);
  return error ? { status: 500, body: "Could not record the payment" } : { status: 200, body: "Recorded" };
}

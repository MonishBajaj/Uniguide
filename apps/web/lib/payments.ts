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

/** Stripe's header is `t=<unix>,v1=<hex>[,v1=<hex>]`; any v1 may match (several are sent while a secret is rolled). */
export function verifyStripeSignature(body: string, header: string, secret: string, now = Math.floor(Date.now() / 1000), toleranceSeconds = 300): boolean {
  const pairs = header.split(",").map((p) => p.split("=") as [string, string]);
  const t = Number(pairs.find(([k]) => k === "t")?.[1]);
  const signatures = pairs.filter(([k]) => k === "v1").map(([, v]) => v);
  if (signatures.length === 0 || !Number.isFinite(t) || Math.abs(now - t) > toleranceSeconds) return false;
  const expected = hex(secret, `${t}.${body}`);
  return signatures.some((sig) => safeEqualHex(sig, expected));
}

export type Prices = { usd: number; inr: number };

/**
 * The payment in a webhook event: a record, null when the event is not a payment, or "invalid" when it is a
 * payment that is not a pass purchase (wrong amount, currency or product, or no user). Razorpay's user id comes
 * from the order we created, never from the browser.
 */
export function toPaymentRecord(provider: Provider, event: unknown, prices: Prices): PaymentRecord | null | "invalid" {
  const e = event as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (provider === "stripe") {
    const s = e?.data?.object;
    const handled = e?.type === "checkout.session.completed" || e?.type === "checkout.session.async_payment_succeeded";
    if (!handled || s?.payment_status !== "paid") return null;
    const userId = s.client_reference_id ?? s.metadata?.user_id;
    const forPass = s.metadata?.product === "season_pass" && s.amount_total === prices.usd && String(s.currency).toLowerCase() === "usd";
    if (!s.id || !userId || !forPass) return "invalid";
    return { externalId: s.id, userId, amount: s.amount_total / 100, currency: "USD" };
  }
  if (e?.event !== "order.paid") return null;
  const order = e.payload?.order?.entity;
  const payment = e.payload?.payment?.entity;
  const forPass = order?.amount_paid === prices.inr && String(order?.currency).toUpperCase() === "INR";
  if (!payment?.id || !order?.notes?.user_id || !forPass) return "invalid";
  return { externalId: payment.id, userId: order.notes.user_id, amount: order.amount_paid / 100, currency: "INR" };
}

/**
 * Verify, then record. The signature check comes first: a bad one never reaches the database. A recording failure
 * answers 500 so the provider retries; record_payment is idempotent, so retries are safe.
 */
export async function handleWebhook(
  provider: Provider,
  rawBody: string,
  signature: string,
  deps: { secret: string; prices: Prices; rpc: (record: PaymentRecord) => Promise<{ error: { message: string } | null }> },
): Promise<{ status: number; body: string }> {
  const valid = provider === "stripe" ? verifyStripeSignature(rawBody, signature, deps.secret) : verifyRazorpaySignature(rawBody, signature, deps.secret);
  if (!valid) return { status: 400, body: "Invalid signature" };
  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: "Invalid body" };
  }
  const record = toPaymentRecord(provider, event, deps.prices);
  if (record === "invalid") {
    // Never a silent 200: a payment we cannot match to the pass needs a person to look at it.
    console.error(`[payments] ${provider} payment event did not match the season pass`);
    return { status: 422, body: "Payment does not match the season pass" };
  }
  if (!record) return { status: 200, body: "Ignored" };
  const { error } = await deps.rpc(record);
  return error ? { status: 500, body: "Could not record the payment" } : { status: 200, body: "Recorded" };
}

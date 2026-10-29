import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { handleWebhook, toPaymentRecord, verifyRazorpaySignature, verifyStripeSignature } from "./payments";

const hmac = (key: string, data: string) => createHmac("sha256", key).update(data).digest("hex");
const prices = { usd: 1900, inr: 149900 };

const stripeEvent = (over: Record<string, unknown> = {}, type = "checkout.session.completed") => ({
  type,
  data: { object: { id: "cs_1", payment_status: "paid", amount_total: 1900, currency: "usd", client_reference_id: "user-1", metadata: { user_id: "user-1", product: "season_pass" }, ...over } },
});
const razorpayEvent = (orderOver: Record<string, unknown> = {}) => ({
  event: "order.paid",
  payload: {
    order: { entity: { id: "order_1", amount_paid: 149900, currency: "INR", notes: { user_id: "user-2" }, ...orderOver } },
    payment: { entity: { id: "pay_1" } },
  },
});

describe("verifyRazorpaySignature", () => {
  const body = JSON.stringify(razorpayEvent());
  it("accepts the right signature", () => expect(verifyRazorpaySignature(body, hmac("s", body), "s")).toBe(true));
  it("rejects a changed body or a wrong secret", () => {
    expect(verifyRazorpaySignature(body + " ", hmac("s", body), "s")).toBe(false);
    expect(verifyRazorpaySignature(body, hmac("s", body), "other")).toBe(false);
    expect(verifyRazorpaySignature(body, "not-hex", "s")).toBe(false);
  });
});

describe("verifyStripeSignature", () => {
  const body = JSON.stringify(stripeEvent());
  const now = 1_800_000_000;
  const header = (t: number, secret = "whsec") => `t=${t},v1=${hmac(secret, `${t}.${body}`)}`;
  it("accepts a fresh, correct signature", () => expect(verifyStripeSignature(body, header(now), "whsec", now)).toBe(true));
  it("rejects a wrong secret, a changed body and a stale timestamp", () => {
    expect(verifyStripeSignature(body, header(now, "x"), "whsec", now)).toBe(false);
    expect(verifyStripeSignature(body + "x", header(now), "whsec", now)).toBe(false);
    expect(verifyStripeSignature(body, header(now - 1000), "whsec", now)).toBe(false);
    expect(verifyStripeSignature(body, "garbage", "whsec", now)).toBe(false);
  });
  it("accepts any of several v1 signatures, as sent while a secret is rolled", () => {
    const good = hmac("whsec", `${now}.${body}`);
    expect(verifyStripeSignature(body, `t=${now},v1=${hmac("old", `${now}.${body}`)},v1=${good}`, "whsec", now)).toBe(true);
    expect(verifyStripeSignature(body, `t=${now},v1=${good},v1=${hmac("old", `${now}.${body}`)}`, "whsec", now)).toBe(true);
  });
});

describe("toPaymentRecord", () => {
  it("maps a paid Stripe checkout session for the pass", () => {
    expect(toPaymentRecord("stripe", stripeEvent(), prices)).toEqual({ externalId: "cs_1", userId: "user-1", amount: 19, currency: "USD" });
  });
  it("also handles a delayed payment that later succeeds", () => {
    expect(toPaymentRecord("stripe", stripeEvent({}, "checkout.session.async_payment_succeeded"), prices)).toMatchObject({ externalId: "cs_1" });
  });
  it("maps a paid Razorpay order using the order's own notes", () => {
    expect(toPaymentRecord("razorpay", razorpayEvent(), prices)).toEqual({ externalId: "pay_1", userId: "user-2", amount: 1499, currency: "INR" });
  });
  it("ignores events that are not payments", () => {
    expect(toPaymentRecord("stripe", { type: "charge.refunded", data: { object: {} } }, prices)).toBeNull();
    expect(toPaymentRecord("stripe", stripeEvent({ payment_status: "unpaid" }), prices)).toBeNull();
    expect(toPaymentRecord("razorpay", { event: "payment.failed", payload: {} }, prices)).toBeNull();
  });
  it("flags a payment event that is not for the pass, instead of granting or ignoring it", () => {
    expect(toPaymentRecord("stripe", stripeEvent({ amount_total: 100 }), prices)).toBe("invalid");
    expect(toPaymentRecord("stripe", stripeEvent({ currency: "eur" }), prices)).toBe("invalid");
    expect(toPaymentRecord("stripe", stripeEvent({ metadata: { user_id: "user-1" } }), prices)).toBe("invalid");
    expect(toPaymentRecord("razorpay", razorpayEvent({ amount_paid: 100 }), prices)).toBe("invalid");
    expect(toPaymentRecord("razorpay", razorpayEvent({ notes: {} }), prices)).toBe("invalid");
  });
});

describe("handleWebhook", () => {
  const body = JSON.stringify(razorpayEvent());
  const deps = (rpc: ReturnType<typeof vi.fn>) => ({ secret: "s", prices, rpc: rpc as never });
  it("rejects a bad signature without calling the database", async () => {
    const rpc = vi.fn();
    const res = await handleWebhook("razorpay", body, "bad", deps(rpc));
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("records a verified payment", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const res = await handleWebhook("razorpay", body, hmac("s", body), deps(rpc));
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith({ externalId: "pay_1", userId: "user-2", amount: 1499, currency: "INR" });
  });
  it("answers 200 and records nothing for events it does not handle", async () => {
    const rpc = vi.fn();
    const other = JSON.stringify({ event: "payment.failed", payload: {} });
    expect((await handleWebhook("razorpay", other, hmac("s", other), deps(rpc))).status).toBe(200);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("answers 422, never 200, for a payment it cannot match to the pass", async () => {
    const rpc = vi.fn();
    const wrong = JSON.stringify(razorpayEvent({ amount_paid: 100 }));
    expect((await handleWebhook("razorpay", wrong, hmac("s", wrong), deps(rpc))).status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("answers 500 when recording fails so the provider retries", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: "db down" } });
    expect((await handleWebhook("razorpay", body, hmac("s", body), deps(rpc))).status).toBe(500);
  });
});

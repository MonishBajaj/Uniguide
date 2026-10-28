import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { handleWebhook, toPaymentRecord, verifyRazorpaySignature, verifyStripeSignature } from "./payments";

const hmac = (key: string, data: string) => createHmac("sha256", key).update(data).digest("hex");

const stripeEvent = {
  type: "checkout.session.completed",
  data: { object: { id: "cs_1", payment_status: "paid", amount_total: 1900, currency: "usd", client_reference_id: "user-1", metadata: { user_id: "user-1" } } },
};
const razorpayEvent = {
  event: "payment.captured",
  payload: { payment: { entity: { id: "pay_1", amount: 149900, currency: "INR", notes: { user_id: "user-2" } } } },
};

describe("verifyRazorpaySignature", () => {
  const body = JSON.stringify(razorpayEvent);
  it("accepts the right signature", () => expect(verifyRazorpaySignature(body, hmac("s", body), "s")).toBe(true));
  it("rejects a changed body or a wrong secret", () => {
    expect(verifyRazorpaySignature(body + " ", hmac("s", body), "s")).toBe(false);
    expect(verifyRazorpaySignature(body, hmac("s", body), "other")).toBe(false);
    expect(verifyRazorpaySignature(body, "not-hex", "s")).toBe(false);
  });
});

describe("verifyStripeSignature", () => {
  const body = JSON.stringify(stripeEvent);
  const now = 1_800_000_000;
  const header = (t: number, secret = "whsec") => `t=${t},v1=${hmac(secret, `${t}.${body}`)}`;
  it("accepts a fresh, correct signature", () => expect(verifyStripeSignature(body, header(now), "whsec", now)).toBe(true));
  it("rejects a wrong secret, a changed body and a stale timestamp", () => {
    expect(verifyStripeSignature(body, header(now, "x"), "whsec", now)).toBe(false);
    expect(verifyStripeSignature(body + "x", header(now), "whsec", now)).toBe(false);
    expect(verifyStripeSignature(body, header(now - 1000), "whsec", now)).toBe(false);
    expect(verifyStripeSignature(body, "garbage", "whsec", now)).toBe(false);
  });
});

describe("toPaymentRecord", () => {
  it("maps a paid Stripe checkout session", () => {
    expect(toPaymentRecord("stripe", stripeEvent)).toEqual({ externalId: "cs_1", userId: "user-1", amount: 19, currency: "USD" });
  });
  it("maps a captured Razorpay payment", () => {
    expect(toPaymentRecord("razorpay", razorpayEvent)).toEqual({ externalId: "pay_1", userId: "user-2", amount: 1499, currency: "INR" });
  });
  it("returns null for other events and unpaid sessions", () => {
    expect(toPaymentRecord("stripe", { type: "charge.refunded", data: { object: {} } })).toBeNull();
    expect(toPaymentRecord("stripe", { ...stripeEvent, data: { object: { ...stripeEvent.data.object, payment_status: "unpaid" } } })).toBeNull();
    expect(toPaymentRecord("razorpay", { event: "payment.failed", payload: {} })).toBeNull();
  });
});

describe("handleWebhook", () => {
  const body = JSON.stringify(razorpayEvent);
  it("rejects a bad signature without calling the database", async () => {
    const rpc = vi.fn();
    const res = await handleWebhook("razorpay", body, "bad", { secret: "s", rpc });
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("records a verified payment once per call", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const res = await handleWebhook("razorpay", body, hmac("s", body), { secret: "s", rpc });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith({ externalId: "pay_1", userId: "user-2", amount: 1499, currency: "INR" });
  });
  it("answers 200 and records nothing for events it does not handle", async () => {
    const rpc = vi.fn();
    const other = JSON.stringify({ event: "payment.failed", payload: {} });
    expect((await handleWebhook("razorpay", other, hmac("s", other), { secret: "s", rpc })).status).toBe(200);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("answers 500 when recording fails so the provider retries", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: "db down" } });
    expect((await handleWebhook("razorpay", body, hmac("s", body), { secret: "s", rpc })).status).toBe(500);
  });
});

import { NextResponse } from "next/server";
import { SITE_URL } from "@/lib/env";
import { getUser } from "@/lib/supabase/server";

const PRODUCT = "Uniguide season pass";

/** Starts a season pass purchase for the signed-in user. Card details never reach this server. */
export async function POST(request: Request) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("consent_state").eq("user_id", user.id).maybeSingle();
  if (!profile || !["not_required", "granted"].includes(profile.consent_state)) {
    return NextResponse.json({ error: "A parent or guardian needs to confirm your account before you can buy a pass." }, { status: 403 });
  }
  const { data: entitlement } = await supabase.rpc("my_entitlement");
  if (entitlement === "season_pass") return NextResponse.json({ error: "You already have an active season pass." }, { status: 409 });
  const { currency } = (await request.json().catch(() => ({}))) as { currency?: string };
  if (currency !== "usd" && currency !== "inr") return NextResponse.json({ error: "Choose usd or inr." }, { status: 400 });

  if (currency === "usd") {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return NextResponse.json({ error: "Payments are not configured." }, { status: 503 });
    const body = new URLSearchParams({
      mode: "payment",
      success_url: `${SITE_URL}/app/writing?paid=1`,
      cancel_url: `${SITE_URL}/app/writing`,
      client_reference_id: user.id,
      "metadata[user_id]": user.id,
      "metadata[product]": "season_pass",
      "payment_method_types[0]": "card",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": process.env.PASS_PRICE_USD ?? "1900",
      "line_items[0][price_data][product_data][name]": PRODUCT,
    });
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const session = (await res.json()) as { url?: string };
    if (!res.ok || !session.url) return NextResponse.json({ error: "Could not start the payment." }, { status: 502 });
    return NextResponse.json({ provider: "stripe", url: session.url });
  }

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return NextResponse.json({ error: "Payments are not configured." }, { status: 503 });
  const amount = Number(process.env.PASS_PRICE_INR ?? "149900");
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ amount, currency: "INR", receipt: `pass-${user.id.slice(0, 8)}-${Date.now()}`, notes: { user_id: user.id } }),
  });
  const order = (await res.json()) as { id?: string };
  if (!res.ok || !order.id) return NextResponse.json({ error: "Could not start the payment." }, { status: 502 });
  return NextResponse.json({ provider: "razorpay", orderId: order.id, keyId, amount, currency: "INR" });
}

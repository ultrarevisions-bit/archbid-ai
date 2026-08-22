import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !webhookSecret) {
    return NextResponse.json({ error: "Stripe webhook is not configured." }, { status: 503 });
  }

  const stripe = new Stripe(secretKey);
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });

  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    console.error("ARCHBID STRIPE WEBHOOK SIGNATURE ERROR:", error);
    return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  if (session.payment_status !== "paid") return NextResponse.json({ received: true });

  const metadata = session.metadata || {};
  const userId = metadata.user_id;
  const rfpId = metadata.rfp_id;
  const analysisId = metadata.analysis_id;
  if (!userId || !rfpId || !analysisId) {
    console.error("ARCHBID STRIPE WEBHOOK: missing checkout metadata", metadata);
    return NextResponse.json({ error: "Missing purchase metadata." }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("proposal_purchases").upsert({
      user_id: userId,
      rfp_id: rfpId,
      analysis_id: analysisId,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
      amount_cents: session.amount_total ?? 4900,
      currency: session.currency ?? "usd",
      status: "paid"
    }, { onConflict: "analysis_id" });

    if (error) throw error;
  } catch (error) {
    console.error("ARCHBID STRIPE WEBHOOK FULFILLMENT ERROR:", error);
    return NextResponse.json({ error: "Purchase could not be recorded." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

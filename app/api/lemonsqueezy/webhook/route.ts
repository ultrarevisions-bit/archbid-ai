import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function signaturesMatch(payload: string, signature: string, secret: string) {
  const digest = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const expected = Buffer.from(digest, "utf8");
  const received = Buffer.from(signature, "utf8");
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "archbid-lemonsqueezy-webhook",
    configured: Boolean(process.env.LEMONSQUEEZY_WEBHOOK_SECRET && process.env.LEMONSQUEEZY_STORE_ID)
  });
}

export async function POST(request: Request) {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  const storeId = process.env.LEMONSQUEEZY_STORE_ID;

  if (!secret || !storeId) {
    console.error("ARCHBID LEMON SQUEEZY WEBHOOK: missing LEMONSQUEEZY_WEBHOOK_SECRET or LEMONSQUEEZY_STORE_ID");
    return NextResponse.json({ error: "Lemon Squeezy webhook is not configured." }, { status: 503 });
  }

  const payload = await request.text();
  const signature = request.headers.get("x-signature") || "";
  if (!signature || !signaturesMatch(payload, signature, secret)) {
    console.error("ARCHBID LEMON SQUEEZY WEBHOOK: invalid signature");
    return NextResponse.json({ error: "Invalid Lemon Squeezy signature." }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const eventName = request.headers.get("x-event-name") || event?.meta?.event_name || "";
  if (eventName !== "order_created" && eventName !== "order_refunded") {
    return NextResponse.json({ received: true });
  }

  const attributes = event?.data?.attributes || {};
  if (String(attributes.store_id) !== String(storeId)) {
    console.error("ARCHBID LEMON SQUEEZY WEBHOOK: store mismatch", {
      expected: storeId,
      received: attributes.store_id
    });
    return NextResponse.json({ error: "Webhook store mismatch." }, { status: 400 });
  }

  if (eventName === "order_created" && attributes.status !== "paid") {
    console.error("ARCHBID LEMON SQUEEZY WEBHOOK: order_created was not paid", {
      orderId: event?.data?.id,
      status: attributes.status
    });
    return NextResponse.json({ error: "Order is not paid." }, { status: 400 });
  }

  const custom = event?.meta?.custom_data || {};
  const userId = custom.user_id;
  const rfpId = custom.rfp_id;
  const analysisId = custom.analysis_id;
  const orderId = event?.data?.id;
  const variantId = attributes?.first_order_item?.variant_id;

  if (!userId || !rfpId || !analysisId || !orderId) {
    console.error("ARCHBID LEMON SQUEEZY WEBHOOK: missing custom purchase data", {
      eventName,
      custom,
      orderId,
      variantId
    });
    return NextResponse.json({ error: "Missing purchase metadata." }, { status: 400 });
  }

  try {
    const admin = createAdminClient();

    const { data: rfp, error: rfpError } = await admin
      .from("rfps")
      .select("id, user_id")
      .eq("id", rfpId)
      .eq("user_id", userId)
      .maybeSingle();
    if (rfpError) throw rfpError;
    if (!rfp) return NextResponse.json({ error: "RFP ownership could not be verified." }, { status: 403 });

    const { data: analysis, error: analysisError } = await admin
      .from("rfp_analyses")
      .select("id, rfp_id")
      .eq("id", analysisId)
      .eq("rfp_id", rfpId)
      .maybeSingle();
    if (analysisError) throw analysisError;
    if (!analysis) return NextResponse.json({ error: "Analysis could not be verified." }, { status: 403 });

    const { error } = await admin.from("proposal_purchases").upsert({
      user_id: userId,
      rfp_id: rfpId,
      analysis_id: analysisId,
      lemon_squeezy_order_id: String(orderId),
      lemon_squeezy_checkout_session_id: custom.checkout_id ? String(custom.checkout_id) : null,
      amount_cents: Number(attributes.total ?? attributes.subtotal ?? 1900),
      currency: String(attributes.currency || "USD").toLowerCase(),
      status: eventName === "order_created" ? "paid" : "refunded"
    }, { onConflict: "analysis_id" });

    if (error) throw error;

    console.log("ARCHBID LEMON SQUEEZY WEBHOOK: purchase recorded", {
      eventName,
      orderId,
      userId,
      rfpId,
      analysisId,
      variantId,
      testMode: attributes.test_mode
    });
  } catch (error) {
    console.error("ARCHBID LEMON SQUEEZY WEBHOOK FULFILLMENT ERROR:", error);
    return NextResponse.json({ error: "Purchase could not be recorded." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

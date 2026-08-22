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

export async function POST(request: Request) {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  if (!secret || !storeId) {
    return NextResponse.json({ error: "Lemon Squeezy webhook is not configured." }, { status: 503 });
  }

  const payload = await request.text();
  const signature = request.headers.get("x-signature") || "";
  if (!signature || !signaturesMatch(payload, signature, secret)) {
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
    return NextResponse.json({ error: "Webhook store mismatch." }, { status: 400 });
  }

  const custom = event?.meta?.custom_data || {};
  const userId = custom.user_id;
  const rfpId = custom.rfp_id;
  const analysisId = custom.analysis_id;
  const orderId = event?.data?.id;

  if (!userId || !rfpId || !analysisId || !orderId) {
    console.error("ARCHBID LEMON SQUEEZY WEBHOOK: missing custom purchase data", { eventName, custom, orderId });
    return NextResponse.json({ error: "Missing purchase metadata." }, { status: 400 });
  }

  try {
    const admin = createAdminClient();

    const { data: rfp } = await admin
      .from("rfps")
      .select("id, user_id")
      .eq("id", rfpId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!rfp) return NextResponse.json({ error: "RFP ownership could not be verified." }, { status: 403 });

    const { data: analysis } = await admin
      .from("rfp_analyses")
      .select("id, rfp_id")
      .eq("id", analysisId)
      .eq("rfp_id", rfpId)
      .maybeSingle();

    if (!analysis) return NextResponse.json({ error: "Analysis could not be verified." }, { status: 403 });

    const paid = eventName === "order_created";
    const { error } = await admin.from("proposal_purchases").upsert({
      user_id: userId,
      rfp_id: rfpId,
      analysis_id: analysisId,
      lemon_squeezy_order_id: String(orderId),
      lemon_squeezy_checkout_session_id: custom.checkout_id ? String(custom.checkout_id) : null,
      amount_cents: Number(attributes.total ?? attributes.subtotal ?? 1900),
      currency: String(attributes.currency || "USD").toLowerCase(),
      status: paid ? "paid" : "refunded"
    }, { onConflict: "analysis_id" });

    if (error) throw error;
  } catch (error) {
    console.error("ARCHBID LEMON SQUEEZY WEBHOOK FULFILLMENT ERROR:", error);
    return NextResponse.json({ error: "Purchase could not be recorded." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

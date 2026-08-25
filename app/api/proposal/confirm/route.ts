import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const ARCHBID_LEMON_STORE_ID = 247698;
const ARCHBID_LIVE_PROPOSAL_VARIANT_ID = 2047735;
const ARCHBID_TEST_PROPOSAL_VARIANT_ID = 2052480;

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const analysisId = body?.analysisId;
  if (!analysisId || typeof analysisId !== "string") {
    return NextResponse.json({ error: "Missing analysis ID." }, { status: 400 });
  }

  const { data: existingPaid, error: paidLookupError } = await supabase
    .from("proposal_purchases")
    .select("id")
    .eq("analysis_id", analysisId)
    .eq("user_id", user.id)
    .eq("status", "paid")
    .maybeSingle();

  if (paidLookupError) {
    console.error("ARCHBID PROPOSAL PURCHASE LOOKUP ERROR:", paidLookupError);
    return NextResponse.json({ error: "We could not check the payment status yet." }, { status: 500 });
  }

  if (existingPaid) return NextResponse.json({ paid: true, source: "database" });

  const admin = createAdminClient();
  const { data: pendingPurchase, error: pendingError } = await admin
    .from("proposal_purchases")
    .select("id, status, created_at, lemon_squeezy_checkout_session_id")
    .eq("analysis_id", analysisId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (pendingError) {
    console.error("ARCHBID PROPOSAL PENDING PURCHASE LOOKUP ERROR:", pendingError);
    return NextResponse.json({ paid: false });
  }

  const apiKey = process.env.LEMONSQUEEZY_API_KEY;
  if (!apiKey || !user.email) return NextResponse.json({ paid: false });

  const testMode = String(process.env.LEMONSQUEEZY_TEST_MODE || "").toLowerCase() === "true";
  const storeId = Number(process.env.LEMONSQUEEZY_STORE_ID || ARCHBID_LEMON_STORE_ID);
  const variantId = Number(
    process.env.LEMONSQUEEZY_PROPOSAL_VARIANT_ID ||
    (testMode ? ARCHBID_TEST_PROPOSAL_VARIANT_ID : ARCHBID_LIVE_PROPOSAL_VARIANT_ID)
  );

  if (!Number.isInteger(storeId) || !Number.isInteger(variantId)) {
    return NextResponse.json({ paid: false });
  }

  try {
    // Webhooks are the primary source of truth. This API verification is a
    // recovery path for the short window immediately after checkout, when a
    // webhook may still be delayed. Lemon Squeezy exposes order filtering by
    // email/store and includes the purchased variant on the order object.
    const params = new URLSearchParams();
    params.set("filter[user_email]", user.email);
    params.set("filter[store_id]", String(storeId));
    params.set("page[size]", "50");
    params.set("sort", "-createdAt");

    const response = await fetch(`https://api.lemonsqueezy.com/v1/orders?${params.toString()}`, {
      headers: {
        Accept: "application/vnd.api+json",
        Authorization: `Bearer ${apiKey}`
      },
      cache: "no-store"
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("ARCHBID LEMON SQUEEZY ORDER VERIFICATION ERROR:", response.status, result);
      return NextResponse.json({ paid: false });
    }

    const pendingCreatedAt = pendingPurchase?.created_at ? Date.parse(pendingPurchase.created_at) : NaN;
    const minimumCreatedAt = Number.isFinite(pendingCreatedAt) ? pendingCreatedAt - 2 * 60 * 1000 : Date.now() - 30 * 60 * 1000;

    const matchingOrder = (result?.data || []).find((item: any) => {
      const attributes = item?.attributes || {};
      const orderVariantId = Number(attributes?.first_order_item?.variant_id);
      const createdAt = Date.parse(attributes?.created_at || "");
      return (
        String(attributes?.store_id) === String(storeId) &&
        String(attributes?.user_email || "").toLowerCase() === String(user.email).toLowerCase() &&
        attributes?.status === "paid" &&
        attributes?.test_mode === testMode &&
        orderVariantId === variantId &&
        Number(attributes?.total) >= 1900 &&
        (!Number.isFinite(createdAt) || createdAt >= minimumCreatedAt)
      );
    });

    if (!matchingOrder) return NextResponse.json({ paid: false });

    const attributes = matchingOrder.attributes || {};
    const orderId = matchingOrder.id;

    const { error: updateError } = await admin
      .from("proposal_purchases")
      .upsert({
        user_id: user.id,
        rfp_id: pendingPurchase ? undefined : undefined,
        analysis_id: analysisId,
        lemon_squeezy_checkout_session_id: pendingPurchase?.lemon_squeezy_checkout_session_id || null,
        lemon_squeezy_order_id: String(orderId),
        amount_cents: Number(attributes.total || 1900),
        currency: String(attributes.currency || "USD").toLowerCase(),
        status: "paid"
      }, { onConflict: "analysis_id" });

    if (updateError) {
      // If an existing purchase row was present, upsert above may fail because
      // rfp_id is required. Fetch it and retry with the complete ownership data.
      const { data: completePurchase } = await admin
        .from("rfp_analyses")
        .select("id, rfp_id")
        .eq("id", analysisId)
        .maybeSingle();

      if (!completePurchase) throw updateError;

      const { error: retryError } = await admin
        .from("proposal_purchases")
        .upsert({
          user_id: user.id,
          rfp_id: completePurchase.rfp_id,
          analysis_id: analysisId,
          lemon_squeezy_checkout_session_id: pendingPurchase?.lemon_squeezy_checkout_session_id || null,
          lemon_squeezy_order_id: String(orderId),
          amount_cents: Number(attributes.total || 1900),
          currency: String(attributes.currency || "USD").toLowerCase(),
          status: "paid"
        }, { onConflict: "analysis_id" });

      if (retryError) throw retryError;
    }

    console.log("ARCHBID LEMON SQUEEZY: payment confirmed by API fallback", {
      analysisId,
      orderId,
      testMode
    });

    return NextResponse.json({ paid: true, source: "lemonsqueezy_api" });
  } catch (error) {
    console.error("ARCHBID LEMON SQUEEZY ORDER VERIFICATION EXCEPTION:", error);
    return NextResponse.json({ paid: false });
  }
}

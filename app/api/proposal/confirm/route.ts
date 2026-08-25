import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const ARCHBID_LEMON_STORE_ID = 247698;
const ARCHBID_LIVE_PROPOSAL_VARIANT_ID = 2047735;
const ARCHBID_TEST_PROPOSAL_VARIANT_ID = 2052480;

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function toCents(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  // Lemon Squeezy documents order totals in the currency's smallest unit.
  // Keep this tolerant of a decimal amount in case an API response is formatted differently.
  return number < 100 ? Math.round(number * 100) : Math.round(number);
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const analysisId = body?.analysisId;
  if (!analysisId || typeof analysisId !== "string") {
    return NextResponse.json({ error: "Missing analysis ID." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify that this RFP analysis actually belongs to the signed-in user.
  const { data: analysis, error: analysisError } = await admin
    .from("rfp_analyses")
    .select("id, rfp_id")
    .eq("id", analysisId)
    .maybeSingle();

  if (analysisError || !analysis) return NextResponse.json({ paid: false });

  const { data: ownedRfp, error: ownershipError } = await admin
    .from("rfps")
    .select("id")
    .eq("id", analysis.rfp_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (ownershipError || !ownedRfp) return NextResponse.json({ paid: false });

  const { data: existingPaid, error: paidLookupError } = await admin
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
    const headers = {
      Accept: "application/vnd.api+json",
      Authorization: `Bearer ${apiKey}`
    };

    // Do not rely on Lemon Squeezy's email filter here. We fetch recent orders
    // for the store and match the email locally. This makes the confirmation
    // path resilient to URL/filter encoding differences while still requiring
    // the authenticated ArchBid user's email, paid status and exact variant.
    const params = new URLSearchParams();
    params.set("filter[store_id]", String(storeId));
    params.set("page[size]", "100");
    params.set("sort", "-createdAt");

    const response = await fetch(`https://api.lemonsqueezy.com/v1/orders?${params.toString()}`, {
      headers,
      cache: "no-store"
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("ARCHBID LEMON SQUEEZY ORDER VERIFICATION ERROR:", response.status, result);
      return NextResponse.json({ paid: false, reason: "lemonsqueezy_api_error" });
    }

    const pendingCreatedAt = pendingPurchase?.created_at ? Date.parse(pendingPurchase.created_at) : NaN;
    // Allow a generous window because the user may complete checkout several
    // minutes after the checkout record is created.
    const minimumCreatedAt = Number.isFinite(pendingCreatedAt)
      ? pendingCreatedAt - 10 * 60 * 1000
      : Date.now() - 60 * 60 * 1000;

    const expectedEmail = normalizeEmail(user.email);
    const orders = Array.isArray(result?.data) ? result.data : [];

    const matchingOrder = orders.find((item: any) => {
      const attributes = item?.attributes || {};
      const orderVariantId = Number(attributes?.first_order_item?.variant_id);
      const createdAt = Date.parse(attributes?.created_at || "");
      const orderEmail = normalizeEmail(attributes?.user_email);
      const amountCents = toCents(attributes?.total);

      return (
        String(attributes?.store_id) === String(storeId) &&
        orderEmail === expectedEmail &&
        attributes?.status === "paid" &&
        attributes?.test_mode === testMode &&
        orderVariantId === variantId &&
        amountCents >= 1900 &&
        (!Number.isFinite(createdAt) || createdAt >= minimumCreatedAt)
      );
    });

    if (!matchingOrder) {
      const recent = orders.slice(0, 5).map((item: any) => ({
        id: item?.id,
        email: normalizeEmail(item?.attributes?.user_email),
        status: item?.attributes?.status,
        variantId: item?.attributes?.first_order_item?.variant_id,
        testMode: item?.attributes?.test_mode,
        createdAt: item?.attributes?.created_at
      }));
      console.warn("ARCHBID LEMON SQUEEZY: no matching paid order found", {
        analysisId,
        expectedEmail,
        storeId,
        variantId,
        testMode,
        pendingCheckoutId: pendingPurchase?.lemon_squeezy_checkout_session_id,
        recent
      });
      return NextResponse.json({ paid: false, reason: "no_matching_order" });
    }

    const attributes = matchingOrder.attributes || {};
    const orderId = matchingOrder.id;

    const { error: updateError } = await admin
      .from("proposal_purchases")
      .upsert({
        user_id: user.id,
        rfp_id: analysis.rfp_id,
        analysis_id: analysisId,
        lemon_squeezy_checkout_session_id: pendingPurchase?.lemon_squeezy_checkout_session_id || null,
        lemon_squeezy_order_id: String(orderId),
        amount_cents: toCents(attributes.total || 1900),
        currency: String(attributes.currency || "USD").toLowerCase(),
        status: "paid"
      }, { onConflict: "analysis_id" });

    if (updateError) throw updateError;

    console.log("ARCHBID LEMON SQUEEZY: payment confirmed by API fallback", {
      analysisId,
      orderId,
      testMode
    });

    return NextResponse.json({ paid: true, source: "lemonsqueezy_api" });
  } catch (error) {
    console.error("ARCHBID LEMON SQUEEZY ORDER VERIFICATION EXCEPTION:", error);
    return NextResponse.json({ paid: false, reason: "verification_exception" });
  }
}

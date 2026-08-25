import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Lemon Squeezy resource IDs are public identifiers, not secrets.
const ARCHBID_LEMON_STORE_ID = 247698;
const ARCHBID_LIVE_PROPOSAL_VARIANT_ID = 2047735;
const ARCHBID_TEST_PROPOSAL_VARIANT_ID = 2052480;

function getLemonError(result: any) {
  const first = Array.isArray(result?.errors) ? result.errors[0] : null;
  if (!first) return "Unknown Lemon Squeezy API error.";
  const detail = first.detail || first.title || first.code;
  return detail ? String(detail).slice(0, 500) : "Lemon Squeezy rejected the checkout request.";
}

function buildHostedCheckout(url: string, userId: string, rfpId: string, analysisId: string) {
  const checkout = new URL(url);
  checkout.searchParams.set("checkout[custom][user_id]", userId);
  checkout.searchParams.set("checkout[custom][rfp_id]", rfpId);
  checkout.searchParams.set("checkout[custom][analysis_id]", analysisId);
  return checkout.toString();
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

  const { data: analysis, error: analysisError } = await supabase
    .from("rfp_analyses")
    .select("id, rfp_id, project_name")
    .eq("id", analysisId)
    .maybeSingle();
  if (analysisError || !analysis) return NextResponse.json({ error: "Analysis not found." }, { status: 404 });

  const { data: rfp, error: rfpError } = await supabase
    .from("rfps")
    .select("id, file_name")
    .eq("id", analysis.rfp_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (rfpError || !rfp) return NextResponse.json({ error: "This analysis does not belong to your account." }, { status: 403 });

  const { data: existingPurchase } = await supabase
    .from("proposal_purchases")
    .select("id, status")
    .eq("analysis_id", analysis.id)
    .eq("user_id", user.id)
    .eq("status", "paid")
    .maybeSingle();

  if (existingPurchase) {
    return NextResponse.json({ url: `${new URL(request.url).origin}/proposal/${analysis.id}` });
  }

  const apiKey = process.env.LEMONSQUEEZY_API_KEY;
  const hostedCheckoutUrl = process.env.LEMONSQUEEZY_PROPOSAL_CHECKOUT_URL;
  const testMode = String(process.env.LEMONSQUEEZY_TEST_MODE || "").toLowerCase() === "true";

  if (!apiKey) {
    if (hostedCheckoutUrl) {
      return NextResponse.json({
        url: buildHostedCheckout(hostedCheckoutUrl, user.id, rfp.id, analysis.id)
      });
    }

    return NextResponse.json({
      error: "Paid proposal checkout is not configured yet. Add LEMONSQUEEZY_API_KEY in Vercel."
    }, { status: 503 });
  }

  const origin = new URL(request.url).origin;
  const configuredStoreId = process.env.LEMONSQUEEZY_STORE_ID;
  const configuredVariantId = process.env.LEMONSQUEEZY_PROPOSAL_VARIANT_ID;

  const numericStoreId = Number(configuredStoreId || ARCHBID_LEMON_STORE_ID);
  const numericVariantId = Number(
    configuredVariantId ||
    (testMode ? ARCHBID_TEST_PROPOSAL_VARIANT_ID : ARCHBID_LIVE_PROPOSAL_VARIANT_ID)
  );

  if (!Number.isInteger(numericStoreId) || !Number.isInteger(numericVariantId)) {
    return NextResponse.json({
      error: "Lemon Squeezy configuration error: Store ID and Proposal Variant ID must be numeric IDs copied from Lemon Squeezy."
    }, { status: 500 });
  }

  try {
    const response = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
      method: "POST",
      headers: {
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: {
            custom_price: 1900,
            test_mode: testMode,
            checkout_options: {
              embed: false,
              media: true,
              logo: true,
              desc: true
            },
            checkout_data: {
              email: user.email || undefined,
              custom: {
                user_id: user.id,
                rfp_id: rfp.id,
                analysis_id: analysis.id
              }
            },
            product_options: {
              enabled_variants: [numericVariantId],
              redirect_url: `${origin}/proposal/${analysis.id}?checkout=success`,
              receipt_button_text: "Return to ArchBid AI",
              receipt_link_url: `${origin}/proposal/${analysis.id}`
            }
          },
          relationships: {
            store: { data: { type: "stores", id: String(numericStoreId) } },
            variant: { data: { type: "variants", id: String(numericVariantId) } }
          }
        }
      })
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      const lemonError = getLemonError(result);
      console.error("ARCHBID LEMON SQUEEZY CHECKOUT ERROR:", {
        status: response.status,
        result,
        storeId: numericStoreId,
        variantId: numericVariantId,
        testMode
      });

      if (hostedCheckoutUrl) {
        return NextResponse.json({
          url: buildHostedCheckout(hostedCheckoutUrl, user.id, rfp.id, analysis.id),
          fallback: true
        });
      }

      return NextResponse.json({
        error: `Lemon Squeezy could not create the checkout: ${lemonError}`
      }, { status: 502 });
    }

    const checkoutUrl = result?.data?.attributes?.url;
    const checkoutId = result?.data?.id;
    if (!checkoutUrl || !checkoutId) {
      console.error("ARCHBID LEMON SQUEEZY INVALID CHECKOUT RESPONSE:", result);
      return NextResponse.json({ error: "Lemon Squeezy returned an invalid checkout." }, { status: 502 });
    }

    // Record the checkout before the customer leaves ArchBid. This is a
    // fallback for the confirmation page if the Lemon Squeezy webhook is
    // delayed or unavailable. The webhook remains the primary fulfillment path.
    try {
      const admin = createAdminClient();
      const { error: pendingError } = await admin.from("proposal_purchases").upsert({
        user_id: user.id,
        rfp_id: rfp.id,
        analysis_id: analysis.id,
        lemon_squeezy_checkout_session_id: String(checkoutId),
        lemon_squeezy_order_id: null,
        amount_cents: 1900,
        currency: "usd",
        status: "failed"
      }, { onConflict: "analysis_id" });

      if (pendingError) {
        console.error("ARCHBID LEMON SQUEEZY: could not save checkout reference", pendingError);
      }
    } catch (pendingError) {
      console.error("ARCHBID LEMON SQUEEZY: checkout reference save exception", pendingError);
    }

    return NextResponse.json({ url: checkoutUrl, checkoutId });
  } catch (error) {
    console.error("ARCHBID LEMON SQUEEZY CHECKOUT EXCEPTION:", error);

    if (hostedCheckoutUrl) {
      return NextResponse.json({
        url: buildHostedCheckout(hostedCheckoutUrl, user.id, rfp.id, analysis.id),
        fallback: true
      });
    }

    return NextResponse.json({ error: "Checkout could not be started. Please try again." }, { status: 500 });
  }
}

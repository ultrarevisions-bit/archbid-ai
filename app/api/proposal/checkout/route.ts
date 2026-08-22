import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

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
  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  const variantId = process.env.LEMONSQUEEZY_PROPOSAL_VARIANT_ID;

  if (!apiKey || !storeId || !variantId) {
    return NextResponse.json({
      error: "Paid proposal checkout is not configured yet. Add LEMONSQUEEZY_API_KEY, LEMONSQUEEZY_STORE_ID and LEMONSQUEEZY_PROPOSAL_VARIANT_ID in Vercel."
    }, { status: 503 });
  }

  const origin = new URL(request.url).origin;

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
            checkout_data: {
              email: user.email || undefined,
              custom: {
                user_id: user.id,
                rfp_id: rfp.id,
                analysis_id: analysis.id
              }
            },
            product_options: {
              redirect_url: `${origin}/proposal/${analysis.id}?checkout=success`
            }
          },
          relationships: {
            store: { data: { type: "stores", id: storeId } },
            variant: { data: { type: "variants", id: variantId } }
          }
        }
      })
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("ARCHBID LEMON SQUEEZY CHECKOUT ERROR:", result);
      return NextResponse.json({ error: "Lemon Squeezy could not create the checkout. Please try again." }, { status: 502 });
    }

    const checkoutUrl = result?.data?.attributes?.url;
    const checkoutId = result?.data?.id;
    if (!checkoutUrl || !checkoutId) {
      return NextResponse.json({ error: "Lemon Squeezy returned an invalid checkout." }, { status: 502 });
    }

    return NextResponse.json({ url: checkoutUrl, checkoutId });
  } catch (error) {
    console.error("ARCHBID LEMON SQUEEZY CHECKOUT EXCEPTION:", error);
    return NextResponse.json({ error: "Checkout could not be started. Please try again." }, { status: 500 });
  }
}

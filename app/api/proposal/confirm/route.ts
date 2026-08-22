import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const analysisId = body?.analysisId;
  const sessionId = body?.sessionId;
  if (!analysisId || !sessionId) return NextResponse.json({ error: "Missing purchase confirmation details." }, { status: 400 });

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });

  try {
    const stripe = new Stripe(secretKey);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const metadata = session.metadata || {};

    if (metadata.analysis_id !== analysisId || metadata.user_id !== user.id) {
      return NextResponse.json({ error: "This payment does not match the signed-in account or RFP." }, { status: 403 });
    }
    if (session.payment_status !== "paid") return NextResponse.json({ paid: false });

    const admin = createAdminClient();
    const { error } = await admin.from("proposal_purchases").upsert({
      user_id: user.id,
      rfp_id: metadata.rfp_id,
      analysis_id: analysisId,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
      amount_cents: session.amount_total ?? 4900,
      currency: session.currency ?? "usd",
      status: "paid"
    }, { onConflict: "analysis_id" });
    if (error) throw error;

    return NextResponse.json({ paid: true });
  } catch (error) {
    console.error("ARCHBID PROPOSAL PAYMENT CONFIRMATION ERROR:", error);
    return NextResponse.json({ error: "We could not verify the payment yet. Please refresh in a moment." }, { status: 500 });
  }
}

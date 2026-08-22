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

  const { data: purchase, error } = await supabase
    .from("proposal_purchases")
    .select("id, status")
    .eq("analysis_id", analysisId)
    .eq("user_id", user.id)
    .eq("status", "paid")
    .maybeSingle();

  if (error) {
    console.error("ARCHBID PROPOSAL PURCHASE LOOKUP ERROR:", error);
    return NextResponse.json({ error: "We could not check the payment status yet." }, { status: 500 });
  }

  return NextResponse.json({ paid: Boolean(purchase) });
}

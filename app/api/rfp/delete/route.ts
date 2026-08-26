import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const rfpId = body?.rfpId;
  if (!rfpId || typeof rfpId !== "string") return NextResponse.json({ error: "Missing RFP ID." }, { status: 400 });

  const admin = createAdminClient();
  const { data: rfp, error: lookupError } = await admin
    .from("rfps")
    .select("id, user_id, file_path")
    .eq("id", rfpId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });
  if (!rfp) return NextResponse.json({ error: "RFP not found." }, { status: 404 });

  // Remove the uploaded document first. Database records are removed below.
  if (rfp.file_path) {
    const { error: storageError } = await admin.storage.from("rfps").remove([rfp.file_path]);
    if (storageError) console.warn("RFP storage deletion warning:", storageError.message);
  }

  const { data: analyses } = await admin.from("rfp_analyses").select("id").eq("rfp_id", rfpId);
  const analysisIds = (analyses ?? []).map(item => item.id as string);

  if (analysisIds.length) {
    await admin.from("proposals").delete().in("analysis_id", analysisIds);
    await admin.from("proposal_purchases").delete().in("analysis_id", analysisIds);
    const { error: analysisDeleteError } = await admin.from("rfp_analyses").delete().in("id", analysisIds);
    if (analysisDeleteError) return NextResponse.json({ error: "We could not remove the RFP analysis records." }, { status: 500 });
  }

  const { error: rfpDeleteError } = await admin.from("rfps").delete().eq("id", rfpId).eq("user_id", user.id);
  if (rfpDeleteError) return NextResponse.json({ error: "We could not delete this RFP." }, { status: 500 });

  return NextResponse.json({ ok: true });
}

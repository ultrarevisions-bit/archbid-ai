import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (body?.confirmation !== "DELETE MY ACCOUNT") {
    return NextResponse.json({ error: "Please type DELETE MY ACCOUNT to confirm." }, { status: 400 });
  }

  const admin = createAdminClient();
  const userId = user.id;

  // Capture and remove uploaded RFP files before removing their database records.
  const { data: rfps } = await admin.from("rfps").select("id, file_path").eq("user_id", userId);
  const paths = (rfps ?? []).map(item => item.file_path as string).filter(Boolean);
  if (paths.length) {
    const { error } = await admin.storage.from("rfps").remove(paths);
    if (error) console.warn("Account RFP storage deletion warning:", error.message);
  }

  const rfpIds = (rfps ?? []).map(item => item.id as string);
  let analysisIds: string[] = [];
  if (rfpIds.length) {
    const { data: analyses } = await admin.from("rfp_analyses").select("id").in("rfp_id", rfpIds);
    analysisIds = (analyses ?? []).map(item => item.id as string);
  }

  // Remove ArchBid's account-owned application data. Lemon Squeezy remains the
  // system of record for payment/tax records and is not modified here.
  if (analysisIds.length) {
    await admin.from("proposals").delete().in("analysis_id", analysisIds);
    await admin.from("proposal_purchases").delete().in("analysis_id", analysisIds);
    await admin.from("rfp_analyses").delete().in("id", analysisIds);
  }
  if (rfpIds.length) await admin.from("rfps").delete().in("id", rfpIds).eq("user_id", userId);
  await admin.from("firms").delete().eq("owner_id", userId);

  const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);
  if (authDeleteError) {
    console.error("ArchBid account deletion auth error:", authDeleteError);
    return NextResponse.json({ error: "Your account data was prepared for deletion, but the login account could not be removed. Please contact support." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

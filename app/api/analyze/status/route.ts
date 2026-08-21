import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

function extractOutputText(response: any): string {
  if (typeof response?.output_text === "string" && response.output_text.trim()) return response.output_text.trim();
  const chunks: string[] = [];
  for (const item of Array.isArray(response?.output) ? response.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (typeof content?.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const url = new URL(request.url);
  const rfpId = url.searchParams.get("rfpId");
  if (!rfpId) return NextResponse.json({ error: "Missing RFP ID." }, { status: 400 });

  const { data: rfp, error: rfpError } = await supabase
    .from("rfps")
    .select("id, user_id, status")
    .eq("id", rfpId)
    .eq("user_id", user.id)
    .single();
  if (rfpError || !rfp) return NextResponse.json({ error: "RFP not found." }, { status: 404 });

  const { data: analysis, error: analysisError } = await supabase
    .from("rfp_analyses")
    .select("id, rfp_id, raw_analysis")
    .eq("rfp_id", rfpId)
    .maybeSingle();
  if (analysisError) return NextResponse.json({ error: analysisError.message }, { status: 500 });

  const raw = analysis?.raw_analysis && typeof analysis.raw_analysis === "object"
    ? analysis.raw_analysis as Record<string, unknown>
    : null;
  const responseId = typeof raw?.openai_response_id === "string" ? raw.openai_response_id : null;
  const processing = raw?.processing === true;
  const storedError = typeof raw?.error === "string" ? raw.error : null;

  if (analysis?.id && storedError && !processing) {
    return NextResponse.json({ status: "failed", rfpId, analysisId: null, error: storedError });
  }

  if (analysis?.id && !responseId && !processing) {
    if (rfp.status !== "analyzed") {
      await supabase.from("rfps").update({ status: "analyzed", updated_at: new Date().toISOString() }).eq("id", rfpId).eq("user_id", user.id);
    }
    return NextResponse.json({ status: "completed", rfpId, analysisId: analysis.id });
  }

  if (!responseId) return NextResponse.json({ status: rfp.status === "failed" ? "failed" : "not_started", rfpId });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is missing." }, { status: 503 });

  try {
    const ai = new OpenAI({ apiKey, timeout: 15000, maxRetries: 0 });
    const response = await ai.responses.retrieve(responseId);
    const responseStatus = String((response as any).status || "").toLowerCase();

    if (responseStatus === "queued" || responseStatus === "in_progress") {
      return NextResponse.json({ status: "analyzing", rfpId, analysisId: null });
    }

    if (responseStatus === "failed" || responseStatus === "cancelled" || responseStatus === "incomplete") {
      const message = (response as any)?.error?.message || `OpenAI analysis ended with status: ${responseStatus || "unknown"}`;
      await supabase.from("rfps").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", rfpId).eq("user_id", user.id);
      await supabase.from("rfp_analyses").update({ raw_analysis: { processing: false, error: message } }).eq("id", analysis!.id).eq("rfp_id", rfpId);
      return NextResponse.json({ status: "failed", rfpId, error: message });
    }

    const outputText = extractOutputText(response);
    if (!outputText) return NextResponse.json({ status: "analyzing", rfpId, analysisId: null });

    let parsed: any;
    try {
      parsed = JSON.parse(outputText);
    } catch {
      return NextResponse.json({ status: "analyzing", rfpId, analysisId: null });
    }

    const { error: saveError } = await supabase
      .from("rfp_analyses")
      .update({
        opportunity_score: parsed.opportunityScore,
        recommendation: parsed.recommendation,
        project_name: parsed.projectName,
        client_name: parsed.clientName,
        location: parsed.location,
        project_type: parsed.projectType,
        deadline: parsed.deadline && /^\d{4}-\d{2}-\d{2}$/.test(parsed.deadline) ? parsed.deadline : null,
        requirements: parsed.requirements,
        evaluation_criteria: parsed.evaluationCriteria,
        submission_requirements: parsed.submissionRequirements,
        risks: parsed.risks,
        strengths: parsed.strengths,
        missing_items: parsed.missingItems,
        raw_analysis: parsed,
        updated_at: new Date().toISOString()
      })
      .eq("id", analysis!.id)
      .eq("rfp_id", rfpId);

    if (saveError) throw saveError;

    await supabase.from("rfps").update({ status: "analyzed", updated_at: new Date().toISOString() }).eq("id", rfpId).eq("user_id", user.id);
    return NextResponse.json({ status: "completed", rfpId, analysisId: analysis!.id });
  } catch (error) {
    console.error("ArchBid analysis status error:", error);
    return NextResponse.json({ status: "analyzing", rfpId, analysisId: null });
  }
}

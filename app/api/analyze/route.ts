import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import mammoth from "mammoth";
import pdf from "pdf-parse";

export const runtime = "nodejs";
export const maxDuration = 60;

const analysisSchema = {
  type: "object",
  properties: {
    opportunityScore: { type: "integer", minimum: 0, maximum: 100 },
    recommendation: { type: "string", enum: ["PURSUE", "CONSIDER", "DO NOT PURSUE"] },
    confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
    projectName: { type: "string" },
    clientName: { type: "string" },
    location: { type: "string" },
    projectType: { type: "string" },
    deadline: { type: "string" },
    estimatedBudget: { type: "string" },
    executiveSummary: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    missingItems: { type: "array", items: { type: "string" } },
    criticalRedFlags: { type: "array", items: { type: "string" } },
    hardDisqualifiers: { type: "array", items: { type: "string" } },
    requirements: {
      type: "array",
      items: {
        type: "object",
        properties: {
          item: { type: "string" },
          mandatory: { type: "boolean" },
          details: { type: "string" }
        },
        required: ["item", "mandatory", "details"],
        additionalProperties: false
      }
    },
    evaluationCriteria: { type: "array", items: { type: "string" } },
    submissionRequirements: { type: "array", items: { type: "string" } },
    criticalDates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: "string" },
          event: { type: "string" },
          importance: { type: "string", enum: ["CRITICAL", "IMPORTANT", "INFO"] }
        },
        required: ["date", "event", "importance"],
        additionalProperties: false
      }
    },
    eligibility: { type: "array", items: { type: "string" } },
    commercial: { type: "array", items: { type: "string" } },
    competition: { type: "array", items: { type: "string" } },
    bidEffort: { type: "array", items: { type: "string" } },
    scoreBreakdown: {
      type: "array",
      items: {
        type: "object",
        properties: {
          factor: { type: "string" },
          score: { type: "integer", minimum: 0, maximum: 100 },
          weight: { type: "integer", minimum: 0, maximum: 100 },
          reason: { type: "string" }
        },
        required: ["factor", "score", "weight", "reason"],
        additionalProperties: false
      }
    }
  },
  required: [
    "opportunityScore", "recommendation", "confidence", "projectName", "clientName",
    "location", "projectType", "deadline", "estimatedBudget", "executiveSummary",
    "strengths", "risks", "missingItems", "criticalRedFlags", "hardDisqualifiers",
    "requirements", "evaluationCriteria", "submissionRequirements", "criticalDates",
    "eligibility", "commercial", "competition", "bidEffort", "scoreBreakdown"
  ],
  additionalProperties: false
};

const systemPrompt = `You are ArchBid AI, an RFP intelligence analyst for architecture and design firms.
Analyze the supplied procurement/RFP document carefully. Do not invent facts. If a field is not stated, return "Not stated". Distinguish clearly between facts stated in the RFP and reasonable risk observations.

Produce a PRELIMINARY opportunity score from 0-100 based only on evidence in the RFP and the practical attractiveness of pursuing it. Do not treat the score as a personalized firm-fit score because the firm's portfolio/profile is not yet available.

Use these scoring dimensions and weights:
- Eligibility: 25
- Scope/project fit: 20
- Commercial attractiveness: 20
- Win potential/competition: 15
- Bid effort: 10
- Deadline/timing: 5
- Risk: 5
Return one score (0-100) for each dimension and explain it briefly. The weighted scores should be internally consistent with the final opportunity score.

A hard eligibility failure or explicit mandatory condition that the unknown firm may not satisfy should materially suppress the overall score and be surfaced as a hard disqualifier. Do not assume the firm fails simply because the RFP requires something; flag it for verification unless the document makes the failure unavoidable.

Recommendation rules:
PURSUE = strong opportunity with manageable barriers and no obvious disqualifying issue.
CONSIDER = potentially worthwhile but one or more material uncertainties, effort requirements, or barriers need review.
DO NOT PURSUE = major eligibility, deadline, scope, effort, or risk issues make pursuit unattractive based on the RFP evidence.

Extract concrete requirements, evaluation criteria, submission requirements, all important dates you can identify, eligibility conditions, commercial information, competitive/win factors, bid effort, risks, missing information, and critical red flags. Prioritize facts that could change a go/no-go decision. Keep lists concise and useful to a busy architecture firm.

For criticalDates, include dates such as RFP release, questions deadline, mandatory pre-proposal meeting, site visit, proposal deadline, interviews, award, and anticipated start when stated. Use "Not stated" for a date that is relevant but unavailable only when it is important enough to flag; do not manufacture dates.

For scoreBreakdown, use exactly the seven scoring dimensions above with the corresponding weights. Return valid JSON matching the supplied schema.`;

const jsonFormat = {
  type: "json_schema" as const,
  name: "archbid_rfp_analysis",
  description: "Structured preliminary RFP opportunity analysis for an architecture or design firm.",
  strict: true,
  schema: analysisSchema
};

function buildDocumentText(fileName: string, fileType: string | null, buffer: Buffer) {
  const isPdf = (fileType || "").toLowerCase().includes("pdf") || fileName.toLowerCase().endsWith(".pdf");

  if (isPdf) {
    return pdf(buffer).then(parsed => {
      const text = parsed.text.trim();
      if (!text) throw new Error("This PDF does not contain readable text. A scanned/image-only PDF needs OCR, which we will add in a later version.");
      if (text.length > 300000) {
        return `${text.slice(0, 220000)}\n\n[Middle of very large document omitted for this analysis pass.]\n\n${text.slice(-80000)}`;
      }
      return text;
    });
  }

  return mammoth.extractRawText({ buffer }).then(extracted => {
    const text = extracted.value.trim();
    if (!text) throw new Error("We could not extract readable text from this DOC/DOCX file.");
    if (text.length > 300000) {
      return `${text.slice(0, 220000)}\n\n[Middle of very large document omitted for this analysis pass.]\n\n${text.slice(-80000)}`;
    }
    return text;
  });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "You must be signed in to analyze an RFP." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const rfpId = body?.rfpId;
  if (!rfpId || typeof rfpId !== "string") return NextResponse.json({ error: "Missing RFP ID." }, { status: 400 });

  const { data: rfp, error: rfpError } = await supabase
    .from("rfps")
    .select("id, user_id, file_name, file_path, file_type, status")
    .eq("id", rfpId)
    .eq("user_id", user.id)
    .single();

  if (rfpError || !rfp) return NextResponse.json({ error: "RFP not found or you do not have access to it." }, { status: 404 });
  if (!rfp.file_path) return NextResponse.json({ error: "The RFP file is missing from storage." }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ArchBid AI is not connected to its AI provider yet. Add OPENAI_API_KEY in Vercel Environment Variables." }, { status: 503 });

  // If an analysis job already exists, do not accidentally start a second AI job.
  const { data: existingAnalysis } = await supabase
    .from("rfp_analyses")
    .select("id, raw_analysis")
    .eq("rfp_id", rfp.id)
    .maybeSingle();

  const existingRaw = existingAnalysis?.raw_analysis && typeof existingAnalysis.raw_analysis === "object"
    ? existingAnalysis.raw_analysis as Record<string, unknown>
    : null;
  const existingResponseId = typeof existingRaw?.openai_response_id === "string" ? existingRaw.openai_response_id : null;

  if (existingAnalysis?.id && existingResponseId && existingRaw?.processing === true) {
    await supabase.from("rfps").update({ status: "analyzing", updated_at: new Date().toISOString() }).eq("id", rfp.id).eq("user_id", user.id);
    return NextResponse.json({ success: true, status: "already_running", rfpId: rfp.id, analysisId: existingAnalysis.id });
  }

  await supabase.from("rfps").update({ status: "analyzing", updated_at: new Date().toISOString() }).eq("id", rfp.id).eq("user_id", user.id);

  try {
    const { data: fileBlob, error: downloadError } = await supabase.storage.from("rfps").download(rfp.file_path);
    if (downloadError || !fileBlob) throw new Error("We could not retrieve the RFP from secure storage.");

    const buffer = Buffer.from(await fileBlob.arrayBuffer());
    const documentText = await buildDocumentText(rfp.file_name, rfp.file_type, buffer);
    if (documentText.length < 50) throw new Error("The RFP text is too short to analyze.");

    // Start the OpenAI job in background mode. The HTTP request returns after the job
    // is accepted instead of waiting for the model to finish. A separate status route
    // retrieves the response and saves the finished analysis into Supabase.
    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5.6",
        background: true,
        store: true,
        input: `${systemPrompt}\n\nRFP DOCUMENT TEXT:\n${documentText}`,
        text: { format: jsonFormat },
      }),
    });

    const responseJson = await openaiResponse.json().catch(() => ({}));
    if (!openaiResponse.ok || !responseJson?.id) {
      throw new Error(responseJson?.error?.message || "The AI provider could not start the background analysis.");
    }

    const analysisPayload = {
      rfp_id: rfp.id,
      raw_analysis: {
        processing: true,
        openai_response_id: responseJson.id,
        started_at: new Date().toISOString()
      }
    };

    const { data: savedAnalysis, error: analysisError } = await supabase
      .from("rfp_analyses")
      .upsert(analysisPayload, { onConflict: "rfp_id" })
      .select("id")
      .single();

    if (analysisError || !savedAnalysis) throw new Error("The AI job started, but ArchBid could not save its job status.");

    return NextResponse.json({ success: true, status: "started", rfpId: rfp.id, analysisId: savedAnalysis.id });
  } catch (error) {
    console.error("ArchBid analysis start error:", error);
    await supabase.from("rfps").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", rfp.id).eq("user_id", user.id);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Analysis could not be started." }, { status: 500 });
  }
}

import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const proposalSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    coverLetter: { type: "string" },
    executiveSummary: { type: "string" },
    projectUnderstanding: { type: "string" },
    approach: { type: "array", items: { type: "string" } },
    scopeAndDeliverables: { type: "array", items: { type: "string" } },
    schedule: { type: "array", items: { type: "string" } },
    teamAndExperience: { type: "array", items: { type: "string" } },
    compliance: { type: "array", items: { type: "string" } },
    assumptions: { type: "array", items: { type: "string" } },
    closing: { type: "string" },
    placeholders: { type: "array", items: { type: "string" } }
  },
  required: [
    "title", "coverLetter", "executiveSummary", "projectUnderstanding", "approach",
    "scopeAndDeliverables", "schedule", "teamAndExperience", "compliance", "assumptions",
    "closing", "placeholders"
  ],
  additionalProperties: false
};

const systemPrompt = `You are ArchBid AI Proposal Writer, a senior architectural proposal strategist.
Create a professional first-draft proposal for an architecture/design firm responding to the supplied RFP intelligence.

CRITICAL RULES:
- Never invent firm credentials, awards, project names, staff names, licenses, certifications, fees, client references, or experience.
- If firm information is missing, write a useful placeholder such as [INSERT RELEVANT PROJECT EXAMPLE] and list it in placeholders.
- Use facts from the RFP analysis for project-specific claims.
- Do not claim the firm satisfies an eligibility requirement unless the firm profile explicitly supports it.
- The proposal should be persuasive but procurement-safe: specific, concise, credible, and aligned with the RFP evaluation criteria.
- Do not invent a fee unless a fee is explicitly supplied.
- Do not make promises that are not supported by the RFP or firm profile.
- Tailor the approach to the project, client, scope, risks, evaluation criteria, and submission requirements.
- Produce a draft that an architecture firm can edit and submit after inserting missing firm-specific information.

The proposal should read like a real professional architectural services proposal, not an AI report.`;

const jsonFormat = {
  type: "json_schema" as const,
  name: "archbid_proposal",
  description: "A procurement-safe first-draft architecture RFP proposal.",
  strict: true,
  schema: proposalSchema
};

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

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const analysisId = body?.analysisId;
  if (!analysisId || typeof analysisId !== "string") return NextResponse.json({ error: "Missing analysis ID." }, { status: 400 });

  const { data: analysis, error: analysisError } = await supabase
    .from("rfp_analyses")
    .select("*")
    .eq("id", analysisId)
    .maybeSingle();
  if (analysisError || !analysis) return NextResponse.json({ error: "Analysis not found." }, { status: 404 });

  const { data: rfp, error: rfpError } = await supabase
    .from("rfps")
    .select("id, user_id, file_name, firm_id")
    .eq("id", analysis.rfp_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (rfpError || !rfp) return NextResponse.json({ error: "This analysis does not belong to your account." }, { status: 403 });

  const { data: purchase } = await supabase
    .from("proposal_purchases")
    .select("id, status")
    .eq("analysis_id", analysis.id)
    .eq("user_id", user.id)
    .eq("status", "paid")
    .maybeSingle();
  if (!purchase) return NextResponse.json({ error: "A paid proposal purchase is required for this RFP." }, { status: 402 });

  const { data: firm } = await supabase
    .from("firms")
    .select("name, country, services, website")
    .eq("owner_id", user.id)
    .maybeSingle();

  const { data: existingProposal } = await supabase
    .from("proposals")
    .select("id, status, content")
    .eq("analysis_id", analysis.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingProposal?.status === "ready" && existingProposal.content) {
    return NextResponse.json({ status: "ready", proposalId: existingProposal.id, proposal: existingProposal.content });
  }

  const proposalRow = {
    user_id: user.id,
    rfp_id: rfp.id,
    analysis_id: analysis.id,
    status: "generating",
    content: {}
  };

  const { data: savedProposal, error: proposalSaveError } = await supabase
    .from("proposals")
    .upsert(proposalRow, { onConflict: "analysis_id" })
    .select("id")
    .single();
  if (proposalSaveError || !savedProposal) return NextResponse.json({ error: "We could not start proposal generation." }, { status: 500 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is missing." }, { status: 503 });

  const raw = analysis.raw_analysis && typeof analysis.raw_analysis === "object" ? analysis.raw_analysis : {};
  const firmProfile = firm || { name: "[FIRM NAME]", country: "United States", services: [], website: "" };

  const input = `${systemPrompt}

FIRM PROFILE:
${JSON.stringify(firmProfile, null, 2)}

RFP ANALYSIS:
${JSON.stringify({
    fileName: rfp.file_name,
    projectName: analysis.project_name,
    clientName: analysis.client_name,
    location: analysis.location,
    projectType: analysis.project_type,
    deadline: analysis.deadline,
    opportunityScore: analysis.opportunity_score,
    recommendation: analysis.recommendation,
    requirements: analysis.requirements,
    evaluationCriteria: analysis.evaluation_criteria,
    submissionRequirements: analysis.submission_requirements,
    risks: analysis.risks,
    strengths: analysis.strengths,
    missingItems: analysis.missing_items,
    intelligence: raw
  }, null, 2)}

Create the proposal draft now.`;

  try {
    const openai = new OpenAI({ apiKey, timeout: 55000, maxRetries: 0 });
    const response = await openai.responses.create({
      model: "gpt-5.6",
      input,
      text: { format: jsonFormat }
    });

    const outputText = extractOutputText(response);
    if (!outputText) throw new Error("The AI returned an empty proposal.");
    const proposal = JSON.parse(outputText);

    const { error: updateError } = await supabase
      .from("proposals")
      .update({ status: "ready", content: proposal, updated_at: new Date().toISOString() })
      .eq("id", savedProposal.id)
      .eq("user_id", user.id);
    if (updateError) throw updateError;

    return NextResponse.json({ status: "ready", proposalId: savedProposal.id, proposal });
  } catch (error) {
    console.error("ARCHBID PROPOSAL GENERATION ERROR:", error);
    await supabase
      .from("proposals")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", savedProposal.id)
      .eq("user_id", user.id);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Proposal generation failed." }, { status: 500 });
  }
}

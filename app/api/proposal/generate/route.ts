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
Create a polished, concise first-draft proposal for an architecture/design firm responding to the supplied RFP intelligence.

CRITICAL PROCUREMENT-SAFETY RULES:
- Never invent firm credentials, awards, project names, staff names, licenses, certifications, fees, client references, office locations, response times, or experience.
- If firm information is missing, write a specific useful placeholder such as [INSERT RELEVANT MUNICIPAL PROJECT EXAMPLE] and list it in placeholders.
- Use facts from the RFP analysis for project-specific claims.
- Do not claim the firm satisfies an eligibility requirement unless the firm profile explicitly supports it.
- Do not invent a fee unless a fee is explicitly supplied.
- Do not make promises that are not supported by the RFP or firm profile.
- If the RFP deadline has passed or the recommendation is DO NOT PURSUE, do not present that as a current submission opportunity. Clearly state that the draft is conditional on the solicitation being reopened, reissued, or confirmed active.

WRITING AND LENGTH RULES:
- The finished document should feel like a real architectural services proposal, not an AI report or RFP summary.
- Target roughly 6–8 printed pages, not 12+ pages, unless the RFP genuinely requires more detail.
- Prefer dense, useful content over empty space or repetition.
- Cover letter: 3–4 short paragraphs.
- Executive summary: 2–3 focused paragraphs.
- Project understanding: 2–3 focused paragraphs.
- Approach: 5–7 strong bullets, each normally 1–3 sentences.
- Scope & deliverables: 5–7 bullets.
- Schedule & milestones: 4–6 bullets.
- Team & relevant experience: 6–10 bullets, using placeholders only where necessary.
- Compliance: 6–10 bullets covering the highest-value submission requirements rather than repeating the RFP.
- Assumptions: only the important unresolved items; normally no more than 6–8 bullets.
- Closing: 1–2 short paragraphs.
- Avoid repeating the same deadline, budget, insurance, or legal warning in multiple sections. State it once where it matters and reference it briefly elsewhere.
- Do not reproduce the RFP. Synthesize what matters and translate it into a persuasive response strategy.
- Keep paragraphs short and avoid filler phrases such as “we are pleased to”, “we understand that” when they add no value.
- Make the approach concrete: explain how the firm would mobilize, coordinate disciplines, control scope/schedule/cost, manage quality, communicate, and deliver task orders.
- Make the document easy for a procurement evaluator to scan.

PLACEHOLDERS:
- Use placeholders only for information the firm must actually supply.
- Keep placeholders concise and actionable.
- Do not create a separate placeholder for every sentence. Group related missing information where practical.
- Deduplicate the placeholders list.

The proposal must be persuasive, concise, credible, procurement-safe, and tailored to the RFP evaluation criteria.`;

const jsonFormat = {
  type: "json_schema" as const,
  name: "archbid_proposal",
  description: "A concise, procurement-safe first-draft architecture RFP proposal.",
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

function compactRawAnalysis(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return {};
  const json = JSON.stringify(raw);
  if (json.length <= 24000) return raw;
  return {
    note: "Full raw analysis omitted here because the structured RFP fields above are authoritative for proposal drafting.",
    excerpt: json.slice(0, 24000)
  };
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const analysisId = body?.analysisId;
  const regenerate = body?.regenerate === true;
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

  if (!regenerate && existingProposal?.status === "ready" && existingProposal.content) {
    return NextResponse.json({ status: "ready", proposalId: existingProposal.id, proposal: existingProposal.content });
  }

  const proposalRow = {
    user_id: user.id,
    rfp_id: rfp.id,
    analysis_id: analysis.id,
    status: "generating",
    content: regenerate && existingProposal?.content ? existingProposal.content : {}
  };

  const { data: savedProposal, error: proposalSaveError } = await supabase
    .from("proposals")
    .upsert(proposalRow, { onConflict: "analysis_id" })
    .select("id")
    .single();
  if (proposalSaveError || !savedProposal) return NextResponse.json({ error: "We could not start proposal generation." }, { status: 500 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is missing." }, { status: 503 });

  const firmProfile = firm || { name: "[FIRM NAME]", country: "United States", services: [], website: "" };
  const rfpIntelligence = {
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
    intelligence: compactRawAnalysis(analysis.raw_analysis)
  };

  const input = `${systemPrompt}

FIRM PROFILE:
${JSON.stringify(firmProfile, null, 2)}

RFP ANALYSIS:
${JSON.stringify(rfpIntelligence, null, 2)}

Create the proposal draft now.`;

  try {
    const openai = new OpenAI({ apiKey, timeout: 50000, maxRetries: 0 });
    const response = await openai.responses.create({
      model: "gpt-5.6-luna",
      input,
      reasoning: { effort: "low" },
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

import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const proposalSchema = {
  type: "object",
  properties: {
    title: { type: "string" }, coverLetter: { type: "string" }, executiveSummary: { type: "string" }, projectUnderstanding: { type: "string" },
    approach: { type: "array", items: { type: "string" } }, scopeAndDeliverables: { type: "array", items: { type: "string" } }, schedule: { type: "array", items: { type: "string" } },
    teamAndExperience: { type: "array", items: { type: "string" } }, compliance: { type: "array", items: { type: "string" } }, assumptions: { type: "array", items: { type: "string" } },
    closing: { type: "string" }, placeholders: { type: "array", items: { type: "string" } }
  },
  required: ["title", "coverLetter", "executiveSummary", "projectUnderstanding", "approach", "scopeAndDeliverables", "schedule", "teamAndExperience", "compliance", "assumptions", "closing", "placeholders"],
  additionalProperties: false
};

const systemPrompt = `You are ArchBid AI Proposal Writer, a senior architectural proposal strategist.
Create a polished, concise first-draft proposal for an architecture/design firm responding to the supplied RFP intelligence.

CRITICAL PROCUREMENT-SAFETY RULES:
- Never invent firm credentials, awards, project names, staff names, licenses, certifications, fees, client references, office locations, response times, or experience.
- Treat the Firm Profile as the only source of firm-specific facts. Do not infer credentials or experience from the firm's services list.
- If a firm fact is missing, do not guess. Use a concise, actionable placeholder and include it in placeholders.
- If a firm fact is present in the Firm Profile, use it naturally in the proposal and do not replace it with an [INSERT...] placeholder.
- Use facts from the RFP analysis for project-specific claims.
- Do not claim the firm satisfies an eligibility requirement unless the Firm Profile explicitly supports it.
- Do not invent a fee unless a fee is explicitly supplied.
- Do not make promises that are not supported by the RFP or Firm Profile.
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
- Team & relevant experience: 6–10 bullets, using verified Firm Profile information and placeholders only where necessary.
- Compliance: 6–10 bullets covering the highest-value submission requirements rather than repeating the RFP.
- Assumptions: only the important unresolved items; normally no more than 6–8 bullets.
- Closing: 1–2 short paragraphs.
- Avoid repeating the same deadline, budget, insurance, or legal warning in multiple sections.
- Do not reproduce the RFP. Synthesize what matters and translate it into a persuasive response strategy.
- Keep paragraphs short and avoid filler phrases.
- Make the approach concrete: explain how the firm would mobilize, coordinate disciplines, control scope/schedule/cost, manage quality, communicate, and deliver task orders.
- Make the document easy for a procurement evaluator to scan.

FIRM INFORMATION — TO BE COMPLETED:
When important firm-specific information is missing, create a final placeholders list headed conceptually as “Firm Information — To Be Completed.” Use clear items such as “Firm legal name,” “Authorized representative,” “Relevant registrations and licenses,” “Years of experience,” “Availability and capacity,” “Municipal experience,” “Relevant project experience,” and “Team members,” but include only information that is actually missing.
Do not turn missing information into invented prose. Do not create a placeholder for information that is already present in the Firm Profile.

The proposal must be persuasive, concise, credible, procurement-safe, and tailored to the RFP evaluation criteria.`;

const jsonFormat = { type: "json_schema" as const, name: "archbid_proposal", description: "A concise, procurement-safe first-draft architecture RFP proposal.", strict: true, schema: proposalSchema };

function extractOutputText(response: any): string {
  if (typeof response?.output_text === "string" && response.output_text.trim()) return response.output_text.trim();
  const chunks: string[] = [];
  for (const item of Array.isArray(response?.output) ? response.output : []) for (const content of Array.isArray(item?.content) ? item.content : []) if (typeof content?.text === "string") chunks.push(content.text);
  return chunks.join("\n").trim();
}

function compactRawAnalysis(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return {};
  const json = JSON.stringify(raw);
  if (json.length <= 24000) return raw;
  return { note: "Full raw analysis omitted here because the structured RFP fields above are authoritative for proposal drafting.", excerpt: json.slice(0, 24000) };
}

function isFilled(value: unknown) {
  return typeof value === "string" ? value.trim().length > 0 : Array.isArray(value) ? value.length > 0 : Boolean(value);
}

function addMissingPlaceholders(proposal: any, firmProfile: Record<string, any>) {
  const missing: Array<[string, string]> = [
    ["legalName", "Firm legal name"], ["authorizedRepresentative", "Authorized representative"], ["registrationsLicenses", "Relevant registrations and licenses"], ["yearsExperience", "Years of experience"],
    ["availabilityCapacity", "Availability and capacity"], ["municipalExperience", "Municipal experience"], ["projectExperience", "Relevant project experience"], ["teamMembers", "Team members"]
  ];
  const existing: string[] = Array.isArray(proposal.placeholders) ? proposal.placeholders.map((item: unknown) => String(item).trim()).filter(Boolean) : [];
  const existingLower = new Set<string>(existing.map((item: string) => item.toLowerCase()));
  for (const [key, label] of missing) if (!isFilled(firmProfile[key]) && !existingLower.has(label.toLowerCase())) existing.push(label);
  proposal.placeholders = [...new Set(existing)];
  return proposal;
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const analysisId = body?.analysisId;
  if (!analysisId || typeof analysisId !== "string") return NextResponse.json({ error: "Missing analysis ID." }, { status: 400 });
  const { data: analysis, error: analysisError } = await supabase.from("rfp_analyses").select("*").eq("id", analysisId).maybeSingle();
  if (analysisError || !analysis) return NextResponse.json({ error: "Analysis not found." }, { status: 404 });
  const { data: rfp, error: rfpError } = await supabase.from("rfps").select("id, user_id, file_name, firm_id").eq("id", analysis.rfp_id).eq("user_id", user.id).maybeSingle();
  if (rfpError || !rfp) return NextResponse.json({ error: "This analysis does not belong to your account." }, { status: 403 });
  const { data: purchase } = await supabase.from("proposal_purchases").select("id, status").eq("analysis_id", analysis.id).eq("user_id", user.id).eq("status", "paid").maybeSingle();
  if (!purchase) return NextResponse.json({ error: "A paid proposal purchase is required for this RFP." }, { status: 402 });
  const { data: firmBasic } = await supabase.from("firms").select("name, country, services, website, profile").eq("owner_id", user.id).maybeSingle();
  const firmProfile = { name: firmBasic?.name || "", country: firmBasic?.country || "United States", website: firmBasic?.website || "", services: Array.isArray(firmBasic?.services) ? firmBasic.services : [], ...((firmBasic?.profile && typeof firmBasic.profile === "object") ? firmBasic.profile : {}) } as Record<string, any>;
  if (!firmProfile.legalName && firmProfile.name) firmProfile.legalName = firmProfile.name;
  const { data: existingProposal } = await supabase.from("proposals").select("id, status, content").eq("analysis_id", analysis.id).eq("user_id", user.id).maybeSingle();
  if (existingProposal?.status === "ready" && existingProposal.content) return NextResponse.json({ status: "ready", proposalId: existingProposal.id, proposal: existingProposal.content });
  const proposalRow = { user_id: user.id, rfp_id: rfp.id, analysis_id: analysis.id, status: "generating", content: {} };
  const { data: savedProposal, error: proposalSaveError } = await supabase.from("proposals").upsert(proposalRow, { onConflict: "analysis_id" }).select("id").single();
  if (proposalSaveError || !savedProposal) return NextResponse.json({ error: "We could not start proposal generation." }, { status: 500 });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is missing." }, { status: 503 });
  const rfpIntelligence = { fileName: rfp.file_name, projectName: analysis.project_name, clientName: analysis.client_name, location: analysis.location, projectType: analysis.project_type, deadline: analysis.deadline, opportunityScore: analysis.opportunity_score, recommendation: analysis.recommendation, requirements: analysis.requirements, evaluationCriteria: analysis.evaluation_criteria, submissionRequirements: analysis.submission_requirements, risks: analysis.risks, strengths: analysis.strengths, missingItems: analysis.missing_items, intelligence: compactRawAnalysis(analysis.raw_analysis) };
  const missingFirmFields = ["legalName", "authorizedRepresentative", "registrationsLicenses", "yearsExperience", "availabilityCapacity", "municipalExperience", "projectExperience", "teamMembers"].filter(key => !isFilled(firmProfile[key]));
  const input = `${systemPrompt}\n\nFIRM PROFILE (verified information supplied by the user):\n${JSON.stringify(firmProfile, null, 2)}\n\nMISSING FIRM PROFILE FIELDS:\n${JSON.stringify(missingFirmFields)}\n\nRFP ANALYSIS:\n${JSON.stringify(rfpIntelligence, null, 2)}\n\nCreate the proposal draft now.`;
  try {
    const openai = new OpenAI({ apiKey, timeout: 50000, maxRetries: 0 });
    const response = await openai.responses.create({ model: "gpt-5.6-luna", input, reasoning: { effort: "low" }, text: { format: jsonFormat } });
    const outputText = extractOutputText(response);
    if (!outputText) throw new Error("The AI returned an empty proposal.");
    const proposal = addMissingPlaceholders(JSON.parse(outputText), firmProfile);
    const { error: updateError } = await supabase.from("proposals").update({ status: "ready", content: proposal, updated_at: new Date().toISOString() }).eq("id", savedProposal.id).eq("user_id", user.id);
    if (updateError) throw updateError;
    return NextResponse.json({ status: "ready", proposalId: savedProposal.id, proposal });
  } catch (error) {
    console.error("ARCHBID PROPOSAL GENERATION ERROR:", error);
    await supabase.from("proposals").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", savedProposal.id).eq("user_id", user.id);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Proposal generation failed." }, { status: 500 });
  }
}

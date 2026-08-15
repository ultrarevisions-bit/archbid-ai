import { GoogleGenAI, createPartFromUri, createUserContent } from "@google/genai";
import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import mammoth from "mammoth";

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
    requirements: {
      type: "array",
      items: {
        type: "object",
        properties: {
          item: { type: "string" },
          mandatory: { type: "boolean" },
          details: { type: "string" }
        },
        required: ["item", "mandatory", "details"]
      }
    },
    evaluationCriteria: { type: "array", items: { type: "string" } },
    submissionRequirements: { type: "array", items: { type: "string" } }
  },
  required: [
    "opportunityScore", "recommendation", "confidence", "projectName", "clientName",
    "location", "projectType", "deadline", "estimatedBudget", "executiveSummary",
    "strengths", "risks", "missingItems", "requirements", "evaluationCriteria",
    "submissionRequirements"
  ]
};

const systemPrompt = `You are ArchBid AI, an RFP intelligence analyst for architecture and design firms.
Analyze the attached procurement/RFP document carefully. Do not invent facts. If a field is not stated, return "Not stated".

Produce a PRELIMINARY opportunity score from 0-100 based only on evidence in the RFP and the practical attractiveness of pursuing it. Consider:
- eligibility and mandatory qualifications
- scope fit for an architecture/design practice
- commercial attractiveness when budget/fee information exists
- submission effort and complexity
- deadline pressure
- evaluation criteria and competitive requirements
- risks, exclusions, certifications, licensing, local experience, and other barriers

Do not claim that the score is a personalized firm-fit score because the firm's detailed portfolio/profile is not yet available. Use the firm's name only for context.

Recommendation rules:
PURSUE = strong opportunity with manageable barriers.
CONSIDER = potentially worthwhile but one or more material uncertainties or barriers need review.
DO NOT PURSUE = major eligibility, deadline, scope, effort, or risk issues make pursuit unattractive.

Extract concrete requirements, evaluation criteria, submission requirements, deadlines, budget/fee information, risks, and missing items. Keep each list concise but useful to a busy architecture firm. Return valid JSON matching the supplied schema.`;

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "You must be signed in to analyze an RFP." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const rfpId = body?.rfpId;
  if (!rfpId || typeof rfpId !== "string") {
    return NextResponse.json({ error: "Missing RFP ID." }, { status: 400 });
  }

  const { data: rfp, error: rfpError } = await supabase
    .from("rfps")
    .select("id, user_id, file_name, file_path, file_type")
    .eq("id", rfpId)
    .eq("user_id", user.id)
    .single();

  if (rfpError || !rfp) return NextResponse.json({ error: "RFP not found or you do not have access to it." }, { status: 404 });
  if (!rfp.file_path) return NextResponse.json({ error: "The RFP file is missing from storage." }, { status: 400 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ArchBid AI is not connected to its AI provider yet. Add GEMINI_API_KEY in Vercel Environment Variables." }, { status: 503 });

  await supabase.from("rfps").update({ status: "analyzing" }).eq("id", rfp.id).eq("user_id", user.id);

  try {
    const { data: fileBlob, error: downloadError } = await supabase.storage.from("rfps").download(rfp.file_path);
    if (downloadError || !fileBlob) throw new Error("We could not retrieve the RFP from secure storage.");

    const ai = new GoogleGenAI({ apiKey });
    let response;

    if ((rfp.file_type || "").toLowerCase().includes("pdf") || rfp.file_name.toLowerCase().endsWith(".pdf")) {
      const geminiFile = await ai.files.upload({
        file: fileBlob,
        config: { mimeType: "application/pdf", displayName: rfp.file_name }
      });

      let processed = await ai.files.get({ name: geminiFile.name });
      const started = Date.now();
      while (processed.state === "PROCESSING" && Date.now() - started < 30000) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        processed = await ai.files.get({ name: geminiFile.name });
      }
      if (processed.state === "FAILED") throw new Error("Gemini could not process this PDF.");
      if (processed.state === "PROCESSING") throw new Error("The document is taking too long to process. Please try the analysis again.");

      response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: createUserContent([
          { text: systemPrompt },
          createPartFromUri(geminiFile.uri!, geminiFile.mimeType || "application/pdf")
        ]),
        config: { responseMimeType: "application/json", responseSchema: analysisSchema }
      });

      try { await ai.files.delete({ name: geminiFile.name }); } catch { /* temporary Gemini files expire automatically */ }
    } else {
      const buffer = Buffer.from(await fileBlob.arrayBuffer());
      const extracted = await mammoth.extractRawText({ buffer });
      const text = extracted.value.trim();
      if (!text) throw new Error("We could not extract readable text from this DOC/DOCX file.");
      if (text.length > 120000) throw new Error("This DOC/DOCX file is too large to process in one analysis. Please use the PDF version of the RFP.");

      response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `${systemPrompt}\n\nRFP DOCUMENT TEXT:\n${text}`,
        config: { responseMimeType: "application/json", responseSchema: analysisSchema }
      });
    }

    if (!response.text) throw new Error("The AI returned an empty analysis.");
    const analysis = JSON.parse(response.text);

    const { data: savedAnalysis, error: analysisError } = await supabase
      .from("rfp_analyses")
      .upsert({
        rfp_id: rfp.id,
        opportunity_score: analysis.opportunityScore,
        recommendation: analysis.recommendation,
        project_name: analysis.projectName,
        client_name: analysis.clientName,
        location: analysis.location,
        project_type: analysis.projectType,
        deadline: analysis.deadline && /^\d{4}-\d{2}-\d{2}$/.test(analysis.deadline) ? analysis.deadline : null,
        requirements: analysis.requirements,
        evaluation_criteria: analysis.evaluationCriteria,
        submission_requirements: analysis.submissionRequirements,
        risks: analysis.risks,
        strengths: analysis.strengths,
        missing_items: analysis.missingItems,
        raw_analysis: analysis
      }, { onConflict: "rfp_id" })
      .select("id")
      .single();

    if (analysisError || !savedAnalysis) throw new Error("The AI analysis completed, but we could not save the result.");

    await supabase.from("rfps").update({ status: "analyzed", updated_at: new Date().toISOString() }).eq("id", rfp.id).eq("user_id", user.id);

    return NextResponse.json({ success: true, rfpId: rfp.id, analysisId: savedAnalysis.id });
  } catch (error) {
    console.error("ArchBid analysis error:", error);
    await supabase.from("rfps").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", rfp.id).eq("user_id", user.id);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Analysis failed. Please try again." }, { status: 500 });
  }
}

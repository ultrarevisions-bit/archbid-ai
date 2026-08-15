import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import "./results.css";

function scoreClass(score: number) {
  if (score >= 75) return "strong";
  if (score >= 50) return "consider";
  return "weak";
}

function recommendationLabel(value: string | null) {
  if (value === "PURSUE") return "PURSUE";
  if (value === "DO NOT PURSUE") return "DO NOT PURSUE";
  return "CONSIDER";
}

export default async function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return notFound();

  const { data: analysis } = await supabase
    .from("rfp_analyses")
    .select("*")
    .eq("id", id)
    .single();
  if (!analysis) return notFound();

  const { data: rfp } = await supabase
    .from("rfps")
    .select("file_name, user_id")
    .eq("id", analysis.rfp_id)
    .single();
  if (!rfp || rfp.user_id !== user.id) return notFound();

  const raw = (analysis.raw_analysis ?? {}) as Record<string, unknown>;
  const score = Number(analysis.opportunity_score ?? 0);
  const recommendation = recommendationLabel(analysis.recommendation);
  const requirements = Array.isArray(analysis.requirements) ? analysis.requirements as Array<Record<string, unknown>> : [];
  const evaluation = Array.isArray(analysis.evaluation_criteria) ? analysis.evaluation_criteria as string[] : [];
  const submissions = Array.isArray(analysis.submission_requirements) ? analysis.submission_requirements as string[] : [];
  const risks = Array.isArray(analysis.risks) ? analysis.risks as string[] : [];
  const strengths = Array.isArray(analysis.strengths) ? analysis.strengths as string[] : [];
  const missing = Array.isArray(analysis.missing_items) ? analysis.missing_items as string[] : [];

  return (
    <main className="results-page">
      <nav className="results-nav container">
        <Link className="brand" href="/"><span className="brand-mark">A</span> ArchBid <span className="brand-ai">AI</span></Link>
        <div className="result-nav-links"><Link href="/dashboard">Analyze another RFP</Link><Link className="nav-button" href="/dashboard">Dashboard</Link></div>
      </nav>

      <section className="container results-container">
        <div className="section-label">RFP INTELLIGENCE REPORT</div>
        <div className="result-heading">
          <div><h1>{analysis.project_name || "RFP Analysis"}</h1><p>{rfp.file_name} · Preliminary opportunity assessment</p></div>
          <div className={`score-card ${scoreClass(score)}`}><span>OPPORTUNITY SCORE</span><strong>{score}</strong><small>/100</small></div>
        </div>

        <div className={`recommendation ${scoreClass(score)}`}>
          <div><span>RECOMMENDATION</span><strong>{recommendation}</strong></div>
          <p>{String(raw.executiveSummary || "ArchBid reviewed the available RFP evidence and identified the main pursuit factors below.")}</p>
        </div>

        <div className="facts-grid">
          <div><span>CLIENT</span><strong>{analysis.client_name || "Not stated"}</strong></div>
          <div><span>LOCATION</span><strong>{analysis.location || "Not stated"}</strong></div>
          <div><span>PROJECT TYPE</span><strong>{analysis.project_type || "Not stated"}</strong></div>
          <div><span>DEADLINE</span><strong>{analysis.deadline || "Not stated"}</strong></div>
          <div><span>ESTIMATED BUDGET</span><strong>{String(raw.estimatedBudget || "Not stated")}</strong></div>
          <div><span>CONFIDENCE</span><strong>{String(raw.confidence || "MEDIUM")}</strong></div>
        </div>

        <div className="report-grid">
          <section className="report-card"><h2>Why this could be a good opportunity</h2>{strengths.length ? <ul>{strengths.map((item, i)=><li key={i}>{item}</li>)}</ul> : <p>No specific strengths were identified in the document.</p>}</section>
          <section className="report-card risk-card"><h2>Risks to review</h2>{risks.length ? <ul>{risks.map((item, i)=><li key={i}>{item}</li>)}</ul> : <p>No major risks were identified from the available information.</p>}</section>
        </div>

        <section className="report-card full"><h2>Key requirements</h2><div className="requirement-list">{requirements.length ? requirements.map((item, i)=><div className="requirement" key={i}><div><strong>{String(item.item || "Requirement")}</strong><p>{String(item.details || "")}</p></div><span className={item.mandatory ? "mandatory" : "preferred"}>{item.mandatory ? "MANDATORY" : "PREFERRED"}</span></div>) : <p>No structured requirements were extracted.</p>}</div></section>

        <div className="report-grid">
          <section className="report-card"><h2>Evaluation criteria</h2>{evaluation.length ? <ul>{evaluation.map((item, i)=><li key={i}>{item}</li>)}</ul> : <p>Not clearly stated.</p>}</section>
          <section className="report-card"><h2>Submission checklist</h2>{submissions.length ? <ul className="checklist">{submissions.map((item, i)=><li key={i}><span>□</span>{item}</li>)}</ul> : <p>Not clearly stated.</p>}</section>
        </div>

        <div className="report-grid">
          <section className="report-card"><h2>Potentially missing items</h2>{missing.length ? <ul>{missing.map((item, i)=><li key={i}>{item}</li>)}</ul> : <p>Nothing obvious was missing from the extracted information.</p>}</section>
          <section className="report-card"><h2>Next step</h2><p>Review the mandatory requirements, confirm your firm's eligibility and licensing, then compare the opportunity against your portfolio and available team capacity before committing to a response.</p></section>
        </div>

        <div className="report-footer"><span>ArchBid AI provides decision support, not legal or procurement advice.</span><Link href="/dashboard">Analyze another RFP →</Link></div>
      </section>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import "./results.css";

type Analysis = {
  opportunity_score: number | null;
  recommendation: string | null;
  project_name: string | null;
  client_name: string | null;
  location: string | null;
  project_type: string | null;
  deadline: string | null;
  requirements: { item: string; mandatory: boolean; details: string }[];
  evaluation_criteria: string[];
  submission_requirements: string[];
  risks: string[];
  strengths: string[];
  missing_items: string[];
  raw_analysis: { confidence?: string; executiveSummary?: string; estimatedBudget?: string } | null;
};

export default function ResultsPage() {
  const params = useParams<{ rfpId: string }>();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }

      const { data: rfp, error: rfpError } = await supabase
        .from("rfps")
        .select("id, file_name")
        .eq("id", params.rfpId)
        .eq("user_id", user.id)
        .single();
      if (rfpError || !rfp) { setError("RFP not found."); setLoading(false); return; }
      setFileName(rfp.file_name);

      const { data, error: analysisError } = await supabase
        .from("rfp_analyses")
        .select("opportunity_score, recommendation, project_name, client_name, location, project_type, deadline, requirements, evaluation_criteria, submission_requirements, risks, strengths, missing_items, raw_analysis")
        .eq("rfp_id", rfp.id)
        .single();
      if (analysisError || !data) setError("The analysis result is not available yet. Please return to your dashboard and try again.");
      else setAnalysis(data as Analysis);
      setLoading(false);
    }
    load();
  }, [params.rfpId]);

  if (loading) return <main className="results-page"><div className="results-loading">Loading your ArchBid report…</div></main>;
  if (error || !analysis) return <main className="results-page"><div className="results-error"><h1>Analysis not ready</h1><p>{error}</p><Link href="/dashboard">Back to dashboard →</Link></div></main>;

  const score = analysis.opportunity_score ?? 0;
  const rec = analysis.recommendation || "CONSIDER";
  const tone = rec === "PURSUE" ? "pursue" : rec === "DO NOT PURSUE" ? "no-pursue" : "consider";
  const raw = analysis.raw_analysis || {};

  return (
    <main className="results-page">
      <nav className="results-nav container"><Link className="brand" href="/dashboard"><span className="brand-mark">A</span> ArchBid <span className="brand-ai">AI</span></Link><Link href="/dashboard">← Dashboard</Link></nav>
      <section className="container results-content">
        <div className="section-label">RFP INTELLIGENCE REPORT</div>
        <p className="file-name">{fileName}</p>
        <div className="score-hero">
          <div><div className="score-label">OPPORTUNITY SCORE</div><div className="score">{score}<span>/100</span></div><div className={`recommendation ${tone}`}>{rec}</div></div>
          <div className="summary"><h1>{analysis.project_name || "RFP Opportunity"}</h1><p>{raw.executiveSummary || "Preliminary opportunity assessment based on the submitted RFP."}</p><div className="meta"><span><strong>Client</strong>{analysis.client_name || "Not stated"}</span><span><strong>Location</strong>{analysis.location || "Not stated"}</span><span><strong>Deadline</strong>{analysis.deadline || "Not stated"}</span><span><strong>Budget</strong>{raw.estimatedBudget || "Not stated"}</span></div></div>
        </div>
        <div className="results-grid">
          <ResultCard title="Why this looks attractive" items={analysis.strengths} />
          <ResultCard title="Risks to review" items={analysis.risks} />
          <ResultCard title="Requirements" items={analysis.requirements.map(r => `${r.mandatory ? "MANDATORY: " : ""}${r.item}${r.details ? ` — ${r.details}` : ""}`)} />
          <ResultCard title="Evaluation criteria" items={analysis.evaluation_criteria} />
          <ResultCard title="Submission checklist" items={analysis.submission_requirements} />
          <ResultCard title="Missing / unclear items" items={analysis.missing_items} />
        </div>
        <div className="report-note"><strong>Preliminary assessment:</strong> This score is based on the RFP itself. A personalized firm-fit score will be added after you complete your ArchBid firm profile.</div>
      </section>
    </main>
  );
}

function ResultCard({ title, items }: { title: string; items: string[] }) {
  return <article className="result-card"><h2>{title}</h2>{items?.length ? <ul>{items.map((item, i) => <li key={i}>{item}</li>)}</ul> : <p>Not stated in the RFP.</p>}</article>;
}

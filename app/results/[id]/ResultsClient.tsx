"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Analysis = {
  id: string;
  rfp_id: string;
  opportunity_score: number | null;
  recommendation: string | null;
  project_name: string | null;
  client_name: string | null;
  location: string | null;
  project_type: string | null;
  deadline: string | null;
  requirements: unknown;
  evaluation_criteria: unknown;
  submission_requirements: unknown;
  risks: unknown;
  strengths: unknown;
  missing_items: unknown;
  raw_analysis: unknown;
};

type Rfp = {
  file_name: string;
  user_id: string;
};

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

function asString(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        return asString(obj.item ?? obj.name ?? obj.title ?? obj.details ?? obj.value, "");
      }
      return asString(item, "");
    })
    .filter(Boolean);
}

function objectList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
}

function formatDate(value: unknown) {
  const text = asString(value, "Not stated");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(`${text}T00:00:00`);
  return Number.isNaN(date.getTime()) ? text : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function requirementList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (item && typeof item === "object") return item as Record<string, unknown>;
    return { item: asString(item, "Requirement"), mandatory: false, details: "" };
  });
}

export default function ResultsClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [rfp, setRfp] = useState<Rfp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    const supabase = createClient();

    async function loadResults() {
      try {
        setLoading(true);
        setError("");

        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw new Error(`Authentication error: ${authError.message}`);
        if (!user) {
          router.replace("/login");
          return;
        }

        console.log("ARCHBID RESULTS: loading id:", id);
        console.log("ARCHBID RESULTS: user:", user.id);

        let foundAnalysis: Analysis | null = null;

        const { data: byAnalysisId, error: analysisIdError } = await supabase
          .from("rfp_analyses")
          .select("*")
          .eq("id", id)
          .maybeSingle();

        console.log("ARCHBID RESULTS: analysis by id:", byAnalysisId);
        console.log("ARCHBID RESULTS: analysis id error:", analysisIdError);

        if (analysisIdError) {
          throw new Error(`Could not load the analysis: ${analysisIdError.message}`);
        }

        foundAnalysis = byAnalysisId as Analysis | null;

        if (!foundAnalysis) {
          const { data: byRfpId, error: rfpIdError } = await supabase
            .from("rfp_analyses")
            .select("*")
            .eq("rfp_id", id)
            .maybeSingle();

          console.log("ARCHBID RESULTS: analysis by rfp id:", byRfpId);
          console.log("ARCHBID RESULTS: rfp id error:", rfpIdError);

          if (rfpIdError) {
            throw new Error(`Could not find the saved analysis: ${rfpIdError.message}`);
          }

          foundAnalysis = byRfpId as Analysis | null;
        }

        if (!foundAnalysis) {
          throw new Error("No saved analysis was found for this RFP.");
        }

        const { data: foundRfp, error: rfpError } = await supabase
          .from("rfps")
          .select("file_name, user_id")
          .eq("id", foundAnalysis.rfp_id)
          .eq("user_id", user.id)
          .maybeSingle();

        console.log("ARCHBID RESULTS: rfp:", foundRfp);
        console.log("ARCHBID RESULTS: rfp error:", rfpError);

        if (rfpError) {
          throw new Error(`Could not load the RFP: ${rfpError.message}`);
        }

        if (!foundRfp) {
          throw new Error("This saved analysis does not belong to the signed-in account.");
        }

        if (!cancelled) {
          setAnalysis(foundAnalysis);
          setRfp(foundRfp as Rfp);
        }
      } catch (err) {
        console.error("ARCHBID RESULTS LOAD ERROR:", err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "We could not load this analysis.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadResults();

    return () => {
      cancelled = true;
    };
  }, [id, router]);

  if (loading) {
    return <main className="results-page"><div className="container results-container"><p>Loading your RFP intelligence report…</p></div></main>;
  }

  if (error || !analysis || !rfp) {
    return (
      <main className="results-page">
        <nav className="results-nav container">
          <Link className="brand" href="/">
            <span className="brand-mark">A</span> ArchBid <span className="brand-ai">AI</span>
          </Link>
          <Link className="nav-button" href="/dashboard">Dashboard</Link>
        </nav>
        <section className="container results-container">
          <div className="report-card full">
            <div className="section-label">RFP INTELLIGENCE REPORT</div>
            <h1>We couldn't load this analysis</h1>
            <p>{error || "The saved analysis could not be found."}</p>
            <p>Please return to your dashboard and try opening the saved analysis again.</p>
            <Link className="nav-button" href="/dashboard">Back to Dashboard →</Link>
          </div>
        </section>
      </main>
    );
  }

  const raw = analysis.raw_analysis && typeof analysis.raw_analysis === "object"
    ? (analysis.raw_analysis as Record<string, unknown>)
    : {};
  const score = Number(analysis.opportunity_score ?? 0);
  const recommendation = recommendationLabel(analysis.recommendation);
  const requirements = requirementList(analysis.requirements);
  const evaluation = stringList(analysis.evaluation_criteria);
  const submissions = stringList(analysis.submission_requirements);
  const risks = stringList(analysis.risks);
  const strengths = stringList(analysis.strengths);
  const missing = stringList(analysis.missing_items);
  const redFlags = stringList(raw.criticalRedFlags);
  const hardDisqualifiers = stringList(raw.hardDisqualifiers);
  const criticalDates = objectList(raw.criticalDates);
  const eligibility = stringList(raw.eligibility);
  const commercial = stringList(raw.commercial);
  const competition = stringList(raw.competition);
  const bidEffort = stringList(raw.bidEffort);
  const scoreBreakdown = objectList(raw.scoreBreakdown);

  return (
    <main className="results-page">
      <nav className="results-nav container">
        <Link className="brand" href="/">
          <span className="brand-mark">A</span> ArchBid <span className="brand-ai">AI</span>
        </Link>
        <div className="result-nav-links">
          <Link href="/dashboard">Analyze another RFP</Link>
          <Link className="nav-button" href="/dashboard">Dashboard</Link>
        </div>
      </nav>

      <section className="container results-container">
        <div className="section-label">RFP INTELLIGENCE REPORT</div>
        <div className="result-heading">
          <div>
            <h1>{analysis.project_name || "RFP Analysis"}</h1>
            <p>{rfp.file_name} · Preliminary opportunity assessment</p>
          </div>
          <div className={`score-card ${scoreClass(score)}`}>
            <span>OPPORTUNITY SCORE</span>
            <strong>{score}</strong>
            <small>/100</small>
          </div>
        </div>

        <div className={`recommendation ${scoreClass(score)}`}>
          <div>
            <span>RECOMMENDATION</span>
            <strong>{recommendation}</strong>
          </div>
          <p>{asString(raw.executiveSummary, "ArchBid reviewed the available RFP evidence and identified the main pursuit factors below.")}</p>
        </div>

        {redFlags.length > 0 && (
          <section className="alert-card red-flag-card">
            <div className="alert-heading"><span className="alert-icon">!</span><div><span>ATTENTION</span><h2>Critical red flags to review</h2></div></div>
            <ul>{redFlags.map((item, i) => <li key={i}>{item}</li>)}</ul>
          </section>
        )}

        {hardDisqualifiers.length > 0 && (
          <section className="alert-card disqualifier-card">
            <div className="alert-heading"><span className="alert-icon">×</span><div><span>GO / NO-GO CHECK</span><h2>Potential hard disqualifiers</h2></div></div>
            <ul>{hardDisqualifiers.map((item, i) => <li key={i}>{item}</li>)}</ul>
          </section>
        )}

        <div className="facts-grid">
          <div><span>CLIENT</span><strong>{analysis.client_name || "Not stated"}</strong></div>
          <div><span>LOCATION</span><strong>{analysis.location || "Not stated"}</strong></div>
          <div><span>PROJECT TYPE</span><strong>{analysis.project_type || "Not stated"}</strong></div>
          <div><span>DEADLINE</span><strong>{analysis.deadline ? formatDate(analysis.deadline) : "Not stated"}</strong></div>
          <div><span>ESTIMATED BUDGET</span><strong>{asString(raw.estimatedBudget, "Not stated")}</strong></div>
          <div><span>CONFIDENCE</span><strong>{asString(raw.confidence, "MEDIUM")}</strong></div>
        </div>

        {criticalDates.length > 0 && (
          <section className="report-card full timeline-card">
            <div className="section-heading-row"><div><span className="mini-label">TIMELINE</span><h2>Critical dates</h2></div><span className="section-note">Dates found in the RFP</span></div>
            <div className="timeline-list">
              {criticalDates.map((item, i) => {
                const importance = asString(item.importance, "INFO");
                return (
                  <div className="timeline-item" key={i}>
                    <div className="timeline-date">{formatDate(item.date)}</div>
                    <div className="timeline-event"><strong>{asString(item.event, "RFP milestone")}</strong></div>
                    <span className={`importance ${importance.toLowerCase()}`}>{importance}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <div className="report-grid">
          <section className="report-card">
            <h2>Why this could be a good opportunity</h2>
            {strengths.length ? <ul>{strengths.map((item, i) => <li key={i}>{item}</li>)}</ul> : <p>No specific strengths were identified in the document.</p>}
          </section>
          <section className="report-card risk-card">
            <h2>Risks to review</h2>
            {risks.length ? <ul>{risks.map((item, i) => <li key={i}>{item}</li>)}</ul> : <p>No major risks were identified from the available information.</p>}
          </section>
        </div>

        {scoreBreakdown.length > 0 && (
          <section className="report-card full">
            <div className="section-heading-row"><div><span className="mini-label">DECISION SUPPORT</span><h2>Why this score?</h2></div><span className="section-note">Preliminary RFP-based scoring</span></div>
            <div className="score-breakdown">
              {scoreBreakdown.map((item, i) => {
                const factorScore = Math.max(0, Math.min(100, Number(item.score ?? 0)));
                return (
                  <div className="score-factor" key={i}>
                    <div className="score-factor-top"><strong>{asString(item.factor, "Factor")}</strong><span>{factorScore}/100 · {asString(item.weight, "0")}% weight</span></div>
                    <div className="score-bar"><span style={{ width: `${factorScore}%` }} /></div>
                    <p>{asString(item.reason, "No explanation provided.")}</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <div className="report-grid">
          <section className="report-card">
            <h2>Eligibility & firm requirements</h2>
            {eligibility.length ? <ul>{eligibility.map((item, i) => <li key={i}>{item}</li>)}</ul> : <p>No additional eligibility conditions were clearly extracted.</p>}
          </section>
          <section className="report-card">
            <h2>Commercial intelligence</h2>
            {commercial.length ? <ul>{commercial.map((item, i) => <li key={i}>{item}</li>)}</ul> : <p>No commercial details were clearly stated.</p>}
          </section>
        </div>

        <div className="report-grid">
          <section className="report-card">
            <h2>Competition & win factors</h2>
            {competition.length ? <ul>{competition.map((item, i) => <li key={i}>{item}</li>)}</ul> : <p>No specific competitive factors were extracted.</p>}
          </section>
          <section className="report-card">
            <h2>Bid effort</h2>
            {bidEffort.length ? <ul>{bidEffort.map((item, i) => <li key={i}>{item}</li>)}</ul> : <p>No unusual submission effort was identified.</p>}
          </section>
        </div>

        <section className="report-card full">
          <h2>Key requirements</h2>
          <div className="requirement-list">
            {requirements.length ? requirements.map((item, i) => (
              <div className="requirement" key={i}>
                <div>
                  <strong>{asString(item.item, "Requirement")}</strong>
                  <p>{asString(item.details)}</p>
                </div>
                <span className={item.mandatory ? "mandatory" : "preferred"}>
                  {item.mandatory ? "MANDATORY" : "PREFERRED"}
                </span>
              </div>
            )) : <p>No structured requirements were extracted.</p>}
          </div>
        </section>

        <div className="report-grid">
          <section className="report-card">
            <h2>Evaluation criteria</h2>
            {evaluation.length ? <ul>{evaluation.map((item, i) => <li key={i}>{item}</li>)}</ul> : <p>Not clearly stated.</p>}
          </section>
          <section className="report-card">
            <h2>Submission checklist</h2>
            {submissions.length ? <ul className="checklist">{submissions.map((item, i) => <li key={i}><span>□</span>{item}</li>)}</ul> : <p>Not clearly stated.</p>}
          </section>
        </div>

        <div className="report-grid">
          <section className="report-card">
            <h2>Potentially missing items</h2>
            {missing.length ? <ul>{missing.map((item, i) => <li key={i}>{item}</li>)}</ul> : <p>Nothing obvious was missing from the extracted information.</p>}
          </section>
          <section className="report-card">
            <h2>Next step</h2>
            <p>Review the mandatory requirements, confirm your firm's eligibility and licensing, then compare the opportunity against your portfolio and available team capacity before committing to a response.</p>
          </section>
        </div>

        <div className="report-footer">
          <span>ArchBid AI provides decision support, not legal or procurement advice.</span>
          <Link href="/dashboard">Analyze another RFP →</Link>
        </div>
      </section>
    </main>
  );
}

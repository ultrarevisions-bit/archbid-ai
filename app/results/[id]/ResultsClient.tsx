"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import "./results.css";

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

type Rfp = { file_name: string; user_id: string };
type RecordValue = Record<string, unknown>;

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
  try { return JSON.stringify(value); } catch { return fallback; }
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object") {
      const obj = item as RecordValue;
      return asString(obj.item ?? obj.name ?? obj.title ?? obj.details ?? obj.value ?? obj.reason, "");
    }
    return asString(item, "");
  }).filter(Boolean);
}

function objectList(value: unknown): RecordValue[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is RecordValue => Boolean(item && typeof item === "object"));
}

function formatDate(value: unknown) {
  const text = asString(value, "Not stated");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(`${text}T00:00:00`);
  return Number.isNaN(date.getTime()) ? text : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function requirementList(value: unknown): RecordValue[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => item && typeof item === "object" ? item as RecordValue : { item: asString(item, "Requirement"), mandatory: false, details: "" });
}

function AccordionSection({ title, eyebrow, count, children, defaultOpen = false }: { title: string; eyebrow?: string; count?: number; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="accordion" open={defaultOpen}>
      <summary>
        <span className="accordion-title-wrap">
          {eyebrow && <span className="mini-label">{eyebrow}</span>}
          <span className="accordion-title">{title}</span>
          {typeof count === "number" && <span className="count-pill">{count}</span>}
        </span>
        <span className="accordion-chevron">⌄</span>
      </summary>
      <div className="accordion-body">{children}</div>
    </details>
  );
}

function BulletList({ items, empty = "No specific information was extracted." }: { items: string[]; empty?: string }) {
  if (!items.length) return <p className="muted">{empty}</p>;
  return <ul className="clean-list">{items.map((item, i) => <li key={`${item}-${i}`}>{item}</li>)}</ul>;
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
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw new Error(`Authentication error: ${authError.message}`);
        if (!user) {
          router.replace("/login");
          return;
        }

        let foundAnalysis: Analysis | null = null;
        const { data: byAnalysisId, error: analysisIdError } = await supabase
          .from("rfp_analyses")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        if (analysisIdError) throw new Error(`Could not load the analysis: ${analysisIdError.message}`);
        foundAnalysis = byAnalysisId as Analysis | null;

        if (!foundAnalysis) {
          const { data: byRfpId, error: rfpIdError } = await supabase
            .from("rfp_analyses")
            .select("*")
            .eq("rfp_id", id)
            .maybeSingle();
          if (rfpIdError) throw new Error(`Could not find the saved analysis: ${rfpIdError.message}`);
          foundAnalysis = byRfpId as Analysis | null;
        }
        if (!foundAnalysis) throw new Error("No saved analysis was found for this RFP.");

        const { data: foundRfp, error: rfpError } = await supabase
          .from("rfps")
          .select("file_name, user_id")
          .eq("id", foundAnalysis.rfp_id)
          .eq("user_id", user.id)
          .maybeSingle();
        if (rfpError) throw new Error(`Could not load the RFP: ${rfpError.message}`);
        if (!foundRfp) throw new Error("This saved analysis does not belong to the signed-in account.");

        if (!cancelled) {
          setAnalysis(foundAnalysis);
          setRfp(foundRfp as Rfp);
        }
      } catch (err) {
        console.error("ARCHBID RESULTS LOAD ERROR:", err);
        if (!cancelled) setError(err instanceof Error ? err.message : "We could not load this analysis.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadResults();
    return () => { cancelled = true; };
  }, [id, router]);

  if (loading) {
    return <main className="results-page"><div className="container results-container"><div className="loading-card">Loading your RFP intelligence report…</div></div></main>;
  }

  if (error || !analysis || !rfp) {
    return (
      <main className="results-page">
        <nav className="results-nav container">
          <Link className="brand" href="/"><span className="brand-mark">A</span> ArchBid <span className="brand-ai">AI</span></Link>
          <Link className="nav-button" href="/dashboard">Dashboard</Link>
        </nav>
        <section className="container results-container">
          <div className="report-card full error-card">
            <div className="section-label">RFP INTELLIGENCE REPORT</div>
            <h1>We couldn't load this analysis</h1>
            <p>{error || "The saved analysis could not be found."}</p>
            <Link className="nav-button" href="/dashboard">Back to Dashboard →</Link>
          </div>
        </section>
      </main>
    );
  }

  const raw = analysis.raw_analysis && typeof analysis.raw_analysis === "object"
    ? analysis.raw_analysis as RecordValue
    : {};
  const score = Number(analysis.opportunity_score ?? 0);
  const recommendation = recommendationLabel(analysis.recommendation);
  const recommendationClass = scoreClass(score);
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

  // Do not use a React hook here. This component intentionally returns early
  // while loading, so derived values must remain ordinary calculations to
  // avoid changing the number/order of hooks between renders.
  const topReasons = (recommendation === "PURSUE"
    ? strengths
    : [...redFlags, ...risks, ...hardDisqualifiers]
  ).filter(Boolean).slice(0, 4);

  const nextAction = recommendation === "PURSUE"
    ? "Review the requirements and prepare your submission plan."
    : recommendation === "DO NOT PURSUE"
      ? "Confirm the critical issues before spending bid resources on this opportunity."
      : "Review the risks and eligibility requirements before making a go / no-go decision.";

  return (
    <main className="results-page">
      <nav className="results-nav container">
        <Link className="brand" href="/"><span className="brand-mark">A</span> ArchBid <span className="brand-ai">AI</span></Link>
        <div className="result-nav-links"><Link href="/dashboard">Analyze another RFP</Link><Link className="nav-button" href="/dashboard">Dashboard</Link></div>
      </nav>

      <section className="container results-container">
        <div className="section-label">RFP INTELLIGENCE REPORT</div>
        <div className="hero-heading">
          <div className="hero-copy"><p className="eyebrow">DECISION BRIEF</p><h1>{analysis.project_name || "RFP Analysis"}</h1><p className="file-meta">{rfp.file_name} · Preliminary opportunity assessment</p></div>
          <div className={`score-card ${recommendationClass}`}><span>OPPORTUNITY SCORE</span><strong>{score}</strong><small>/100</small></div>
        </div>

        <section className={`decision-card ${recommendationClass}`}>
          <div className="decision-main"><span className="decision-label">RECOMMENDATION</span><strong>{recommendation}</strong><p>{asString(raw.executiveSummary, "ArchBid reviewed the RFP and identified the main factors affecting the pursuit decision.")}</p></div>
          <div className="decision-action"><span>NEXT STEP</span><strong>{nextAction}</strong></div>
        </section>

        <section className="attention-grid">
          {topReasons.length > 0 && <div className="quick-card"><div className="quick-card-heading"><span className="quick-icon">!</span><div><span className="mini-label">WHY THIS DECISION</span><h2>Top factors</h2></div></div><BulletList items={topReasons} /></div>}
          {redFlags.length > 0 && <div className="quick-card warning"><div className="quick-card-heading"><span className="quick-icon">⚠</span><div><span className="mini-label">ATTENTION</span><h2>Critical issues</h2></div></div><BulletList items={redFlags.slice(0, 4)} />{redFlags.length > 4 && <p className="more-note">+ {redFlags.length - 4} more in the detailed report</p>}</div>}
        </section>

        <section className="snapshot-card">
          <div className="snapshot-heading"><div><span className="mini-label">AT A GLANCE</span><h2>Project snapshot</h2></div></div>
          <div className="facts-grid compact">
            <div><span>CLIENT</span><strong>{analysis.client_name || "Not stated"}</strong></div>
            <div><span>LOCATION</span><strong>{analysis.location || "Not stated"}</strong></div>
            <div><span>PROJECT TYPE</span><strong>{analysis.project_type || "Not stated"}</strong></div>
            <div><span>DEADLINE</span><strong>{analysis.deadline ? formatDate(analysis.deadline) : "Not stated"}</strong></div>
            <div><span>ESTIMATED BUDGET</span><strong>{asString(raw.estimatedBudget, "Not stated")}</strong></div>
            <div><span>CONFIDENCE</span><strong>{asString(raw.confidence, "MEDIUM")}</strong></div>
          </div>
        </section>

        {criticalDates.length > 0 && <AccordionSection title="Critical dates" eyebrow="TIMELINE" count={criticalDates.length} defaultOpen><div className="timeline-list">{criticalDates.map((item, i) => { const importance = asString(item.importance, "INFO"); return <div className="timeline-item" key={i}><div className="timeline-date">{formatDate(item.date)}</div><div className="timeline-event"><strong>{asString(item.event, "RFP milestone")}</strong></div><span className={`importance ${importance.toLowerCase()}`}>{importance}</span></div>; })}</div></AccordionSection>}
        {hardDisqualifiers.length > 0 && <AccordionSection title="Potential hard disqualifiers" eyebrow="GO / NO-GO CHECK" count={hardDisqualifiers.length}><BulletList items={hardDisqualifiers} /></AccordionSection>}

        <div className="detail-intro"><div><span className="mini-label">FULL INTELLIGENCE</span><h2>Explore the analysis</h2></div><p>The decision is summarized above. Open any section below when you need the supporting detail.</p></div>
        <div className="accordion-stack">
          <AccordionSection title="Why this could be a good opportunity" count={strengths.length}><BulletList items={strengths} empty="No specific strengths were identified in the document." /></AccordionSection>
          <AccordionSection title="Risks to review" count={risks.length}><BulletList items={risks} empty="No major risks were identified from the available information." /></AccordionSection>
          {scoreBreakdown.length > 0 && <AccordionSection title="Why this score?" eyebrow="DECISION SUPPORT" count={scoreBreakdown.length}><div className="score-breakdown">{scoreBreakdown.map((item, i) => { const numericScore = Number(item.score ?? 0); const factorScore = Number.isFinite(numericScore) ? Math.max(0, Math.min(100, numericScore)) : 0; return <div className="score-factor" key={i}><div className="score-factor-top"><strong>{asString(item.factor, "Factor")}</strong><span>{factorScore}/100 · {asString(item.weight, "0")}% weight</span></div><div className="score-bar"><span style={{ width: `${factorScore}%` }} /></div><p>{asString(item.reason, "No explanation provided.")}</p></div>; })}</div></AccordionSection>}
          <AccordionSection title="Eligibility & firm requirements" count={eligibility.length || requirements.length}>
            {eligibility.length > 0 && <BulletList items={eligibility} />}
            {requirements.length > 0 && <div className="requirement-list">{requirements.map((item, i) => { const mandatory = item.mandatory === true || item.mandatory === "true"; return <div className="requirement" key={i}><div><strong>{asString(item.item ?? item.name ?? item.title, "Requirement")}</strong>{asString(item.details) && <p>{asString(item.details)}</p>}</div><span className={mandatory ? "mandatory" : "preferred"}>{mandatory ? "MANDATORY" : "REVIEW"}</span></div>; })}</div>}
            {!eligibility.length && !requirements.length && <p className="muted">No additional eligibility conditions were clearly extracted.</p>}
          </AccordionSection>
          <AccordionSection title="Submission requirements" count={submissions.length}><BulletList items={submissions} empty="No specific submission requirements were extracted." /></AccordionSection>
          <AccordionSection title="Evaluation criteria" count={evaluation.length}><BulletList items={evaluation} empty="No evaluation criteria were clearly extracted." /></AccordionSection>
          <AccordionSection title="Commercial intelligence" count={commercial.length}><BulletList items={commercial} empty="No commercial details were clearly stated." /></AccordionSection>
          <AccordionSection title="Competition & win factors" count={competition.length}><BulletList items={competition} empty="No specific competitive factors were extracted." /></AccordionSection>
          <AccordionSection title="Bid effort" count={bidEffort.length}><BulletList items={bidEffort} empty="No unusual submission effort was identified." /></AccordionSection>
          <AccordionSection title="Critical red flags" count={redFlags.length}><BulletList items={redFlags} empty="No critical red flags were identified." /></AccordionSection>
          <AccordionSection title="Missing information / items to confirm" count={missing.length}><BulletList items={missing} empty="No missing items were identified." /></AccordionSection>
        </div>

        <div className="report-footer"><span>This report is an AI-assisted preliminary assessment. Verify important dates, eligibility, and submission requirements against the official RFP.</span><Link href="/dashboard">← Back to Dashboard</Link></div>
      </section>
    </main>
  );
}

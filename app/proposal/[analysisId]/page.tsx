"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import "./proposal.css";

type Proposal = {
  id?: string;
  title: string;
  coverLetter: string;
  executiveSummary: string;
  projectUnderstanding: string;
  approach: string[];
  scopeAndDeliverables: string[];
  schedule: string[];
  teamAndExperience: string[];
  compliance: string[];
  assumptions: string[];
  closing: string;
  placeholders: string[];
};

function Paragraphs({ text }: { text: string }) {
  return <>{text.split(/\n\s*\n/).filter(Boolean).map((part, i) => <p key={i}>{part}</p>)}</>;
}

function BulletSection({ title, items }: { title: string; items: string[] }) {
  return <section className="proposal-section"><h2>{title}</h2><ul>{items.map((item, i) => <li key={i}>{item}</li>)}</ul></section>;
}

export default function ProposalPage() {
  const params = useParams<{ analysisId: string }>();
  const analysisId = params?.analysisId;
  const [loading, setLoading] = useState(true);
  const [paid, setPaid] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!analysisId) return;
    let cancelled = false;

    async function load() {
      const supabase = createClient();
      try {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          window.location.href = "/login";
          return;
        }

        const checkoutReturned = new URLSearchParams(window.location.search).get("checkout") === "success";
        if (checkoutReturned) setMessage("Payment received. Confirming your proposal access…");

        const { data: purchase } = await supabase
          .from("proposal_purchases")
          .select("id")
          .eq("analysis_id", analysisId)
          .eq("user_id", user.id)
          .eq("status", "paid")
          .maybeSingle();

        if (purchase) {
          setPaid(true);
          window.history.replaceState({}, "", `/proposal/${analysisId}`);
        } else if (checkoutReturned) {
          for (let attempt = 0; attempt < 10 && !cancelled; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 1500));
            const { data: confirmed } = await supabase
              .from("proposal_purchases")
              .select("id")
              .eq("analysis_id", analysisId)
              .eq("user_id", user.id)
              .eq("status", "paid")
              .maybeSingle();
            if (confirmed) {
              setPaid(true);
              window.history.replaceState({}, "", `/proposal/${analysisId}`);
              setMessage("Payment confirmed. Your proposal is ready to generate.");
              break;
            }
          }
        }

        const { data: savedProposal } = await supabase
          .from("proposals")
          .select("id, status, content")
          .eq("analysis_id", analysisId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (savedProposal?.status === "ready" && savedProposal.content) {
          setProposal({ id: savedProposal.id, ...(savedProposal.content as Proposal) });
        }

        if (!cancelled && checkoutReturned && !paid && !purchase) {
          const { data: finalCheck } = await supabase
            .from("proposal_purchases")
            .select("id")
            .eq("analysis_id", analysisId)
            .eq("user_id", user.id)
            .eq("status", "paid")
            .maybeSingle();
          if (finalCheck) {
            setPaid(true);
            setMessage("Payment confirmed. Your proposal is ready to generate.");
          } else {
            setMessage("Your payment was received, but access is still being confirmed. Please refresh in a few seconds.");
          }
        }
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "We could not load the proposal workspace.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [analysisId]);

  async function buyProposal() {
    setBusy(true);
    setMessage("");

    // Open the new tab immediately from the user's click so browser popup
    // blockers are less likely to prevent the Lemon Squeezy checkout.
    const checkoutTab = window.open("about:blank", "_blank");

    try {
      const response = await fetch("/api/proposal/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.url) throw new Error(result.error || "Checkout could not be started.");

      if (checkoutTab && !checkoutTab.closed) {
        checkoutTab.location.href = result.url;
      } else {
        // Fallback if the browser blocked the new tab.
        window.location.href = result.url;
      }
    } catch (error) {
      if (checkoutTab && !checkoutTab.closed) checkoutTab.close();
      setMessage(error instanceof Error ? error.message : "Checkout could not be started.");
      setBusy(false);
    }
  }

  async function generateProposal() {
    setBusy(true);
    setMessage("ArchBid is writing your proposal…");
    try {
      const response = await fetch("/api/proposal/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Proposal generation failed.");
      setProposal(result.proposal);
      setMessage("Proposal draft generated. Review the highlighted placeholders before submitting.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Proposal generation failed.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <main className="proposal-page"><div className="proposal-container"><div className="proposal-loading">Loading proposal workspace…</div></div></main>;
  }

  return (
    <main className="proposal-page">
      <nav className="proposal-nav">
        <Link className="brand" href="/"><span className="brand-mark">A</span> ArchBid <span className="brand-ai">AI</span></Link>
        <div><Link href={`/results/${analysisId}`}>Back to RFP report</Link><Link className="dark-button" href="/dashboard">Dashboard</Link></div>
      </nav>

      <section className="proposal-container">
        {!proposal && !paid && (
          <section className="upgrade-card">
            <span className="mini-label">PAID PROPOSAL ADD-ON</span>
            <h1>Turn this RFP analysis into a client-ready proposal draft.</h1>
            <p>ArchBid will use the RFP intelligence, evaluation criteria, requirements and your firm profile to create a tailored first draft. It will never invent credentials or project experience.</p>
            <div className="upgrade-grid">
              <div><strong>$19</strong><span>one-time per proposal</span></div>
              <ul><li>Project-specific cover letter</li><li>Tailored approach and scope</li><li>Evaluation-criteria alignment</li><li>Compliance and submission checklist</li><li>Placeholders for missing firm details</li></ul>
            </div>
            <button className="primary-button" onClick={buyProposal} disabled={busy}>{busy ? "Opening secure checkout…" : "Get my proposal draft — $19 →"}</button>
            <small>Secure payment is handled by Lemon Squeezy. Your RFP report remains available even if you decide not to purchase.</small>
          </section>
        )}

        {paid && !proposal && (
          <section className="generate-card">
            <span className="mini-label">PROPOSAL UNLOCKED</span>
            <h1>Your proposal workspace is ready.</h1>
            <p>Generate a tailored first draft from this RFP. The draft will clearly mark information your firm still needs to supply.</p>
            <button className="primary-button" onClick={generateProposal} disabled={busy}>{busy ? "Writing proposal…" : "Generate proposal →"}</button>
          </section>
        )}

        {message && <div className="proposal-message">{message}</div>}

        {proposal && (
          <article className="proposal-document">
            <div className="proposal-document-head"><div><span className="mini-label">ARCHBID AI · PROPOSAL DRAFT</span><h1>{proposal.title}</h1><p>AI-assisted draft — review and complete all highlighted placeholders before submission.</p></div><button className="print-button" onClick={() => window.print()}>Print / Save PDF</button></div>
            {proposal.placeholders?.length > 0 && <section className="placeholder-box"><strong>Before submitting</strong><ul>{proposal.placeholders.map((item, i) => <li key={i}>{item}</li>)}</ul></section>}
            <section className="proposal-section"><h2>Cover Letter</h2><Paragraphs text={proposal.coverLetter} /></section>
            <section className="proposal-section"><h2>Executive Summary</h2><Paragraphs text={proposal.executiveSummary} /></section>
            <section className="proposal-section"><h2>Project Understanding</h2><Paragraphs text={proposal.projectUnderstanding} /></section>
            <BulletSection title="Our Approach" items={proposal.approach} />
            <BulletSection title="Scope & Deliverables" items={proposal.scopeAndDeliverables} />
            <BulletSection title="Schedule & Milestones" items={proposal.schedule} />
            <BulletSection title="Team & Relevant Experience" items={proposal.teamAndExperience} />
            <BulletSection title="Compliance with the RFP" items={proposal.compliance} />
            <BulletSection title="Assumptions & Items to Confirm" items={proposal.assumptions} />
            <section className="proposal-section"><h2>Closing</h2><Paragraphs text={proposal.closing} /></section>
            <div className="proposal-disclaimer">This proposal draft is AI-assisted. Verify every project fact, credential, date, commitment, scope statement and submission requirement against the official RFP and your firm's approved information before submitting.</div>
          </article>
        )}
      </section>
    </main>
  );
}

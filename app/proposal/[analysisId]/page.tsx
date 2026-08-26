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

const stringFields = [
  { key: "coverLetter", label: "Cover Letter" },
  { key: "executiveSummary", label: "Executive Summary" },
  { key: "projectUnderstanding", label: "Project Understanding" },
  { key: "closing", label: "Closing" },
] as const;

const bulletFields = [
  { key: "approach", label: "Our Approach" },
  { key: "scopeAndDeliverables", label: "Scope & Deliverables" },
  { key: "schedule", label: "Schedule & Milestones" },
  { key: "teamAndExperience", label: "Team & Relevant Experience" },
  { key: "compliance", label: "Compliance with the RFP" },
  { key: "assumptions", label: "Assumptions & Items to Confirm" },
  { key: "placeholders", label: "Firm Information — To Be Completed" },
] as const;

function Paragraphs({ text }: { text: string }) {
  return <>{String(text || "").split(/\n\s*\n/).filter(Boolean).map((part, i) => <p key={i}>{part}</p>)}</>;
}

function BulletSection({ title, items }: { title: string; items: string[] }) {
  return <section className="proposal-section"><h2>{title}</h2><ul>{(items || []).map((item, i) => <li key={i}>{item}</li>)}</ul></section>;
}

function hasUsefulFirmProfile(profile: unknown, firm?: { name?: string | null; services?: unknown } | null) {
  if (profile && typeof profile === "object") {
    const p = profile as Record<string, unknown>;
    const important = ["legalName", "authorizedRepresentative", "registrationsLicenses", "yearsExperience", "availabilityCapacity", "municipalExperience", "services", "projectExperience", "teamMembers", "certifications", "differentiators"];
    const count = important.filter(key => typeof p[key] === "string" && String(p[key]).trim().length > 0).length;
    if (count >= 3) return true;
  }
  return Boolean(firm?.name && firm.name !== "My Architecture Firm" && Array.isArray(firm.services) && firm.services.length > 0);
}

export default function ProposalPage() {
  const params = useParams<{ analysisId: string }>();
  const analysisId = params?.analysisId;
  const [loading, setLoading] = useState(true);
  const [paid, setPaid] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [draft, setDraft] = useState<Proposal | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [profileComplete, setProfileComplete] = useState(false);

  useEffect(() => {
    if (!analysisId) return;
    let cancelled = false;

    async function load() {
      const supabase = createClient();
      try {
        setLoading(true);
        const { data: auth } = await supabase.auth.getUser();
        const user = auth.user;
        if (!user) {
          window.location.href = "/login";
          return;
        }

        const checkoutReturned = new URLSearchParams(window.location.search).get("checkout") === "success";
        if (checkoutReturned) setMessage("Payment received. Confirming your proposal access…");

        const { data: firm } = await supabase.from("firms").select("profile, name, services, website").eq("owner_id", user.id).maybeSingle();
        const complete = hasUsefulFirmProfile(firm?.profile, firm);
        if (!cancelled) setProfileComplete(complete);

        let isPaid = false;
        const { data: purchase } = await supabase.from("proposal_purchases").select("id").eq("analysis_id", analysisId).eq("user_id", user.id).eq("status", "paid").maybeSingle();
        if (purchase) {
          isPaid = true;
          if (!cancelled) setPaid(true);
          window.history.replaceState({}, "", `/proposal/${analysisId}`);
        }

        if (!isPaid && checkoutReturned && !cancelled) {
          for (let attempt = 0; attempt < 12 && !cancelled; attempt++) {
            const response = await fetch("/api/proposal/confirm", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ analysisId }),
              cache: "no-store",
            });
            const result = await response.json().catch(() => ({}));
            if (result.paid) {
              isPaid = true;
              setPaid(true);
              setMessage("Payment confirmed. Your proposal is ready to generate.");
              window.history.replaceState({}, "", `/proposal/${analysisId}`);
              break;
            }
            if (attempt < 11) await new Promise(resolve => setTimeout(resolve, 1500));
          }
        }

        const { data: savedProposal } = await supabase.from("proposals").select("id, status, content").eq("analysis_id", analysisId).eq("user_id", user.id).maybeSingle();
        if (savedProposal?.status === "ready" && savedProposal.content) {
          const loaded = { id: savedProposal.id, ...(savedProposal.content as Proposal) };
          if (!cancelled) {
            setProposal(loaded);
            setDraft(loaded);
          }
        }

        if (!cancelled && checkoutReturned && !isPaid) {
          setMessage("Payment was received, but ArchBid has not confirmed access yet. Please wait a moment and try again.");
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
    if (!profileComplete || !analysisId) return;
    setBusy(true);
    setMessage("");
    const checkoutTab = window.open("about:blank", "_blank");
    try {
      const response = await fetch("/api/proposal/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.url) throw new Error(result.error || "Checkout could not be started.");
      if (checkoutTab && !checkoutTab.closed) checkoutTab.location.href = result.url;
      else window.location.href = result.url;
    } catch (error) {
      if (checkoutTab && !checkoutTab.closed) checkoutTab.close();
      setMessage(error instanceof Error ? error.message : "Checkout could not be started.");
      setBusy(false);
    }
  }

  async function generateProposal() {
    if (!analysisId) return;
    setBusy(true);
    setMessage("ArchBid is writing your proposal…");
    try {
      const response = await fetch("/api/proposal/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Proposal generation failed.");
      setProposal(result.proposal);
      setDraft(result.proposal);
      setMessage("Proposal draft generated. Review the firm information and missing items before submission.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Proposal generation failed.");
    } finally {
      setBusy(false);
    }
  }

  function startEditing() {
    if (!proposal) return;
    setDraft({
      ...proposal,
      approach: [...(proposal.approach || [])],
      scopeAndDeliverables: [...(proposal.scopeAndDeliverables || [])],
      schedule: [...(proposal.schedule || [])],
      teamAndExperience: [...(proposal.teamAndExperience || [])],
      compliance: [...(proposal.compliance || [])],
      assumptions: [...(proposal.assumptions || [])],
      placeholders: [...(proposal.placeholders || [])],
    });
    setEditing(true);
    setMessage("");
  }

  async function saveEdits() {
    if (!draft || !analysisId) return;
    setBusy(true);
    setMessage("");
    try {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        window.location.href = "/login";
        return;
      }
      const { data: saved, error } = await supabase.from("proposals").update({ content: draft, updated_at: new Date().toISOString() }).eq("analysis_id", analysisId).eq("user_id", auth.user.id).select("id").single();
      if (error || !saved) throw error || new Error("We could not save the proposal.");
      const next = { ...draft, id: saved.id };
      setProposal(next);
      setDraft(next);
      setEditing(false);
      setMessage("Your proposal edits have been saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We could not save your edits.");
    } finally {
      setBusy(false);
    }
  }

  function updateText(key: keyof Proposal, value: string) {
    setDraft(current => current ? { ...current, [key]: value } : current);
  }

  function updateBullets(key: keyof Proposal, value: string) {
    const items = value.split("\n").map(item => item.trim()).filter(Boolean);
    setDraft(current => current ? { ...current, [key]: items } : current);
  }

  if (loading) {
    return (
      <main className="proposal-page">
        <div className="proposal-container">
          <div className="proposal-loading">Loading proposal workspace…</div>
        </div>
      </main>
    );
  }

  return (
    <main className="proposal-page">
      <nav className="proposal-nav">
        <Link className="brand" href="/"><span className="brand-mark">A</span> ArchBid <span className="brand-ai">AI</span></Link>
        <div>
          <Link href={`/results/${analysisId}`}>Back to RFP report</Link>
          <Link href="/firm-profile">Firm Profile</Link>
          <Link className="dark-button" href="/dashboard">Dashboard</Link>
        </div>
      </nav>

      <section className="proposal-container">
        {!proposal && !paid && !profileComplete && (
          <section className="generate-card">
            <span className="mini-label">BEFORE YOU GENERATE</span>
            <h1>Complete your Firm Profile for a stronger proposal</h1>
            <p>Add your firm&apos;s experience, services, registrations, past projects and other details. ArchBid will use this verified information when creating this proposal and reuse it in future proposals.</p>
            <div className="placeholder-box" style={{ margin: "24px 0", textAlign: "left" }}>
              <strong>Why complete it now?</strong>
              <ul>
                <li>Your proposal can include your firm&apos;s actual experience and capabilities.</li>
                <li>ArchBid will avoid inventing credentials or project history.</li>
                <li>You only need to complete the profile once.</li>
              </ul>
            </div>
            <Link className="primary-button" href={`/firm-profile?returnTo=/proposal/${analysisId}`}>Complete Firm Profile →</Link>
            <small>After saving your profile, you&apos;ll return here to purchase and generate your proposal.</small>
          </section>
        )}

        {!proposal && !paid && profileComplete && (
          <section className="upgrade-card">
            <span className="mini-label">PAID PROPOSAL ADD-ON</span>
            <h1>Turn this RFP analysis into a client-ready proposal draft.</h1>
            <p>ArchBid will use the RFP intelligence, evaluation criteria, requirements and your reusable Firm Profile to create a tailored first draft. It will never invent credentials or project experience.</p>
            <div className="upgrade-grid">
              <div><strong>$19</strong><span>one-time per proposal</span></div>
              <ul>
                <li>Project-specific cover letter</li>
                <li>Tailored approach and scope</li>
                <li>Evaluation-criteria alignment</li>
                <li>Compliance and submission checklist</li>
                <li>Firm-specific information clearly incorporated</li>
              </ul>
            </div>
            <button className="primary-button" onClick={buyProposal} disabled={busy}>{busy ? "Opening secure checkout…" : "Get my proposal draft — $19 →"}</button>
            <small>Secure payment is handled by Lemon Squeezy. Your RFP report remains available even if you decide not to purchase.</small>
          </section>
        )}

        {paid && !proposal && (
          <section className="generate-card">
            <span className="mini-label">PROPOSAL UNLOCKED</span>
            <h1>Your proposal workspace is ready.</h1>
            <p>Your Firm Profile is already available to ArchBid. Generate your tailored first draft using both your firm information and this RFP.</p>
            <button className="primary-button" onClick={generateProposal} disabled={busy}>{busy ? "Writing proposal…" : "Generate proposal →"}</button>
          </section>
        )}

        {message && <div className="proposal-message">{message}</div>}

        {proposal && !editing && (
          <article className="proposal-document">
            <div className="proposal-document-head">
              <div>
                <span className="mini-label">ARCHBID AI · PROPOSAL DRAFT</span>
                <h1>{proposal.title}</h1>
                <p>AI-assisted draft — review and complete all missing information before submission.</p>
              </div>
              <div className="proposal-actions">
                <button className="print-button primary-action" onClick={startEditing}>Edit Proposal</button>
                <button className="print-button" onClick={() => { window.location.href = `/api/proposal/docx?analysisId=${analysisId}`; }}>Download DOCX</button>
                <button className="print-button" onClick={() => window.print()}>Print / Save PDF</button>
              </div>
            </div>

            {proposal.placeholders?.length > 0 && (
              <section className="placeholder-box">
                <strong>Firm Information — To Be Completed</strong>
                <p>Please provide the following firm-specific information before submission:</p>
                <ul>{proposal.placeholders.map((item, i) => <li key={i}>{item}</li>)}</ul>
              </section>
            )}

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
            <div className="proposal-disclaimer">This proposal draft is AI-assisted. Verify every project fact, credential, date, commitment, scope statement and submission requirement against the official RFP and your firm&apos;s approved information before submitting.</div>
          </article>
        )}

        {draft && editing && (
          <article className="proposal-document proposal-editor">
            <div className="proposal-document-head">
              <div><span className="mini-label">EDIT PROPOSAL</span><h1>Edit your proposal</h1><p>Make final changes directly here. Saved edits replace the current proposal draft.</p></div>
              <div className="proposal-actions"><button className="print-button" onClick={() => { setEditing(false); setDraft(proposal); }}>Cancel</button><button className="print-button primary-action" onClick={saveEdits} disabled={busy}>{busy ? "Saving…" : "Save Changes"}</button></div>
            </div>

            <label className="editor-field"><span>Proposal title</span><input value={draft.title} onChange={e => updateText("title", e.target.value)} /></label>
            {stringFields.map(field => (
              <label className="editor-field" key={field.key}><span>{field.label}</span><textarea value={draft[field.key]} onChange={e => updateText(field.key, e.target.value)} /></label>
            ))}
            {bulletFields.map(field => (
              <label className="editor-field" key={field.key}><span>{field.label}</span><small>One item per line</small><textarea value={(draft[field.key] || []).join("\n")} onChange={e => updateBullets(field.key, e.target.value)} /></label>
            ))}
            <div className="editor-bottom"><button className="print-button" onClick={() => { setEditing(false); setDraft(proposal); }}>Cancel</button><button className="primary-button" onClick={saveEdits} disabled={busy}>{busy ? "Saving…" : "Save Changes →"}</button></div>
          </article>
        )}
      </section>
    </main>
  );
}

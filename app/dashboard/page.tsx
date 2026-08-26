"use client";

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { clearPendingFile, getPendingFile } from "@/lib/pending-file";
import "./dashboard.css";

type ProposalState = "unpaid" | "paid" | "ready";

type RfpRecord = {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  user_id: string;
  status: string | null;
  created_at?: string;
  updated_at?: string;
  analysis_id?: string | null;
  proposal_state?: ProposalState;
};

type AnalysisRecord = { id: string; rfp_id: string; raw_analysis?: unknown };

export default function Dashboard() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rfp, setRfp] = useState<RfpRecord | null>(null);
  const [recentRfPs, setRecentRfPs] = useState<RfpRecord[]>([]);
  const [dragging, setDragging] = useState(false);
  const [firmName, setFirmName] = useState("Your Architecture Firm");
  const [email, setEmail] = useState("");
  const [loadingUser, setLoadingUser] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingUpload, setPendingUpload] = useState(false);
  const [status, setStatus] = useState("");
  const [loadError, setLoadError] = useState("");
  const supabase = createClient();

  function mergeRfp(record: RfpRecord) {
    setRecentRfPs(current => [record, ...current.filter(item => item.id !== record.id)]);
    setRfp(current => current?.id === record.id ? record : current);
  }

  async function refreshRfpStatuses(records: RfpRecord[]): Promise<RfpRecord[]> {
    if (!records.length) return records;
    const pending = records.filter(record => record.status === "analyzing" && !record.analysis_id);
    await Promise.all(pending.map(async record => {
      try {
        const response = await fetch(`/api/analyze/status?rfpId=${encodeURIComponent(record.id)}`, { cache: "no-store" });
        const result = await response.json().catch(() => ({}));
        if (result.status === "completed" && result.analysisId) {
          record.analysis_id = result.analysisId;
          record.status = "analyzed";
        } else if (result.status === "failed") {
          record.status = "failed";
          record.analysis_id = null;
        }
      } catch (error) { console.warn("Background analysis status check failed:", error); }
    }));

    const ids = records.map(record => record.id);
    const { data: analyses, error: analysisError } = await supabase.from("rfp_analyses").select("id, rfp_id, raw_analysis").in("rfp_id", ids);
    if (analysisError) { console.warn("Analysis lookup failed:", analysisError.message); return records; }
    const completedMap = new Map<string, string>();
    ((analyses ?? []) as AnalysisRecord[]).forEach(item => {
      const raw = item.raw_analysis && typeof item.raw_analysis === "object" ? item.raw_analysis as Record<string, unknown> : {};
      const processing = raw.processing === true && typeof raw.openai_response_id === "string";
      if (!processing) completedMap.set(item.rfp_id, item.id);
    });
    return records.map(record => {
      const analysisId = record.analysis_id ?? completedMap.get(record.id) ?? null;
      return { ...record, analysis_id: analysisId, status: analysisId ? "analyzed" : record.status };
    });
  }

  async function refreshProposalStatuses(records: RfpRecord[]): Promise<RfpRecord[]> {
    const analysisIds = records.map(item => item.analysis_id).filter((id): id is string => Boolean(id));
    if (!analysisIds.length) return records;
    const [{ data: purchases, error: purchaseError }, { data: proposals, error: proposalError }] = await Promise.all([
      supabase.from("proposal_purchases").select("analysis_id, status").in("analysis_id", analysisIds).eq("status", "paid"),
      supabase.from("proposals").select("analysis_id, status").in("analysis_id", analysisIds),
    ]);
    if (purchaseError) console.warn("Proposal purchase lookup failed:", purchaseError.message);
    if (proposalError) console.warn("Proposal lookup failed:", proposalError.message);
    const paid = new Set((purchases ?? []).map(item => item.analysis_id as string));
    const ready = new Set((proposals ?? []).filter(item => item.status === "ready").map(item => item.analysis_id as string));
    return records.map((item): RfpRecord => {
      const proposal_state: ProposalState = item.analysis_id && ready.has(item.analysis_id)
        ? "ready"
        : item.analysis_id && paid.has(item.analysis_id)
          ? "paid"
          : "unpaid";
      return { ...item, proposal_state };
    });
  }

  useEffect(() => {
    let cancelled = false;
    async function loadWorkspace() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user) { window.location.href = "/login"; return; }
        setEmail(user.email ?? "");
        const metadataFirm = user.user_metadata?.firm_name;
        if (metadataFirm) setFirmName(metadataFirm);
        const { data: firm, error: firmError } = await supabase.from("firms").select("name").eq("owner_id", user.id).maybeSingle();
        if (firmError) console.warn("Firm lookup failed:", firmError.message);
        if (firm?.name && firm.name !== "My Architecture Firm") setFirmName(firm.name);
        const { data: savedRfps, error: rfpError } = await supabase.from("rfps").select("id, file_name, file_path, file_type, user_id, status, created_at, updated_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10);
        if (rfpError) throw new Error(`Could not load saved RFPs: ${rfpError.message}`);
        let records = await refreshRfpStatuses((savedRfps ?? []) as RfpRecord[]);
        records = await refreshProposalStatuses(records);
        if (cancelled) return;
        setRecentRfPs(records);
        if (records.length) {
          setRfp(records[0]);
          setPendingUpload(false);
          const latest = records[0];
          if (latest.proposal_state === "ready") setStatus("Your latest proposal is ready. Open it from Recent RFPs.");
          else if (latest.proposal_state === "paid") setStatus("Your latest proposal has been unlocked and is ready to generate.");
          else if (latest.analysis_id) setStatus("Your latest RFP analysis is complete. You can view the report or generate a proposal.");
          else if (latest.status === "analyzing") setStatus("Your RFP is saved and is being analyzed. You can leave this page and come back later.");
          else if (latest.status === "failed") setStatus("The previous analysis did not complete. Your RFP is safely saved and can be retried.");
          else setStatus("Your RFP is saved and ready to analyze.");
        } else {
          try {
            const pending = await getPendingFile();
            if (pending && !cancelled) { setFile(pending); setPendingUpload(true); setStatus("Your uploaded RFP is still here. Save it to your workspace to continue."); }
          } catch (e) { console.error("Pending file lookup failed:", e); }
        }
      } catch (error) {
        console.error("Dashboard load error:", error);
        setLoadError(error instanceof Error ? error.message : "We could not load your saved RFPs.");
        setStatus("Your account is signed in, but we could not load the saved RFP list. Your documents have not been deleted.");
      } finally { if (!cancelled) setLoadingUser(false); }
    }
    loadWorkspace();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (loadingUser || !recentRfPs.some(item => item.status === "analyzing" && !item.analysis_id)) return;
    let stopped = false;
    const checkStatuses = async () => {
      const pending = recentRfPs.filter(item => item.status === "analyzing" && !item.analysis_id);
      if (!pending.length) return;
      let updated = await refreshRfpStatuses(pending);
      updated = await refreshProposalStatuses(updated);
      if (stopped) return;
      setRecentRfPs(current => current.map(existing => updated.find(item => item.id === existing.id) ?? existing));
      updated.forEach(item => {
        if (item.analysis_id || item.status === "failed") {
          setRfp(current => current?.id === item.id ? item : current);
          if (item.proposal_state === "ready") setStatus("Your proposal is ready to view.");
          else if (item.analysis_id) setStatus("Your latest RFP analysis is complete. You can view the report or generate a proposal.");
          else if (item.status === "failed") setStatus("The RFP analysis failed. Your document is safe and can be retried.");
        }
      });
    };
    checkStatuses();
    const interval = window.setInterval(checkStatuses, 5000);
    return () => { stopped = true; window.clearInterval(interval); };
  }, [loadingUser, recentRfPs]);

  function chooseFile(selected: File | undefined) {
    if (!selected) return;
    const allowed = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword"];
    if (!allowed.includes(selected.type) && !/\.(pdf|doc|docx)$/i.test(selected.name)) { setStatus("Please upload a PDF, DOC, or DOCX file."); return; }
    if (selected.size > 25 * 1024 * 1024) { setStatus("Please upload a file smaller than 25MB."); return; }
    setFile(selected); setRfp(null); setPendingUpload(true); setStatus("RFP selected. Click Save & analyze to continue.");
  }
  function onDrop(event: DragEvent<HTMLDivElement>) { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files?.[0]); }
  function onInput(event: ChangeEvent<HTMLInputElement>) { chooseFile(event.target.files?.[0]); }

  async function saveRfpIfNeeded(userId: string): Promise<RfpRecord> {
    if (rfp && !file) return rfp;
    if (!file) throw new Error("Please select an RFP first.");
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `${userId}/${crypto.randomUUID()}-${safeName}`;
    const { error: storageError } = await supabase.storage.from("rfps").upload(path, file, { upsert: false });
    if (storageError) throw storageError;
    const { data: inserted, error: rfpError } = await supabase.from("rfps").insert({ user_id: userId, file_name: file.name, file_path: path, file_type: file.type || "application/octet-stream", status: "analyzing" }).select("id, file_name, file_path, file_type, user_id, status, created_at, updated_at").single();
    if (rfpError || !inserted) throw rfpError || new Error("We could not create the RFP record.");
    await clearPendingFile(); setFile(null); setPendingUpload(false);
    return inserted as RfpRecord;
  }

  async function startAnalysis(rfpRecord: RfpRecord) {
    fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rfpId: rfpRecord.id }) })
      .then(async response => { const result = await response.json().catch(() => ({})); if (!response.ok) console.error("ArchBid analysis start error:", result); })
      .catch(error => console.error("ArchBid analysis start request failed; status polling continues:", error));
  }

  async function analyzeRfp() {
    if (busy) return;
    setBusy(true); setStatus("Saving your RFP securely…");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      const saved = await saveRfpIfNeeded(user.id);
      const analyzing: RfpRecord = { ...saved, status: "analyzing", updated_at: new Date().toISOString(), analysis_id: null, proposal_state: "unpaid" };
      mergeRfp(analyzing); setStatus("Your RFP has been saved. Analysis is running in the background. You can leave this page and come back later.");
      await startAnalysis(analyzing);
    } catch (error) { console.error("ArchBid analysis UI error:", error); setStatus(error instanceof Error ? error.message : "We could not save your RFP. Please try again."); }
    finally { setBusy(false); }
  }

  async function retryAnalysis(item: RfpRecord) {
    if (busy) return;
    setBusy(true);
    const analyzing: RfpRecord = { ...item, status: "analyzing", analysis_id: null, proposal_state: "unpaid", updated_at: new Date().toISOString() };
    setRecentRfPs(current => current.map(existing => existing.id === item.id ? analyzing : existing));
    setRfp(current => current?.id === item.id ? analyzing : current);
    setStatus("Your RFP is saved. Analysis has been restarted and will appear as a completed report when ready.");
    try {
      await supabase.from("rfps").update({ status: "analyzing", updated_at: new Date().toISOString() }).eq("id", item.id);
      await supabase.from("rfp_analyses").delete().eq("rfp_id", item.id);
      await startAnalysis(analyzing);
    } catch (error) { console.error("Retry analysis error:", error); setStatus("We could not restart the analysis. Please try again."); }
    finally { setBusy(false); }
  }

  async function signOut() { await supabase.auth.signOut(); window.location.href = "/"; }
  function openSavedAnalysis(item: RfpRecord) { if (!item.analysis_id) { setStatus("This RFP is still being analyzed. The View report button will appear automatically when the analysis is complete."); return; } window.location.href = `/results/${item.analysis_id}`; }
  function openProposal(item: RfpRecord) { if (!item.analysis_id) { setStatus("The proposal option becomes available when this RFP analysis is complete."); return; } window.location.href = `/proposal/${item.analysis_id}`; }

  if (loadingUser) return <main className="dashboard loading-screen">Loading your ArchBid workspace…</main>;
  const displayName = file?.name || rfp?.file_name || "Drop your RFP here";
  const fileSize = file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : "";
  const isAnalyzing = Boolean(rfp?.status === "analyzing" || busy);

  return (
    <main className="dashboard">
      <nav className="nav container">
        <a className="brand" href="/"><span className="brand-mark">A</span>ArchBid <span className="brand-ai">AI</span></a>
        <div className="account-area">
          <div className="account-avatar">{firmName.slice(0, 2).toUpperCase()}</div>
          <div className="account-info"><strong>{firmName}</strong><span>{email}</span></div>
          <a className="signout-button" href="/firm-profile">Firm Profile</a>
          <button className="signout-button" onClick={signOut}>Sign out</button>
        </div>
      </nav>
      <section className="container dash-content">
        <div className="welcome-row"><div><div className="section-label">RFP ANALYZER</div><h1>Welcome, {firmName}</h1><p className="dash-copy">Upload an RFP or tender document. ArchBid will extract the information needed to decide whether your firm should pursue it.</p></div></div>
        <div className={`upload ${dragging ? "dragging" : ""}`} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} onClick={() => input.current?.click()}>
          <input ref={input} type="file" accept=".pdf,.doc,.docx" hidden onChange={onInput} />
          <div className="upload-icon">{isAnalyzing ? "✦" : "↑"}</div><h2>{displayName}</h2><p>{file ? `${fileSize} · Ready` : rfp ? `${rfp.status === "analyzing" ? "Analysis in progress" : rfp.analysis_id ? "Analysis complete" : rfp.status === "failed" ? "Ready to retry" : "Saved"}` : "or click to browse · PDF, DOCX up to 25MB"}</p>
        </div>
        <button className="analyze-button" disabled={isAnalyzing || (!file && !rfp)} onClick={() => { if (rfp?.analysis_id && !file) openSavedAnalysis(rfp); else if (rfp?.status === "failed" && !file) retryAnalysis(rfp); else analyzeRfp(); }}>
          {isAnalyzing ? "RFP saved · Analysis in progress…" : rfp?.analysis_id ? "View saved analysis →" : rfp?.status === "failed" ? "Retry analysis →" : pendingUpload ? "Save & analyze RFP →" : "Analyze RFP →"}
        </button>
        {loadError && <div className="status-message">{loadError}</div>}
        {status && <div className="status-message">{status}</div>}
        <section className="recent-section">
          <h2>Recent RFPs</h2>
          <div className="recent-list">
            {recentRfPs.length === 0 && <div className="recent-item"><span>No RFPs saved yet.</span></div>}
            {recentRfPs.map(item => (
              <div className="recent-item" key={item.id}>
                <span>{item.file_name}</span>
                <span className="recent-actions">
                  {item.analysis_id ? <>
                    <button type="button" className="view-report-button" onClick={() => openSavedAnalysis(item)}>Completed · View report →</button>
                    {item.proposal_state === "ready" ? <button type="button" className="proposal-button" onClick={() => openProposal(item)}>View Proposal →</button> : item.proposal_state === "paid" ? <button type="button" className="proposal-button" onClick={() => openProposal(item)}>Generate Proposal →</button> : <button type="button" className="proposal-button" onClick={() => openProposal(item)}>Generate proposal · $19 →</button>}
                  </> : item.status === "analyzing" ? <span className="status-analyzing">Analyzing…</span> : item.status === "failed" ? <button type="button" className="retry-button" onClick={() => retryAnalysis(item)}>Analysis failed · Retry →</button> : <span>{item.status || "Saved"}</span>}
                </span>
              </div>
            ))}
          </div>
        </section>
        <div className="benefits"><strong>What you'll get:</strong> opportunity score · go/no-go recommendation · deadline · requirements · evaluation criteria · submission checklist · risks</div>
      </section>
    </main>
  );
}

"use client";

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { clearPendingFile, getPendingFile } from "@/lib/pending-file";
import "./dashboard.css";

type RfpRecord = {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  status: string | null;
  created_at?: string;
};

export default function Dashboard() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rfp, setRfp] = useState<RfpRecord | null>(null);
  const [dragging, setDragging] = useState(false);
  const [firmName, setFirmName] = useState("Your Architecture Firm");
  const [email, setEmail] = useState("");
  const [loadingUser, setLoadingUser] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingUpload, setPendingUpload] = useState(false);
  const [status, setStatus] = useState("");
  const supabase = createClient();

  useEffect(() => {
    async function loadWorkspace() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      setEmail(user.email ?? "");
      const metadataFirm = user.user_metadata?.firm_name;
      if (metadataFirm) setFirmName(metadataFirm);

      const { data: firm } = await supabase.from("firms").select("name").eq("owner_id", user.id).maybeSingle();
      if (firm?.name && firm.name !== "My Architecture Firm") setFirmName(firm.name);

      // The database is the source of truth after an RFP has been saved.
      // This means refreshes no longer make an uploaded/analyzing RFP disappear.
      const { data: latestRfp } = await supabase
        .from("rfps")
        .select("id, file_name, file_path, file_type, status, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestRfp) {
        setRfp(latestRfp as RfpRecord);
        setPendingUpload(false);
        if (latestRfp.status === "analyzing") {
          setStatus("ArchBid is analyzing this RFP. You can safely refresh this page; the saved document will remain here.");
        } else if (latestRfp.status === "analyzed") {
          setStatus("Analysis completed. Your result is saved to your workspace.");
        } else if (latestRfp.status === "failed") {
          setStatus("The previous analysis did not complete. Your RFP is still saved. You can try again.");
        } else {
          setStatus("Your RFP is saved and ready to analyze.");
        }
      } else {
        try {
          const pending = await getPendingFile();
          if (pending) {
            setFile(pending);
            setPendingUpload(true);
            setStatus("Your uploaded RFP is still here. Save it to your workspace to continue.");
          }
        } catch (e) { console.error(e); }
      }
      setLoadingUser(false);
    }
    loadWorkspace();
  }, []);

  function chooseFile(selected: File | undefined) {
    if (!selected) return;
    const allowed = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword"];
    if (!allowed.includes(selected.type) && !/\.(pdf|doc|docx)$/i.test(selected.name)) return setStatus("Please upload a PDF, DOC, or DOCX file.");
    if (selected.size > 25 * 1024 * 1024) return setStatus("Please upload a file smaller than 25MB.");
    setFile(selected); setRfp(null); setPendingUpload(true); setStatus("RFP selected. Click Save & analyze to continue.");
  }
  function onDrop(event: DragEvent<HTMLDivElement>) { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files?.[0]); }
  function onInput(event: ChangeEvent<HTMLInputElement>) { chooseFile(event.target.files?.[0]); }

  async function saveRfpIfNeeded(userId: string): Promise<RfpRecord> {
    if (rfp) return rfp;
    if (!file) throw new Error("Please select an RFP first.");

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `${userId}/${crypto.randomUUID()}-${safeName}`;
    const { error: storageError } = await supabase.storage.from("rfps").upload(path, file, { upsert: false });
    if (storageError) throw storageError;

    const { data: inserted, error: rfpError } = await supabase
      .from("rfps")
      .insert({ user_id: userId, file_name: file.name, file_path: path, file_type: file.type || "application/octet-stream", status: "uploaded" })
      .select("id, file_name, file_path, file_type, status, created_at")
      .single();
    if (rfpError || !inserted) throw rfpError || new Error("We could not create the RFP record.");

    await clearPendingFile();
    setFile(null);
    setPendingUpload(false);
    setRfp(inserted as RfpRecord);
    return inserted as RfpRecord;
  }

  async function analyzeRfp() {
    if (busy) return;
    setBusy(true);
    setStatus("Saving your RFP securely…");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      const saved = await saveRfpIfNeeded(user.id);
      setRfp({ ...saved, status: "analyzing" });
      setStatus("Analyzing your RFP… ArchBid is reading the document and extracting the bid intelligence. This can take a few minutes for a long RFP.");

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 120000);
      try {
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rfpId: saved.id }),
          signal: controller.signal
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Analysis failed. Please try again.");
        setRfp({ ...saved, status: "analyzed" });
        setStatus("Analysis complete. Your RFP intelligence report has been saved.");
        window.location.href = `/results/${saved.id}`;
      } finally {
        window.clearTimeout(timeout);
      }
    } catch (error) {
      console.error(error);
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus("The analysis is taking longer than expected. Your RFP is saved. Refresh this page in a minute to check its status.");
      } else {
        setStatus(error instanceof Error ? error.message : "We could not analyze your RFP. Your document is still saved.");
      }
      setRfp(current => current ? { ...current, status: "failed" } : current);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() { await supabase.auth.signOut(); window.location.href = "/"; }

  if (loadingUser) return <main className="dashboard loading-screen">Loading your ArchBid workspace…</main>;

  const displayName = rfp?.file_name || file?.name || "Drop your RFP here";
  const fileSize = file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : "";
  const isAnalyzing = rfp?.status === "analyzing" || busy;

  return (
    <main className="dashboard">
      <nav className="nav container">
        <a className="brand" href="/"><span className="brand-mark">A</span> ArchBid <span className="brand-ai">AI</span></a>
        <div className="account-area">
          <div className="account-avatar">{firmName.slice(0, 2).toUpperCase()}</div>
          <div className="account-info"><strong>{firmName}</strong><span>{email}</span></div>
          <button className="signout-button" onClick={signOut}>Sign out</button>
        </div>
      </nav>

      <section className="container dash-content">
        <div className="welcome-row"><div><div className="section-label">RFP ANALYZER</div><h1>Welcome, {firmName}</h1><p className="dash-copy">Upload an RFP or tender document. ArchBid will extract the information needed to decide whether your firm should pursue it.</p></div></div>

        <div className={`upload ${dragging ? "dragging" : ""}`} onDragOver={(e)=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={onDrop} onClick={()=>input.current?.click()}>
          <input ref={input} type="file" accept=".pdf,.doc,.docx" hidden onChange={onInput} />
          <div className="upload-icon">{isAnalyzing ? "✦" : "↑"}</div>
          <h2>{displayName}</h2>
          <p>{file ? `${fileSize} · Ready` : rfp ? `${rfp.status === "analyzing" ? "Analysis in progress" : rfp.status === "analyzed" ? "Analysis complete" : rfp.status === "failed" ? "Ready to retry" : "Saved"}` : "or click to browse · PDF, DOCX up to 25MB"}</p>
        </div>

        <button className="analyze-button" disabled={isAnalyzing || (!file && !rfp)} onClick={analyzeRfp}>
          {isAnalyzing ? "Analyzing your RFP…" : rfp?.status === "failed" ? "Retry analysis →" : pendingUpload ? "Save & analyze RFP →" : rfp?.status === "analyzed" ? "Analyze another RFP →" : "Analyze RFP →"}
        </button>

        {status && <div className="status-message">{status}</div>}
        <div className="demo-note"><strong>What you'll get:</strong> deadline · requirements · evaluation criteria · submission checklist · risks · opportunity score</div>
      </section>
    </main>
  );
}

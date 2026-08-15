"use client";

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { clearPendingFile, getPendingFile } from "@/lib/pending-file";
import "../dashboard/dashboard.css";

export default function WorkspacePage() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [firmName, setFirmName] = useState("Your Architecture Firm");
  const [email, setEmail] = useState("");
  const [loadingUser, setLoadingUser] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [pendingUpload, setPendingUpload] = useState(false);
  const [status, setStatus] = useState("");
  const supabase = createClient();

  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      setEmail(user.email ?? "");
      if (user.user_metadata?.firm_name) setFirmName(user.user_metadata.firm_name);
      const { data: firm } = await supabase.from("firms").select("name").eq("owner_id", user.id).maybeSingle();
      if (firm?.name && firm.name !== "My Architecture Firm") setFirmName(firm.name);
      try {
        const pending = await getPendingFile();
        if (pending) {
          setFile(pending);
          setPendingUpload(true);
          setStatus("Your uploaded RFP is still here. Click Analyze RFP to begin the AI review.");
        }
      } catch (e) { console.error(e); }
      setLoadingUser(false);
    }
    loadProfile();
  }, []);

  function chooseFile(selected?: File) {
    if (!selected) return;
    if (!/\.(pdf|doc|docx)$/i.test(selected.name)) return setStatus("Please upload a PDF, DOC, or DOCX file.");
    if (selected.size > 25 * 1024 * 1024) return setStatus("Please upload a file smaller than 25MB.");
    setFile(selected); setPendingUpload(false); setStatus("");
  }
  function onDrop(e: DragEvent<HTMLDivElement>) { e.preventDefault(); setDragging(false); chooseFile(e.dataTransfer.files?.[0]); }
  function onInput(e: ChangeEvent<HTMLInputElement>) { chooseFile(e.target.files?.[0]); }

  async function analyzeRfp() {
    if (!file || analyzing) return;
    setAnalyzing(true); setStatus("Saving your RFP securely…");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = `${user.id}/${crypto.randomUUID()}-${safeName}`;
      const { error: storageError } = await supabase.storage.from("rfps").upload(path, file, { upsert: false });
      if (storageError) throw storageError;
      const { data: firm } = await supabase.from("firms").select("id").eq("owner_id", user.id).maybeSingle();
      const { data: rfp, error: rfpError } = await supabase.from("rfps").insert({
        user_id: user.id, firm_id: firm?.id ?? null, file_name: file.name, file_path: path,
        file_type: file.type || "application/octet-stream", status: "uploaded"
      }).select("id").single();
      if (rfpError || !rfp) throw rfpError ?? new Error("We could not create the RFP record.");
      await clearPendingFile();
      setPendingUpload(false);
      setStatus("RFP saved. ArchBid AI is reading the document and extracting the bid intelligence…");
      const response = await fetch("/api/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rfpId: rfp.id })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "AI analysis failed. Please try again.");
      window.location.href = `/results/${result.analysisId}`;
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "We could not analyze your RFP. Please try again.");
      setAnalyzing(false);
    }
  }

  async function signOut() { await supabase.auth.signOut(); window.location.href = "/"; }
  if (loadingUser) return <main className="dashboard loading-screen">Loading your ArchBid workspace…</main>;

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
        <div className={`upload ${dragging ? "dragging" : ""} ${analyzing ? "processing" : ""}`} onDragOver={(e)=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={onDrop} onClick={()=>!analyzing && input.current?.click()}>
          <input ref={input} type="file" accept=".pdf,.doc,.docx" hidden onChange={onInput} />
          <div className="upload-icon">{analyzing ? "✦" : "↑"}</div><h2>{file ? file.name : "Drop your RFP here"}</h2><p>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB · ${pendingUpload ? "Waiting to be analyzed" : "Ready"}` : "or click to browse · PDF, DOCX up to 25MB"}</p>
        </div>
        <button className="analyze-button" disabled={!file || analyzing} onClick={analyzeRfp}>{analyzing ? "Analyzing your RFP…" : "Analyze RFP →"}</button>
        {status && <div className="status-message">{status}</div>}
        <div className="demo-note"><strong>What you'll get:</strong> opportunity score · go/no-go recommendation · deadline · requirements · evaluation criteria · submission checklist · risks</div>
      </section>
    </main>
  );
}

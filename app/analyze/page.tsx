"use client";

import { ChangeEvent, DragEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { savePendingFile } from "@/lib/pending-file";
import Link from "next/link";
import "./analyze.css";

export default function AnalyzePage() {
  const [file, setFile] = useState<File | null>(null);
  const [firmName, setFirmName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function chooseFile(selected?: File) {
    if (!selected) return;
    if (!/\.(pdf|doc|docx)$/i.test(selected.name)) return setError("Please upload a PDF, DOC, or DOCX file.");
    if (selected.size > 25 * 1024 * 1024) return setError("Please upload a file smaller than 25MB.");
    setError(""); setMessage(""); setFile(selected);
    savePendingFile(selected).catch(() => setError("We couldn't keep the file ready. Please try again."));
  }

  function onDrop(e: DragEvent<HTMLDivElement>) { e.preventDefault(); setDragging(false); chooseFile(e.dataTransfer.files?.[0]); }
  function onInput(e: ChangeEvent<HTMLInputElement>) { chooseFile(e.target.files?.[0]); }

  async function continueToAnalysis() {
    setError(""); setMessage("");
    if (!file) return setError("Upload your RFP first.");
    if (!firmName || !email || password.length < 6) return setError("Enter your firm name, work email, and a password of at least 6 characters.");
    setLoading(true);
    try {
      await savePendingFile(file);
      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.signUp({ email, password, options: { data: { firm_name: firmName } } });
      if (authError) { setError(authError.message); setLoading(false); return; }
      if (!data.session) {
        setMessage("Account created. Check your email to confirm your address. After confirming, sign in and your uploaded RFP will still be waiting for you.");
        setLoading(false);
        return;
      }
      window.location.href = "/dashboard?pending=1";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <main className="analyze-page">
      <nav className="analyze-nav container"><Link className="brand" href="/"><span className="brand-mark">A</span> ArchBid <span className="brand-ai">AI</span></Link><Link href="/login">Already have an account? Sign in</Link></nav>
      <section className="analyze-container">
        <div className="section-label">FREE RFP ANALYZER</div>
        <h1>Upload your RFP.<br /><span>Find out if it is worth pursuing.</span></h1>
        <p className="lead">Start with your document. We'll analyze the opportunity and give you a clear go/no-go recommendation.</p>
        <div className={`upload ${dragging ? "dragging" : ""}`} onDragOver={(e)=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={onDrop} onClick={()=>document.getElementById("rfp-file")?.click()}>
          <input id="rfp-file" type="file" accept=".pdf,.doc,.docx" hidden onChange={onInput} />
          <div className="upload-icon">↑</div><h2>{file ? file.name : "Drop your RFP here"}</h2><p>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB · Ready` : "or click to browse · PDF, DOC, DOCX · max 25MB"}</p>
        </div>
        {file && <div className="account-gate"><div className="gate-badge">RFP UPLOADED · READY TO ANALYZE</div><h2>Your RFP is ready.</h2><p>Create your free account to securely save the document and generate your analysis. If email confirmation is required, your document will remain waiting when you sign in.</p><div className="form-grid"><label>Firm name<input value={firmName} onChange={e=>setFirmName(e.target.value)} placeholder="Smith Architecture Studio" /></label><label>Work email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@firm.com" /></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 6 characters" /></label></div><button className="analyze-button" disabled={loading} onClick={continueToAnalysis}>{loading ? "Creating your workspace…" : "Continue to analysis →"}</button></div>}
        {error && <div className="error">{error}</div>}{message && <div className="success">{message}</div>}
        {!file && <div className="trust-row"><span>✓ No credit card</span><span>✓ Free first analysis</span><span>✓ Secure document storage</span></div>}
      </section>
    </main>
  );
}

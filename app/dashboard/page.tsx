"use client";

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import "./dashboard.css";

export default function Dashboard() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [firmName, setFirmName] = useState("Your Architecture Firm");
  const [email, setEmail] = useState("");
  const [loadingUser, setLoadingUser] = useState(true);
  const [uploading, setUploading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = "/signup";
        return;
      }
      setEmail(user.email ?? "");
      const metadataFirm = user.user_metadata?.firm_name;
      if (metadataFirm) setFirmName(metadataFirm);

      const { data: firm } = await supabase
        .from("firms")
        .select("name")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (firm?.name && firm.name !== "My Architecture Firm") setFirmName(firm.name);
      setLoadingUser(false);
    }
    loadProfile();
  }, []);

  function chooseFile(selected: File | undefined) {
    if (!selected) return;
    const allowed = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword"];
    if (!allowed.includes(selected.type) && !/\.(pdf|doc|docx)$/i.test(selected.name)) {
      alert("Please upload a PDF, DOC, or DOCX file.");
      return;
    }
    if (selected.size > 25 * 1024 * 1024) {
      alert("Please upload a file smaller than 25MB.");
      return;
    }
    setFile(selected);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files?.[0]);
  }

  function onInput(event: ChangeEvent<HTMLInputElement>) {
    chooseFile(event.target.files?.[0]);
  }

  async function analyzeRfp() {
    if (!file || uploading) return;
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = "/signup";
        return;
      }
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = `${user.id}/${crypto.randomUUID()}-${safeName}`;
      const { error: storageError } = await supabase.storage.from("rfps").upload(path, file, { upsert: false });
      if (storageError) throw storageError;

      const { error: rfpError } = await supabase.from("rfps").insert({
        user_id: user.id,
        file_name: file.name,
        file_path: path,
        file_type: file.type || "application/octet-stream",
        status: "uploaded",
      });
      if (rfpError) throw rfpError;

      alert("RFP uploaded successfully. AI analysis will be connected in the next build step.");
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "We could not upload your RFP. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (loadingUser) {
    return <main className="dashboard loading-screen">Loading your ArchBid workspace…</main>;
  }

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
        <div className="welcome-row">
          <div>
            <div className="section-label">RFP ANALYZER</div>
            <h1>Welcome, {firmName}</h1>
            <p className="dash-copy">Upload an RFP or tender document. ArchBid will extract the information needed to decide whether your firm should pursue it.</p>
          </div>
        </div>
        <div className={`upload ${dragging ? "dragging" : ""}`} onDragOver={(e)=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={onDrop} onClick={()=>input.current?.click()}>
          <input ref={input} type="file" accept=".pdf,.doc,.docx" hidden onChange={onInput} />
          <div className="upload-icon">↑</div>
          <h2>{file ? file.name : "Drop your RFP here"}</h2>
          <p>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB · Ready to analyze` : "or click to browse · PDF, DOCX up to 25MB"}</p>
        </div>
        <button className="analyze-button" disabled={!file || uploading} onClick={analyzeRfp}>{uploading ? "Uploading…" : "Analyze RFP →"}</button>
        <div className="demo-note"><strong>What you'll get:</strong> deadline · requirements · evaluation criteria · submission checklist · risks · opportunity score</div>
      </section>
    </main>
  );
}

"use client";

import { useRef, useState } from "react";
import "./dashboard.css";

export default function Dashboard() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<string>("");
  const [dragging, setDragging] = useState(false);

  return (
    <main className="dashboard">
      <nav className="nav container"><a className="brand" href="/"><span className="brand-mark">A</span> ArchBid <span className="brand-ai">AI</span></a><span className="demo-pill">MVP DEMO</span></nav>
      <section className="container dash-content">
        <div className="section-label">RFP ANALYZER</div>
        <h1>Analyze an RFP</h1>
        <p className="dash-copy">Upload an RFP or tender document. ArchBid will extract the information needed to decide whether your firm should pursue it.</p>
        <div className={`upload ${dragging ? "dragging" : ""}`} onDragOver={(e)=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={(e)=>{e.preventDefault();setDragging(false);const f=e.dataTransfer.files[0];if(f)setFile(f.name)}} onClick={()=>input.current?.click()}>
          <input ref={input} type="file" accept=".pdf,.doc,.docx" hidden onChange={(e)=>setFile(e.target.files?.[0]?.name || "")} />
          <div className="upload-icon">↑</div>
          <h2>{file || "Drop your RFP here"}</h2>
          <p>{file ? "Ready to analyze" : "or click to browse · PDF, DOCX up to 25MB"}</p>
        </div>
        <button className="analyze-button" disabled={!file} onClick={()=>alert("RFP analysis will be connected in the next build step.")}>Analyze RFP →</button>
        <div className="demo-note"><strong>What you'll get:</strong> deadline · requirements · evaluation criteria · submission checklist · risks · opportunity score</div>
      </section>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";

export default function Home() {
  const [open, setOpen] = useState(false);
  const closeMenu = () => setOpen(false);

  return (
    <main className="home">
      <nav className="home-nav">
        <div className="container nav-inner">
          <Link className="brand" href="/" onClick={closeMenu}><span className="brand-mark">A</span> ArchBid <span className="brand-ai">AI</span></Link>
          <div className="nav-menu desktop-nav">
            <a href="#how-it-works">How it works</a><a href="#pricing">Pricing</a><Link href="/contact">Contact</Link><Link href="/login">Sign in</Link><Link className="nav-cta" href="/analyze">Get started free →</Link>
          </div>
          <button type="button" className={`hamburger ${open ? "is-open" : ""}`} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(v => !v)}><span /><span /><span /></button>
        </div>
        {open && <div className="mobile-nav"><a href="#how-it-works" onClick={closeMenu}>How it works</a><a href="#pricing" onClick={closeMenu}>Pricing</a><Link href="/contact" onClick={closeMenu}>Contact</Link><Link href="/login" onClick={closeMenu}>Sign in</Link><Link className="mobile-nav-cta" href="/analyze" onClick={closeMenu}>Get started free →</Link></div>}
      </nav>

      <section className="hero container"><div className="eyebrow">AI BID INTELLIGENCE FOR ARCHITECTURE FIRMS</div><h1>Know which RFPs to pursue <span>before</span> you spend days responding.</h1><p className="hero-copy">ArchBid AI helps architecture firms quickly understand an RFP, decide whether it is worth pursuing, and build a stronger response without starting from a blank page.</p><div className="hero-actions"><Link className="primary-button" href="/analyze">Analyze an RFP for free →</Link><a className="secondary-button" href="#how-it-works">See how it works</a></div><p className="no-card">No credit card required · Your first RFP analysis is free</p></section>

      <section className="value-section container"><div className="value-grid">
        <article><span>WHAT IS ARCHBID?</span><h3>AI bid intelligence built for architecture firms.</h3><p>Upload an RFP or tender and get the important requirements, deadlines, risks, evaluation criteria and a practical opportunity score in one place.</p></article>
        <article><span>WHO IS IT FOR?</span><h3>For firms deciding what to pursue.</h3><p>Built for architecture practices that need to qualify opportunities before spending valuable principals', architects' and proposal teams' time on a response.</p></article>
        <article><span>WHAT DOES IT SAVE?</span><h3>Hours of RFP reading and first-draft work.</h3><p>ArchBid turns long bid documents into a focused decision and gives you a tailored proposal starting point instead of a blank document.</p></article>
        <article><span>WHAT DO YOU GET FOR $19?</span><h3>A tailored first-draft proposal.</h3><p>After your free RFP analysis, unlock a proposal draft built from that RFP, with missing firm-specific information clearly marked for your team to complete.</p></article>
      </div></section>

      <section className="proof container"><div><strong>01</strong><span>Upload your RFP</span></div><div><strong>02</strong><span>Get an opportunity score</span></div><div><strong>03</strong><span>See requirements &amp; risks</span></div><div><strong>04</strong><span>Prepare your response</span></div></section>
      <section id="how-it-works" className="how container"><div className="section-label">HOW IT WORKS</div><h2>Turn a long RFP into a clear decision.</h2><div className="cards"><article><span>01</span><h3>Analyze</h3><p>Extract deadlines, scope, eligibility, evaluation criteria, submission rules and required documents.</p></article><article><span>02</span><h3>Score</h3><p>See a practical Go / No-Go opportunity score with the strongest reasons for and against pursuing the bid.</p></article><article><span>03</span><h3>Respond</h3><p>Use the analysis and compliance checklist as the foundation for a stronger, faster proposal response.</p></article></div></section>
      <section id="pricing" className="score-section"><div className="container score-grid"><div><div className="section-label">OPPORTUNITY INTELLIGENCE</div><h2>Don't just write the proposal. Decide if it's worth writing.</h2><p>ArchBid is designed around the decision architecture firms make before committing valuable staff time to a pursuit.</p></div><div className="score-card"><div className="score-top"><span>PROPOSAL DRAFT</span><strong>$19</strong></div><div className="score-status">● ONE-TIME PURCHASE</div><ul><li>✓ Tailored first-draft proposal</li><li>✓ Built from your analyzed RFP</li><li>✓ Missing firm information clearly marked</li><li>✓ Review and edit before submission</li></ul><Link className="primary-button pricing-cta" href="/analyze">Analyze an RFP free →</Link></div></div></section>
      <footer><div className="container"><span>© 2026 ArchBid AI</span><span>AI bid intelligence for architecture firms. · <Link href="/contact">Contact</Link> · <Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy</Link> · <Link href="/refunds">Refund Policy</Link></span></div></footer>
    </main>
  );
}

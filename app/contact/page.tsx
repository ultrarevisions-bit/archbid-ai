"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export default function ContactPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setSuccess(false);

    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to send your message.");
      setSuccess(true);
      setMessage("Thanks — your message has been sent. We’ll get back to you as soon as possible.");
      form.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to send your message. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="contact-page">
      <nav className="home-nav">
        <div className="container nav-inner">
          <Link className="brand" href="/"><span className="brand-mark">A</span> ArchBid <span className="brand-ai">AI</span></Link>
          <div className="nav-menu desktop-nav">
            <Link href="/">Home</Link>
            <Link href="/login">Sign in</Link>
            <Link className="nav-cta" href="/analyze">Get started free →</Link>
          </div>
        </div>
      </nav>

      <section className="container contact-content">
        <div className="section-label">CONTACT ARCHBID</div>
        <h1>How can we help?</h1>
        <p className="contact-intro">Have a question about RFP analysis, proposal drafts, billing, or anything else? Send us a message and we’ll get back to you.</p>

        <form className="contact-form" onSubmit={submitForm}>
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="name">Name *</label>
              <input id="name" name="name" required maxLength={100} placeholder="Your name" />
            </div>
            <div className="form-field">
              <label htmlFor="email">Email *</label>
              <input id="email" name="email" type="email" required maxLength={200} placeholder="you@company.com" />
            </div>
            <div className="form-field full">
              <label htmlFor="subject">Subject *</label>
              <input id="subject" name="subject" required maxLength={150} placeholder="How can we help?" />
            </div>
            <div className="form-field full">
              <label htmlFor="message">Message *</label>
              <textarea id="message" name="message" required maxLength={5000} placeholder="Tell us what you need help with..." />
            </div>
          </div>
          <button className="contact-submit" type="submit" disabled={loading}>{loading ? "Sending…" : "Send message →"}</button>
          {message && <p className={`form-message ${success ? "success" : "error"}`}>{message}</p>}
        </form>
      </section>

      <footer><div className="container"><span>© 2026 ArchBid AI</span><span><Link href="/">Home</Link> · <Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy</Link></span></div></footer>
    </main>
  );
}

"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import "../auth.css";

export default function SignupPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firmName, setFirmName] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { firm_name: firmName } },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      window.location.href = "/dashboard";
      return;
    }

    setMessage("Account created. Check your email to confirm your address, then sign in.");
    setLoading(false);
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <Link className="auth-brand" href="/"><span className="brand-mark">A</span> ArchBid <span>AI</span></Link>
        <div className="auth-heading"><div className="section-label">START FREE</div><h1>Create your account</h1><p>Analyze your first architecture RFP without a credit card.</p></div>
        <form onSubmit={handleSubmit} className="auth-form">
          <label>Firm name<input value={firmName} onChange={(e) => setFirmName(e.target.value)} placeholder="Smith Architecture Studio" required /></label>
          <label>Work email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@firm.com" required /></label>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" minLength={6} required /></label>
          {error && <div className="auth-error">{error}</div>}
          {message && <div className="auth-success">{message}</div>}
          <button className="auth-button" disabled={loading}>{loading ? "Creating account…" : "Create account →"}</button>
        </form>
        <p className="auth-switch">Already have an account? <Link href="/login">Sign in</Link></p>
      </div>
    </main>
  );
}

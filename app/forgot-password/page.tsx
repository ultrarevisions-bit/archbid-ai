"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import "../auth.css";

export default function ForgotPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    const redirectTo = `${window.location.origin}/reset-password`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (resetError) setError(resetError.message);
    else setMessage("If an account exists for that email, we have sent a password reset link. Please check your inbox and spam folder.");
    setLoading(false);
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <Link className="auth-brand" href="/"><span className="brand-mark">A</span> ArchBid <span>AI</span></Link>
        <div className="auth-heading"><div className="section-label">ACCOUNT RECOVERY</div><h1>Reset your password</h1><p>Enter the email you use for ArchBid and we’ll send you a secure link to choose a new password.</p></div>
        <form onSubmit={handleSubmit} className="auth-form">
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@firm.com" required /></label>
          {error && <div className="auth-error">{error}</div>}
          {message && <div className="auth-success">{message}</div>}
          <button className="auth-button" disabled={loading}>{loading ? "Sending…" : "Send reset link →"}</button>
        </form>
        <p className="auth-switch"><Link href="/login">← Back to sign in</Link></p>
      </div>
    </main>
  );
}

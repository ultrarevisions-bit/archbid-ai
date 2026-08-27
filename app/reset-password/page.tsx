"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import "../auth.css";

export default function ResetPasswordPage() {
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setReady(Boolean(data.session)));
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (password.length < 8) { setError("Your new password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("The passwords do not match."); return; }
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) setError(updateError.message);
    else { setMessage("Your password has been updated. You can now sign in with your new password."); setPassword(""); setConfirm(""); }
    setLoading(false);
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <Link className="auth-brand" href="/"><span className="brand-mark">A</span> ArchBid <span>AI</span></Link>
        <div className="auth-heading"><div className="section-label">NEW PASSWORD</div><h1>Choose a new password</h1><p>{ready ? "Set a new password for your ArchBid account." : "Open this page from the password reset link sent to your email."}</p></div>
        {ready ? <form onSubmit={handleSubmit} className="auth-form">
          <label>New password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" minLength={8} required /></label>
          <label>Confirm new password<input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Enter it again" minLength={8} required /></label>
          {error && <div className="auth-error">{error}</div>}
          {message && <div className="auth-success">{message}</div>}
          <button className="auth-button" disabled={loading}>{loading ? "Updating…" : "Update password →"}</button>
          {message && <Link className="auth-button auth-button-link" href="/login">Go to sign in →</Link>}
        </form> : <div className="auth-error">This reset session is not active. Please request a new reset link.</div>}
        <p className="auth-switch"><Link href="/login">← Back to sign in</Link></p>
      </div>
    </main>
  );
}

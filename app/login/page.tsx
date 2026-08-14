"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import "../auth.css";

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    window.location.href = "/dashboard";
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <Link className="auth-brand" href="/"><span className="brand-mark">A</span> ArchBid <span>AI</span></Link>
        <div className="auth-heading"><div className="section-label">WELCOME BACK</div><h1>Sign in to ArchBid</h1><p>Continue analyzing opportunities for your architecture firm.</p></div>
        <form onSubmit={handleSubmit} className="auth-form">
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@firm.com" required /></label>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required /></label>
          {error && <div className="auth-error">{error}</div>}
          <button className="auth-button" disabled={loading}>{loading ? "Signing in…" : "Sign in →"}</button>
        </form>
        <p className="auth-switch">Don't have an account? <Link href="/signup">Create one free</Link></p>
      </div>
    </main>
  );
}

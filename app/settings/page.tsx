"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function deleteAccount() {
    if (confirmation !== "DELETE MY ACCOUNT") return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "We could not delete your account.");
      await supabase.auth.signOut();
      router.replace("/?accountDeleted=1");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We could not delete your account.");
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f7f7f5", padding: "32px 20px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 48 }}>
          <Link href="/" style={{ fontWeight: 800, textDecoration: "none", color: "inherit" }}>ArchBid <span style={{ opacity: .55 }}>AI</span></Link>
          <Link href="/dashboard" style={{ textDecoration: "none" }}>← Dashboard</Link>
        </nav>

        <h1 style={{ fontSize: "clamp(32px, 6vw, 48px)", marginBottom: 10 }}>Settings</h1>
        <p style={{ color: "#666", marginBottom: 32 }}>Manage your ArchBid account and data.</p>

        <section style={{ background: "white", border: "1px solid #ddd", borderRadius: 16, padding: 28, marginBottom: 20 }}>
          <h2 style={{ marginTop: 0 }}>Firm Profile</h2>
          <p style={{ color: "#666" }}>Update the firm information ArchBid uses when preparing your proposals.</p>
          <Link href="/firm-profile" style={{ display: "inline-block", marginTop: 8 }}>Edit Firm Profile →</Link>
        </section>

        <section style={{ background: "white", border: "1px solid #ddd", borderRadius: 16, padding: 28, borderColor: "#e0b4b4" }}>
          <h2 style={{ marginTop: 0 }}>Delete account</h2>
          <p style={{ color: "#666", lineHeight: 1.6 }}>
            Permanently delete your ArchBid login, Firm Profile, uploaded RFP documents, analyses and generated proposals. This cannot be undone.
          </p>
          <p style={{ color: "#666", lineHeight: 1.6 }}>
            Payment and tax records held by Lemon Squeezy are not modified by this request.
          </p>
          <label style={{ display: "block", fontWeight: 700, marginTop: 20 }}>
            Type <strong>DELETE MY ACCOUNT</strong> to confirm
            <input
              value={confirmation}
              onChange={e => setConfirmation(e.target.value)}
              placeholder="DELETE MY ACCOUNT"
              style={{ display: "block", width: "100%", boxSizing: "border-box", marginTop: 8, padding: 12, border: "1px solid #ccc", borderRadius: 8 }}
            />
          </label>
          {message && <p style={{ color: "#a33", marginTop: 14 }}>{message}</p>}
          <button
            type="button"
            onClick={deleteAccount}
            disabled={busy || confirmation !== "DELETE MY ACCOUNT"}
            style={{ marginTop: 18, padding: "12px 18px", borderRadius: 8, border: 0, background: "#9b2c2c", color: "white", fontWeight: 700, cursor: busy ? "wait" : "pointer", opacity: confirmation === "DELETE MY ACCOUNT" && !busy ? 1 : .45 }}
          >
            {busy ? "Deleting account…" : "Delete my account"}
          </button>
        </section>
      </div>
    </main>
  );
}

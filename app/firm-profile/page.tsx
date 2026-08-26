"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import "./firm-profile.css";

type FirmProfile = {
  legalName: string;
  authorizedRepresentative: string;
  country: string;
  officeAddress: string;
  phone: string;
  website: string;
  registrationsLicenses: string;
  yearsExperience: string;
  availabilityCapacity: string;
  municipalExperience: string;
  services: string;
  projectExperience: string;
  teamMembers: string;
  certifications: string;
  differentiators: string;
};

const emptyProfile: FirmProfile = {
  legalName: "", authorizedRepresentative: "", country: "United States", officeAddress: "", phone: "", website: "", registrationsLicenses: "", yearsExperience: "", availabilityCapacity: "", municipalExperience: "", services: "", projectExperience: "", teamMembers: "", certifications: "", differentiators: "",
};

export default function FirmProfilePage() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const [profile, setProfile] = useState<FirmProfile>(emptyProfile);
  const [firmName, setFirmName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) { window.location.href = "/login"; return; }
      const { data: firm, error: firmError } = await supabase.from("firms").select("name, country, website, services, profile").eq("owner_id", user.id).maybeSingle();
      if (firmError) setError(`Could not load your firm profile: ${firmError.message}`);
      else if (firm) {
        setFirmName(firm.name || "My Architecture Firm");
        const saved = (firm.profile && typeof firm.profile === "object" ? firm.profile : {}) as Partial<FirmProfile>;
        setProfile({ ...emptyProfile, country: firm.country || emptyProfile.country, website: firm.website || "", services: Array.isArray(firm.services) ? firm.services.join("\n") : "", ...saved });
      }
      setLoading(false);
    }
    load();
  }, []);

  function update<K extends keyof FirmProfile>(key: K, value: FirmProfile[K]) { setProfile(current => ({ ...current, [key]: value })); }

  async function save() {
    setSaving(true); setMessage(""); setError("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      const services = profile.services.split(/\n|,/).map(item => item.trim()).filter(Boolean);
      const firmUpdate = { name: profile.legalName.trim() || firmName || "My Architecture Firm", country: profile.country.trim() || "United States", website: profile.website.trim() || null, services, profile, updated_at: new Date().toISOString() };
      const { error: saveError } = await supabase.from("firms").update(firmUpdate).eq("owner_id", user.id);
      if (saveError) throw saveError;
      setFirmName(firmUpdate.name);
      setMessage("Firm Profile saved. ArchBid will use these details automatically in future proposals.");
      if (returnTo && returnTo.startsWith("/")) setTimeout(() => { window.location.href = returnTo; }, 700);
    } catch (err) { setError(err instanceof Error ? err.message : "We could not save your firm profile."); }
    finally { setSaving(false); }
  }

  async function signOut() { await supabase.auth.signOut(); window.location.href = "/"; }

  if (loading) return <main className="profile-page"><div className="profile-loading">Loading Firm Profile…</div></main>;

  return (
    <main className="profile-page">
      <nav className="profile-nav"><a className="profile-brand" href="/"><span className="brand-mark">A</span> ArchBid <span>AI</span></a><div className="profile-nav-actions"><a href="/dashboard">Dashboard</a><button onClick={signOut}>Sign out</button></div></nav>
      <section className="profile-container">
        <div className="profile-intro"><span className="profile-label">REUSABLE FIRM PROFILE</span><h1>Tell ArchBid about your firm once.</h1><p>ArchBid will reuse this information when drafting proposals. It will never invent missing credentials or experience. Leave a field blank when it does not apply.</p></div>
        {message && <div className="profile-message success">{message}</div>}
        {error && <div className="profile-message error">{error}</div>}
        <div className="profile-card">
          <div className="profile-grid">
            <label>Firm legal name<input value={profile.legalName} onChange={e => update("legalName", e.target.value)} placeholder="ABC Architecture LLC" /></label>
            <label>Authorized representative<input value={profile.authorizedRepresentative} onChange={e => update("authorizedRepresentative", e.target.value)} placeholder="Jane Smith, AIA — Principal" /></label>
            <label>Country<input value={profile.country} onChange={e => update("country", e.target.value)} placeholder="United States" /></label>
            <label>Phone<input value={profile.phone} onChange={e => update("phone", e.target.value)} placeholder="+1 555 000 0000" /></label>
            <label>Website<input value={profile.website} onChange={e => update("website", e.target.value)} placeholder="https://yourfirm.com" /></label>
            <label>Years of experience<input value={profile.yearsExperience} onChange={e => update("yearsExperience", e.target.value)} placeholder="18 years" /></label>
          </div>
          <label>Office address<textarea value={profile.officeAddress} onChange={e => update("officeAddress", e.target.value)} placeholder="Street, city, state, ZIP" /></label>
          <label>Registrations and licenses<textarea value={profile.registrationsLicenses} onChange={e => update("registrationsLicenses", e.target.value)} placeholder="State registrations, professional licenses, business registrations…" /></label>
          <label>Certifications and credentials<textarea value={profile.certifications} onChange={e => update("certifications", e.target.value)} placeholder="AIA, LEED, DBE, WBE, HUBZone, etc. Only list credentials your firm actually holds." /></label>
          <label>Services / areas of expertise<textarea value={profile.services} onChange={e => update("services", e.target.value)} placeholder="Architecture&#10;Interior design&#10;Planning&#10;Historic preservation" /></label>
          <label>Municipal / public-sector experience<textarea value={profile.municipalExperience} onChange={e => update("municipalExperience", e.target.value)} placeholder="Describe verified municipal, government, education, healthcare or other public-sector experience." /></label>
          <label>Relevant project experience<textarea value={profile.projectExperience} onChange={e => update("projectExperience", e.target.value)} placeholder="List relevant completed projects, clients, locations, scopes and outcomes. One project per line or paragraph." /></label>
          <label>Team members<textarea value={profile.teamMembers} onChange={e => update("teamMembers", e.target.value)} placeholder="Name — role — credentials — relevant experience" /></label>
          <label>Availability and capacity<textarea value={profile.availabilityCapacity} onChange={e => update("availabilityCapacity", e.target.value)} placeholder="Current capacity, anticipated availability, staffing model and constraints." /></label>
          <label>Firm differentiators<textarea value={profile.differentiators} onChange={e => update("differentiators", e.target.value)} placeholder="What makes your firm particularly suited to the work? Keep this factual and supportable." /></label>
          <div className="profile-footer"><span>Your profile is private to your ArchBid account and is used to personalize proposal drafts.</span><button className="save-profile" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Firm Profile →"}</button></div>
        </div>
      </section>
    </main>
  );
}

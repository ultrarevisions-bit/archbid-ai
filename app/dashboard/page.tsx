"use client";

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { clearPendingFile, getPendingFile } from "@/lib/pending-file";
import "./dashboard.css";

type ProposalState = "unpaid" | "paid" | "ready";

type RfpRecord = {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  user_id: string;
  status: string | null;
  created_at?: string;
  updated_at?: string;
  analysis_id?: string | null;
  proposal_state?: ProposalState;
};

type AnalysisRecord = { id: string; rfp_id: string; raw_analysis?: unknown };

export default function Dashboard() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rfp, setRfp] = useState<RfpRecord | null>(null);
  const [recentRfPs, setRecentRfPs] = useState<RfpRecord[]>([]);
  const [dragging, setDragging] = useState(false);
  const [firmName, setFirmName] = useState("Your Architecture Firm");
  const [email, setEmail] = useState("");
  const [loadingUser, setLoadingUser] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingUpload, setPendingUpload] = useState(false);
  const [status, setStatus] = useState("");
  const [loadError, setLoadError] = useState("");
  const supabase = createClient();

  function mergeRfp(record: RfpRecord) {
    setRecentRfPs(current => [record, ...current.filter(item => item.id !== record.id)]);
    setRfp(current => current?.id === record.id ? record : current);
  }

  async function refreshRfpStatuses(records: RfpRecord[]): Promise<RfpRecord[]> {
    if (!records.length) return records;
    const pending = records.filter(record => record.status === "analyzing" && !record.analysis_id);
    await Promise.all(pending.map(async record => {
      try {
        const response = await fetch(`/api/analyze/status?rfpId=${encodeURIComponent(record.id)}`, { cache: "no-store" });
        const result = await response.json().catch(() => ({}));
        if (result.status === "completed" && result.analysisId) {
          record.analysis_id = result.analysisId;
          record.status = "analyzed";
        } else if (result.status === "failed") {
          record.status = "failed";
          record.analysis_id = null;
        }
      } catch (error) { console.warn("Background analysis status check failed:", error); }
    }));

    const ids = records.map(record => record.id);
    const { data: analyses, error: analysisError } = await supabase.from("rfp_analyses").select("id, rfp_id, raw_analysis").in("rfp_id", ids);
    if (analysisError) { console.warn("Analysis lookup failed:", analysisError.message); return records; }
    const completedMap = new Map<string, string>();
    ((analyses ?? []) as AnalysisRecord[]).forEach(item => {
      const raw = item.raw_analysis && typeof item.raw_analysis === "object" ? item.raw_analysis as Record<string, unknown> : {};
      const processing = raw.processing === true && typeof raw.openai_response_id === "string";
      if (!processing) completedMap.set(item.rfp_id, item.id);
    });
    return records.map(record => {
      const analysisId = record.analysis_id ?? completedMap.get(record.id) ?? null;
      return { ...record, analysis_id: analysisId, status: analysisId ? "analyzed" : record.status };
    });
  }

  async function refreshProposalStatuses(records: RfpRecord[]): Promise<RfpRecord[]> {
    const analysisIds = records.map(item => item.analysis_id).filter((id): id is string => Boolean(id));
    if (!analysisIds.length) return records;
    const [{ data: purchases, error: purchaseError }, { data: proposals, error: proposalError }] = await Promise.all([
      supabase.from("proposal_purchases").select("analysis_id, status").in("analysis_id", analysisIds).eq("status", "paid"),
      supabase.from("proposals").select("analysis_id, status").in("analysis_id", analysisIds),
    ]);
    if (purchaseError) console.warn("Proposal purchase lookup failed:", purchaseError.message);
    if (proposalError) console.warn("Proposal lookup failed:", proposalError.message);
    const paid = new Set((purchases ?? []).map(item => item.analysis_id as string));
    const ready = new Set((proposals ?? []).filter(item => item.status === "ready").map(item => item.analysis_id as string));
    return records.map(item => {
      const proposal_state: ProposalState = item.analysis_id && ready.has(item.analysis_id)
        ? "ready"
        : item.analysis_id && paid.has(item.analysis_id)
          ? "paid"
          : "unpaid";
      return { ...item, proposal_state };
    });
  }

  useEffect(() => {
    let cancelled = false;
    async function loadWorkspace() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user) { window.location.href = "/login"; return; }
        setEmail(user.email ?? "");
        const metadataFirm = user.user_metadata?.firm_name;
        if (metadataFirm) setFirmName(metadataFirm);
        const { data: firm, error: firmError } = await supabase.from("firms").select("name").eq("owner_id", user.id).maybeSingle();
        if (firmError) console.warn("Firm lookup failed:", firmError.message);
        if (firm?.name && firm.name !== "My Architecture Firm") setFirmName(firm.name);
        const { data: savedRfps, error: rfpError } = await supabase.from("rfps").select("id, file_name, file_path, file_type, user_id, status, created_at, updated_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10);
        if (rfpError) throw new Error(`Could not load saved RFPs: ${rfpError.message}`);
        let records = await refreshRfpStatuses((savedRfps ?? []) as RfpRecord[]);
        records = await refreshProposalStatuses(records);
        if (cancelled) return;
        setRecentRfPs(records);
        if (records.length) {
          setRfp(records[0]);
          setPendingUpload(false);
          const latest = records[0];
          if (latest.proposal_state === "ready") setStatus("Your latest proposal is ready. Open it from Recent RFPs.");
          else if (latest.proposal_state === "paid") setStatus("Your latest proposal has been unlocked and is ready to generate.");
          else if (latest.analysis_id) setStatus("Your latest RFP analysis is complete. You can view the report or generate a proposal.");
          else if (latest.status === "analyzing") setStatus("Your RFP is saved and is being analyzed. You can leave this page and come back later.");
          else if (latest.status === "failed") setStatus("The previous analysis did not complete. Your RFP is safely saved and can be retried.");
          else setStatus("Your RFP is saved and ready to analyze.");
        } else {
          try {
            const pending = await getPendingFile();
            if (pending && !cancelled) { setFile(pending); setPendingUpload(true); setStatus("Your uploaded RFP is still here. Save it to your workspace to continue."); }
          } catch (e) { console.error("Pending file lookup failed:", e); }
        }
      } catch (error) {
        console.error("Dashboard load error:", error);
        setLoadError(error instanceof Error ? error.message : "We could not load your saved RFPs.");
        setStatus("Your account is signed in, but we could not load the saved RFP list. Your documents have not been deleted.");
      } finally { if (!cancelled) setLoadingUser(false); }
    }
    loadWorkspace();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (loadingUser || !recentRfPs.some(item => item.status === "analyzing" && !item.analysis_id)) return;
    const timer = window.setInterval(() => {
      refreshRfpStatuses(recentRfPs).then(async updated => {
        const withProposals = await refreshProposalStatuses(updated);
        setRecentRfPs(withProposals);
      }).catch(error => console.warn("Background RFP refresh failed:", error));
    }, 10000);
    return () => window.clearInterval(timer);
  }, [loadingUser, recentRfPs]);

  // The remainder of the dashboard component remains unchanged.
}

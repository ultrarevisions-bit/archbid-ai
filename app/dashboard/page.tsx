"use client";

import {
  ChangeEvent,
  DragEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import { createClient } from "@/lib/supabase/client";
import { clearPendingFile, getPendingFile } from "@/lib/pending-file";
import "./dashboard.css";

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
};

type AnalysisRecord = {
  id: string;
  rfp_id: string;
};

export default function Dashboard() {
  console.log("🔥 ARCHBID NEW DASHBOARD CODE IS RUNNING 🔥");
  
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

  useEffect(() => {
    async function loadWorkspace() {
      try {
        /*
         * ---------------------------------------------------------
         * 1. GET CURRENT AUTHENTICATED USER
         * ---------------------------------------------------------
         */

        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        console.log("ARCHBID USER:", user);
        console.log("ARCHBID USER ID:", user?.id);
        console.log("ARCHBID USER EMAIL:", user?.email);

        if (authError) {
          console.error("ARCHBID AUTH ERROR:", authError);
          throw authError;
        }

        if (!user) {
          console.error("ARCHBID: NO AUTHENTICATED USER");
          window.location.href = "/login";
          return;
        }

        setEmail(user.email ?? "");

        /*
         * ---------------------------------------------------------
         * 2. LOAD FIRM INFORMATION
         * ---------------------------------------------------------
         */

        const metadataFirm = user.user_metadata?.firm_name;

        if (metadataFirm) {
          setFirmName(metadataFirm);
        }

        const { data: firm, error: firmError } = await supabase
          .from("firms")
          .select("name")
          .eq("owner_id", user.id)
          .maybeSingle();

        if (firmError) {
          console.warn("Firm lookup failed:", firmError.message);
        }

        if (firm?.name && firm.name !== "My Architecture Firm") {
          setFirmName(firm.name);
        }

        /*
         * ---------------------------------------------------------
         * 3. LOAD RFPs BELONGING TO THIS USER
         *
         * IMPORTANT:
         * We explicitly include user_id in the SELECT.
         * This fixes the TypeScript build error.
         * ---------------------------------------------------------
         */

        console.log("ARCHBID: Loading RFPs for user:", user.id);

        const {
          data: savedRfps,
          error: rfpError,
        } = await supabase
          .from("rfps")
          .select(
            "id, file_name, file_path, file_type, user_id, status, created_at, updated_at"
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10);

        console.log("ARCHBID RFP QUERY RESULT:", savedRfps);
        console.log("ARCHBID RFP QUERY ERROR:", rfpError);

        if (rfpError) {
          throw new Error(
            `Could not load saved RFPs: ${rfpError.message}`
          );
        }

        const records = (savedRfps ?? []) as RfpRecord[];

        console.log("ARCHBID RFP COUNT:", records.length);

        /*
         * ---------------------------------------------------------
         * 4. CHECK EACH RFP'S USER ID
         * ---------------------------------------------------------
         */

        records.forEach((record) => {
          console.log("ARCHBID RFP:", {
            id: record.id,
            file_name: record.file_name,
            user_id: record.user_id,
            current_user_id: user.id,
            status: record.status,
          });
        });

        /*
         * ---------------------------------------------------------
         * 5. LOAD ANALYSIS IDs
         * ---------------------------------------------------------
         */

        if (records.length > 0) {
          const ids = records.map((record) => record.id);

          const {
            data: analyses,
            error: analysisError,
          } = await supabase
            .from("rfp_analyses")
            .select("id, rfp_id")
            .in("rfp_id", ids);

          console.log("ARCHBID ANALYSES:", analyses);
          console.log("ARCHBID ANALYSIS ERROR:", analysisError);

          if (analysisError) {
            console.warn(
              "Analysis lookup failed:",
              analysisError.message
            );
          } else {
            const analysisMap = new Map<string, string>();

            ((analyses ?? []) as AnalysisRecord[]).forEach((item) => {
              analysisMap.set(item.rfp_id, item.id);
            });

            records.forEach((record) => {
              record.analysis_id =
                analysisMap.get(record.id) ?? null;

              if (record.analysis_id) {
                record.status = "analyzed";
              }
            });
          }
        }

        /*
         * ---------------------------------------------------------
         * 6. HANDLE STUCK ANALYSES
         * ---------------------------------------------------------
         */

        if (records.length) {
          for (const record of records) {
            if (
              record.status === "analyzing" &&
              !record.analysis_id &&
              record.updated_at
            ) {
              const ageMs =
                Date.now() -
                new Date(record.updated_at).getTime();

              if (ageMs > 2 * 60 * 1000) {
                await supabase
                  .from("rfps")
                  .update({
                    status: "failed",
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", record.id)
                  .eq("user_id", user.id);

                record.status = "failed";
                record.updated_at =
                  new Date().toISOString();
              }
            }
          }

          /*
           * -------------------------------------------------------
           * 7. SHOW SAVED RFPs
           * -------------------------------------------------------
           */

          setRecentRfPs(records);

          /*
           * The newest RFP is displayed as the current RFP.
           */

          setRfp(records[0]);

          setPendingUpload(false);

          const latest = records[0];

          if (latest.analysis_id) {
            setStatus(
              "Your latest RFP analysis is saved. Open the report below or analyze another RFP."
            );
          } else if (latest.status === "analyzing") {
            setStatus(
              "ArchBid is still processing this RFP. If it has been stuck for more than two minutes, refresh again and retry."
            );
          } else if (latest.status === "failed") {
            setStatus(
              "The previous analysis did not complete. Your RFP is safely saved. Click Retry analysis to run it again."
            );
          } else {
            setStatus(
              "Your RFP is saved and ready to analyze."
            );
          }
        } else {
          /*
           * -------------------------------------------------------
           * 8. NO SAVED RFPs
           *
           * Check for a pending browser upload.
           * -------------------------------------------------------
           */

          console.log(
            "ARCHBID: No saved RFPs found for this user."
          );

          try {
            const pending = await getPendingFile();

            if (pending) {
              setFile(pending);
              setPendingUpload(true);

              setStatus(
                "Your uploaded RFP is still here. Save it to your workspace to continue."
              );
            }
          } catch (e) {
            console.error(
              "Pending file lookup failed:",
              e
            );
          }
        }
      } catch (error) {
        console.error("Dashboard load error:", error);

        setLoadError(
          error instanceof Error
            ? error.message
            : "We could not load your saved RFPs."
        );

        setStatus(
          "Your account is signed in, but we could not load the saved RFP list. Your documents have not been deleted."
        );
      } finally {
        setLoadingUser(false);
      }
    }

    loadWorkspace();
  }, []);

  /*
   * -------------------------------------------------------------
   * FILE SELECTION
   * -------------------------------------------------------------
   */

  function chooseFile(selected: File | undefined) {
    if (!selected) return;

    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
    ];

    if (
      !allowed.includes(selected.type) &&
      !/\.(pdf|doc|docx)$/i.test(selected.name)
    ) {
      setStatus(
        "Please upload a PDF, DOC, or DOCX file."
      );
      return;
    }

    if (selected.size > 25 * 1024 * 1024) {
      setStatus(
        "Please upload a file smaller than 25MB."
      );
      return;
    }

    setFile(selected);
    setRfp(null);
    setPendingUpload(true);

    setStatus(
      "RFP selected. Click Save & analyze to continue."
    );
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);

    chooseFile(
      event.dataTransfer.files?.[0]
    );
  }

  function onInput(
    event: ChangeEvent<HTMLInputElement>
  ) {
    chooseFile(event.target.files?.[0]);
  }

  /*
   * -------------------------------------------------------------
   * SAVE RFP
   * -------------------------------------------------------------
   */

  async function saveRfpIfNeeded(
    userId: string
  ): Promise<RfpRecord> {
    if (rfp && !file) {
      return rfp;
    }

    if (!file) {
      throw new Error(
        "Please select an RFP first."
      );
    }

    const safeName = file.name.replace(
      /[^a-zA-Z0-9._-]/g,
      "-"
    );

    const path = `${userId}/${crypto.randomUUID()}-${safeName}`;

    /*
     * Upload file to Supabase Storage.
     */

    const {
      error: storageError,
    } = await supabase.storage
      .from("rfps")
      .upload(path, file, {
        upsert: false,
      });

    if (storageError) {
      throw storageError;
    }

    /*
     * Create database record.
     */

    const {
      data: inserted,
      error: rfpError,
    } = await supabase
      .from("rfps")
      .insert({
        user_id: userId,
        file_name: file.name,
        file_path: path,
        file_type:
          file.type ||
          "application/octet-stream",
        status: "uploaded",
      })
      .select(
        "id, file_name, file_path, file_type, user_id, status, created_at, updated_at"
      )
      .single();

    if (rfpError || !inserted) {
      throw (
        rfpError ||
        new Error(
          "We could not create the RFP record."
        )
      );
    }

    await clearPendingFile();

    setFile(null);
    setPendingUpload(false);

    setRfp(inserted as RfpRecord);

    return inserted as RfpRecord;
  }

  /*
   * -------------------------------------------------------------
   * ANALYZE RFP
   * -------------------------------------------------------------
   */

  async function analyzeRfp() {
    if (busy) return;

    setBusy(true);

    setStatus(
      "Saving your RFP securely…"
    );

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const saved =
        await saveRfpIfNeeded(user.id);

      const analyzingRecord: RfpRecord = {
        ...saved,
        status: "analyzing",
        updated_at:
          new Date().toISOString(),
      };

      setRfp(analyzingRecord);

      setStatus(
        "Analyzing your RFP… ArchBid is extracting the document text and evaluating the bid intelligence. Please keep this page open."
      );

      const controller =
        new AbortController();

      const timeout =
        window.setTimeout(
          () => controller.abort(),
          55000
        );

      try {
        const response = await fetch(
          "/api/analyze",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              rfpId: saved.id,
            }),
            signal: controller.signal,
          }
        );

        const result =
          await response
            .json()
            .catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            result.error ||
              "Analysis failed. Please try again."
          );
        }

        setRfp({
          ...saved,
          status: "analyzed",
          updated_at:
            new Date().toISOString(),
          analysis_id:
            result.analysisId,
        });

        setStatus(
          "Analysis complete. Your RFP intelligence report has been saved."
        );

        window.location.href =
          `/results/${saved.id}`;
      } finally {
        window.clearTimeout(timeout);
      }
    } catch (error) {
      console.error(error);

      if (
        error instanceof DOMException &&
        error.name === "AbortError"
      ) {
        setStatus(
          "The analysis timed out before completing. Your RFP is saved. Refresh the dashboard and retry."
        );
      } else {
        setStatus(
          error instanceof Error
            ? error.message
            : "We could not analyze your RFP. Your document is still saved."
        );
      }

      setRfp((current) =>
        current
          ? {
              ...current,
              status: "failed",
              updated_at:
                new Date().toISOString(),
            }
          : current
      );
    } finally {
      setBusy(false);
    }
  }

  /*
   * -------------------------------------------------------------
   * SIGN OUT
   * -------------------------------------------------------------
   */

  async function signOut() {
    await supabase.auth.signOut();

    window.location.href = "/";
  }

  /*
   * -------------------------------------------------------------
   * LOADING SCREEN
   * -------------------------------------------------------------
   */

  if (loadingUser) {
    return (
      <main className="dashboard loading-screen">
        Loading your ArchBid workspace…
      </main>
    );
  }

  /*
   * -------------------------------------------------------------
   * DISPLAY VALUES
   * -------------------------------------------------------------
   */

  const displayName =
    rfp?.file_name ||
    file?.name ||
    "Drop your RFP here";

  const fileSize = file
    ? `${(
        file.size /
        1024 /
        1024
      ).toFixed(1)} MB`
    : "";

  const isAnalyzing =
    rfp?.status === "analyzing" ||
    busy;

  /*
   * -------------------------------------------------------------
   * DASHBOARD UI
   * -------------------------------------------------------------
   */

  return (
    <main className="dashboard">
      <nav className="nav container">
        <a
          className="brand"
          href="/"
        >
          <span className="brand-mark">
            A
          </span>

          ArchBid{" "}
          <span className="brand-ai">
            AI
          </span>
        </a>

        <div className="account-area">
          <div className="account-avatar">
            {firmName
              .slice(0, 2)
              .toUpperCase()}
          </div>

          <div className="account-info">
            <strong>
              {firmName}
            </strong>

            <span>
              {email}
            </span>
          </div>

          <button
            className="signout-button"
            onClick={signOut}
          >
            Sign out
          </button>
        </div>
      </nav>

      <section className="container dash-content">
        <div className="welcome-row">
          <div>
            <div className="section-label">
              RFP ANALYZER
            </div>

            <h1>
              Welcome, {firmName}
            </h1>

            <p className="dash-copy">
              Upload an RFP or tender
              document. ArchBid will
              extract the information
              needed to decide whether
              your firm should pursue it.
            </p>
          </div>
        </div>

        <div
          className={`upload ${
            dragging ? "dragging" : ""
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() =>
            setDragging(false)
          }
          onDrop={onDrop}
          onClick={() =>
            input.current?.click()
          }
        >
          <input
            ref={input}
            type="file"
            accept=".pdf,.doc,.docx"
            hidden
            onChange={onInput}
          />

          <div className="upload-icon">
            {isAnalyzing
              ? "✦"
              : "↑"}
          </div>

          <h2>
            {displayName}
          </h2>

          <p>
            {file
              ? `${fileSize} · Ready`
              : rfp
              ? `${
                  rfp.status ===
                  "analyzing"
                    ? "Analysis in progress"
                    : rfp.analysis_id
                    ? "Analysis complete"
                    : rfp.status ===
                      "failed"
                    ? "Ready to retry"
                    : "Saved"
                }`
              : "or click to browse · PDF, DOCX up to 25MB"}
          </p>
        </div>

        <button
          className="analyze-button"
          disabled={
            isAnalyzing ||
            (!file && !rfp)
          }
          onClick={analyzeRfp}
        >
          {isAnalyzing
            ? "Analyzing your RFP…"
            : rfp?.analysis_id
            ? "View saved analysis →"
            : rfp?.status ===
              "failed"
            ? "Retry analysis →"
            : pendingUpload
            ? "Save & analyze RFP →"
            : "Analyze RFP →"}
        </button>

        {rfp?.analysis_id &&
          !isAnalyzing && (
            <button
              className="analyze-button"
              onClick={() => {
                window.location.href =
                  `/results/${rfp.id}`;
              }}
            >
              Open RFP intelligence
              report →
            </button>
          )}

        {loadError && (
          <div className="status-message">
            {loadError}
          </div>
        )}

        {status && (
          <div className="status-message">
            {status}
          </div>
        )}

        {recentRfPs.length > 1 && (
          <div
            className="demo-note"
            style={{
              marginTop: "18px",
            }}
          >
            <strong>
              Recent RFPs
            </strong>

            <div
              style={{
                marginTop: "10px",
              }}
            >
              {recentRfPs.map(
                (item) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      justifyContent:
                        "space-between",
                      gap: "12px",
                      padding:
                        "8px 0",
                      borderTop:
                        "1px solid rgba(20,30,50,.08)",
                    }}
                  >
                    <span>
                      {
                        item.file_name
                      }
                    </span>

                    {item.analysis_id ? (
                      <a
                        href={`/results/${item.id}`}
                      >
                        View report →
                      </a>
                    ) : (
                      <span>
                        {item.status ||
                          "saved"}
                      </span>
                    )}
                  </div>
                )
              )}
            </div>
          </div>
        )}

        <div className="demo-note">
          <strong>
            What you'll get:
          </strong>{" "}
          opportunity score ·
          go/no-go recommendation ·
          deadline · requirements ·
          evaluation criteria ·
          submission checklist · risks
        </div>
      </section>
    </main>
  );
}

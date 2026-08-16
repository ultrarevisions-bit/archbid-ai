"use client";

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { clearPendingFile, getPendingFile } from "@/lib/pending-file";
import "./dashboard.css";

type RfpRecord = {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
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
        console.log("========================================");
        console.log("ARCHBID DASHBOARD: STARTING WORKSPACE LOAD");
        console.log("========================================");

        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        console.log("ARCHBID AUTH USER:", user);
        console.log("ARCHBID AUTH USER ID:", user?.id);
        console.log("ARCHBID AUTH EMAIL:", user?.email);
        console.log("ARCHBID AUTH ERROR:", authError);

        /*
         * AUTH TEST
         *
         * This is only for debugging.
         * It lets us confirm that Supabase sees the currently
         * logged-in user correctly.
         */
        const {
          data: authTest,
          error: authTestError,
        } = await supabase.rpc("test_archbid_auth");

        console.log("ARCHBID AUTH TEST:", authTest);
        console.log("ARCHBID AUTH TEST ERROR:", authTestError);

        if (authError) {
          throw authError;
        }

        if (!user) {
          console.error("ARCHBID: NO AUTHENTICATED USER FOUND");
          window.location.href = "/login";
          return;
        }

        setEmail(user.email ?? "");

        const metadataFirm = user.user_metadata?.firm_name;

        if (metadataFirm) {
          setFirmName(metadataFirm);
        }

        /*
         * LOAD FIRM
         */
        const { data: firm, error: firmError } = await supabase
          .from("firms")
          .select("name")
          .eq("owner_id", user.id)
          .maybeSingle();

        console.log("ARCHBID FIRM RESULT:", firm);
        console.log("ARCHBID FIRM ERROR:", firmError);

        if (firmError) {
          console.warn("Firm lookup failed:", firmError.message);
        }

        if (firm?.name && firm.name !== "My Architecture Firm") {
          setFirmName(firm.name);
        }

        /*
         * ======================================================
         * LOAD SAVED RFPs
         * ======================================================
         *
         * IMPORTANT:
         * We are specifically checking the RFPs belonging to
         * the currently authenticated Supabase user.
         */

        console.log("========================================");
        console.log("ARCHBID RFP DEBUG");
        console.log("========================================");
        console.log("ARCHBID: About to load RFPs");
        console.log("ARCHBID: Current user ID:", user.id);
        console.log("ARCHBID: Current user email:", user.email);

        const { data: savedRfps, error: rfpError } = await supabase
          .from("rfps")
          .select(
            "id, file_name, file_path, file_type, status, created_at, updated_at"
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10);

        /*
         * VERY IMPORTANT DEBUG OUTPUT
         */
        console.log("ARCHBID: RFP QUERY ERROR:", rfpError);
        console.log("ARCHBID: RFP QUERY RESULT:", savedRfps);
        console.log(
          "ARCHBID: RFP COUNT:",
          savedRfps?.length ?? 0
        );

        if (savedRfps && savedRfps.length > 0) {
          console.log("ARCHBID: RFP FILES RETURNED:");

          savedRfps.forEach((item, index) => {
            console.log(`RFP ${index + 1}:`, {
              id: item.id,
              file_name: item.file_name,
              user_id: item.user_id,
              status: item.status,
              created_at: item.created_at,
            });
          });
        } else {
          console.warn(
            "ARCHBID: SUPABASE RETURNED ZERO RFPs FOR THIS USER."
          );
        }

        console.log("========================================");

        if (rfpError) {
          throw new Error(
            `Could not load saved RFPs: ${rfpError.message}`
          );
        }

        const records = (savedRfps ?? []) as RfpRecord[];

        console.log("ARCHBID: RFP RECORDS AFTER CAST:", records);

        /*
         * ======================================================
         * LOAD ANALYSES
         * ======================================================
         */

        if (records.length) {
          const ids = records.map((record) => record.id);

          console.log("ARCHBID: Looking for analyses for RFP IDs:", ids);

          const {
            data: analyses,
            error: analysisError,
          } = await supabase
            .from("rfp_analyses")
            .select("id, rfp_id")
            .in("rfp_id", ids);

          console.log(
            "ARCHBID: ANALYSIS QUERY RESULT:",
            analyses
          );

          console.log(
            "ARCHBID: ANALYSIS QUERY ERROR:",
            analysisError
          );

          if (analysisError) {
            console.warn(
              "Analysis lookup failed:",
              analysisError.message
            );
          } else {
            const analysisMap = new Map<string, string>();

            ((analyses ?? []) as AnalysisRecord[]).forEach(
              (item) => {
                analysisMap.set(item.rfp_id, item.id);
              }
            );

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
         * ======================================================
         * HANDLE STUCK ANALYSES
         * ======================================================
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
           * ======================================================
           * FINAL DASHBOARD RECORDS
           * ======================================================
           */

          console.log("========================================");
          console.log("ARCHBID FINAL DASHBOARD RFP RECORDS");
          console.log("========================================");
          console.log(records);
          console.log("Total records:", records.length);
          console.log("Latest record:", records[0]);
          console.log("========================================");

          setRecentRfPs(records);
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
          console.warn(
            "ARCHBID: No saved RFPs found. Checking pending browser file..."
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
              "ARCHBID: Pending file lookup failed:",
              e
            );
          }
        }
      } catch (error) {
        console.error(
          "ARCHBID DASHBOARD LOAD ERROR:",
          error
        );

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

        console.log(
          "ARCHBID DASHBOARD: WORKSPACE LOAD FINISHED"
        );
      }
    }

    loadWorkspace();
  }, []);

  /*
   * ============================================================
   * FILE SELECTION
   * ============================================================
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
      return setStatus(
        "Please upload a PDF, DOC, or DOCX file."
      );
    }

    if (selected.size > 25 * 1024 * 1024) {
      return setStatus(
        "Please upload a file smaller than 25MB."
      );
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
   * ============================================================
   * SAVE RFP
   * ============================================================
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

    console.log(
      "ARCHBID: Uploading file to storage:",
      path
    );

    const {
      error: storageError,
    } = await supabase.storage
      .from("rfps")
      .upload(
        path,
        file,
        { upsert: false }
      );

    if (storageError) {
      console.error(
        "ARCHBID STORAGE ERROR:",
        storageError
      );

      throw storageError;
    }

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
        "id, file_name, file_path, file_type, status, created_at, updated_at"
      )
      .single();

    console.log(
      "ARCHBID: INSERTED RFP:",
      inserted
    );

    console.log(
      "ARCHBID: INSERT RFP ERROR:",
      rfpError
    );

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
   * ============================================================
   * ANALYZE RFP
   * ============================================================
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

      console.log(
        "ARCHBID ANALYZE USER:",
        user
      );

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const saved =
        await saveRfpIfNeeded(user.id);

      const analyzingRecord = {
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
        console.log(
          "ARCHBID: Starting analysis for RFP:",
          saved.id
        );

        const response =
          await fetch(
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
              signal:
                controller.signal,
            }
          );

        const result =
          await response
            .json()
            .catch(() => ({}));

        console.log(
          "ARCHBID ANALYSIS RESPONSE:",
          result
        );

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
      console.error(
        "ARCHBID ANALYSIS ERROR:",
        error
      );

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
   * ============================================================
   * SIGN OUT
   * ============================================================
   */

  async function signOut() {
    await supabase.auth.signOut();

    window.location.href = "/";
  }

  /*
   * ============================================================
   * LOADING SCREEN
   * ============================================================
   */

  if (loadingUser) {
    return (
      <main className="dashboard loading-screen">
        Loading your ArchBid workspace…
      </main>
    );
  }

  /*
   * ============================================================
   * DISPLAY VARIABLES
   * ============================================================
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

  const hasSavedRfp =
    Boolean(rfp);

  /*
   * ============================================================
   * DASHBOARD UI
   * ============================================================
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
          </span>{" "}
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
            dragging
              ? "dragging"
              : ""
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
            : rfp?.status === "failed"
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
                  `/results/${rfp.analysis_id}`;
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
                      display:
                        "flex",
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
                      {item.file_name}
                    </span>

                    {item.analysis_id ? (
                      <a
                        href={`/results/${item.analysis_id}`}
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

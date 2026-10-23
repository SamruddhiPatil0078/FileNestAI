import React, { useState } from "react";
import {
  Bot,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  CheckCircle,
  Cpu,
  Layers,
  FileText,
  AlertTriangle,
  Check,
  X,
  Edit2,
  RotateCcw,
  RefreshCw,
  Copy,
} from "lucide-react";
import { getOrganizationSuggestions, executeOrganizationPlan } from "../api";
import { formatBytes } from "../utils/formatters";
import ConfirmModal from "../components/ConfirmModal";

export default function AssistantPage({
  scanData,
  analysisData,
  selectedFolder,
  onNotify,
  onRefreshAll,
  onNavigate,
}) {
  const [organizationMode, setOrganizationMode] = useState("inside");
  const [suggestionsResult, setSuggestionsResult] = useState(null);
  const [planItems, setPlanItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [executionResult, setExecutionResult] = useState(null);
  const [copiedPath, setCopiedPath] = useState("");

  async function handleGeneratePlan() {
    setIsLoading(true);
    setError("");
    setSuggestionsResult(null);
    setPlanItems([]);
    setExecutionResult(null);

    try {
      const res = await getOrganizationSuggestions(selectedFolder, organizationMode);
      setSuggestionsResult(res);

      const items = (res.suggestions || []).map((sug, idx) => ({
        id: `plan-${idx}`,
        source_path: sug.source_path || sug.file_path,
        filename: sug.filename || sug.suggested_filename || sug.source_path?.split(/[\\/]/).pop(),
        category: sug.category || "General",
        destination_folder: sug.destination_folder || "Unorganized",
        destination_path: sug.destination_path || "",
        reason: sug.reason || "Classified for organization",
        method: sug.method || res.method || "rule-based",
        size_bytes: sug.size_bytes || 0,
        eligible: sug.eligible !== false,
        approved: sug.eligible !== false,
        isEditing: false,
      }));

      setPlanItems(items);
      onNotify({
        type: "success",
        message: `Generated plan with ${items.length} proposed moves (${res.method === "ai" ? "AI" : "Rules"}).`,
      });
    } catch (err) {
      setError(err.message || "Failed to generate organization plan.");
      onNotify({
        type: "error",
        message: err.message || "Could not generate organization plan.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  function toggleApprove(index) {
    setPlanItems((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, approved: !item.approved } : item
      )
    );
  }

  function handleSelectAll(approve) {
    setPlanItems((prev) =>
      prev.map((item) => (item.eligible ? { ...item, approved: approve } : item))
    );
  }

  function handleUpdateDestination(index, newFolder) {
    const trimmed = newFolder.trim().replace(/[\\/]/g, "");
    if (!trimmed) return;

    setPlanItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const separator = selectedFolder.includes("/") ? "/" : "\\";
        const newDestPath = `${selectedFolder}${separator}${trimmed}${separator}${item.filename}`;
        return {
          ...item,
          destination_folder: trimmed,
          destination_path: newDestPath,
          isEditing: false,
        };
      })
    );
  }

  function toggleEditing(index) {
    setPlanItems((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, isEditing: !item.isEditing } : item
      )
    );
  }

  function handleCopyPath(path) {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(""), 2000);
  }

  async function handleExecuteApprovedPlan() {
    const approvedMoves = planItems
      .filter((item) => item.approved && item.eligible)
      .map((item) => ({
        source_path: item.source_path,
        destination_path: item.destination_path,
        approved: true,
      }));

    if (approvedMoves.length === 0) {
      onNotify({ type: "error", message: "No moves are selected for execution." });
      setShowConfirmModal(false);
      return;
    }

    setIsExecuting(true);
    try {
      const res = await executeOrganizationPlan({
        plan: approvedMoves,
        allowedRoot: selectedFolder,
        approved: true,
      });

      setExecutionResult(res);
      setShowConfirmModal(false);

      onNotify({
        type: "success",
        message: `Successfully executed ${res.successful_moves || 0} moves (${res.failed_moves || 0} failed).`,
      });

      if (onRefreshAll) {
        onRefreshAll();
      }
    } catch (err) {
      onNotify({
        type: "error",
        message: err.message || "Failed to execute organization plan.",
      });
    } finally {
      setIsExecuting(false);
    }
  }

  const approvedCount = planItems.filter((i) => i.approved && i.eligible).length;
  const eligibleCount = planItems.filter((i) => i.eligible).length;
  const totalApprovedBytes = planItems
    .filter((i) => i.approved && i.eligible)
    .reduce((acc, curr) => acc + (curr.size_bytes || 0), 0);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">AI Storage Assistant</h1>
          <p className="page-description">
            Intelligent recommendations to organize clutter, sort unorganized files, and optimize storage structure.
          </p>
        </div>
      </div>

      {/* Local-First Privacy Assurance */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          backgroundColor: "#F0FDF4",
          border: "1px solid #BBF7D0",
          borderRadius: "var(--radius-md)",
          padding: "12px 18px",
          marginBottom: "24px",
          fontSize: "13px",
          color: "#166534",
        }}
      >
        <ShieldCheck size={18} className="text-success" style={{ flexShrink: 0 }} />
        <div>
          <strong>100% Local-First & Safe:</strong> File contents are never uploaded to any external cloud service.
          Reasoning uses local Gemma 3 1B via Ollama with automatic deterministic rule fallback. Every proposed operation requires your explicit approval before execution.
        </div>
      </div>

      {/* Mode Selection Card */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <Layers size={16} className="text-primary" />
            File Organization Strategy
          </span>
        </div>
        <div className="card-body">
          <p style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "16px" }}>
            Choose how FileNest AI should group and organize unorganized files inside <strong>{selectedFolder || "workspace"}</strong>:
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
            {/* Option A */}
            <label
              style={{
                display: "flex",
                gap: "12px",
                padding: "16px",
                border: `2px solid ${organizationMode === "inside" ? "var(--primary)" : "var(--border-color)"}`,
                borderRadius: "var(--radius-md)",
                backgroundColor: organizationMode === "inside" ? "var(--primary-light)" : "var(--bg-surface)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <input
                type="radio"
                name="orgMode"
                value="inside"
                checked={organizationMode === "inside"}
                onChange={() => setOrganizationMode("inside")}
                style={{ marginTop: "3px" }}
              />
              <div>
                <strong style={{ display: "block", fontSize: "14px", color: "var(--text-main)" }}>
                  Option A — Organize Inside Subfolders
                </strong>
                <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                  Group files into organized subfolders directly within the selected target. Existing subfolders are reused or new ones proposed.
                </p>
              </div>
            </label>

            {/* Option B */}
            <label
              style={{
                display: "flex",
                gap: "12px",
                padding: "16px",
                border: `2px solid ${organizationMode === "general" ? "var(--primary)" : "var(--border-color)"}`,
                borderRadius: "var(--radius-md)",
                backgroundColor: organizationMode === "general" ? "var(--primary-light)" : "var(--bg-surface)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <input
                type="radio"
                name="orgMode"
                value="general"
                checked={organizationMode === "general"}
                onChange={() => setOrganizationMode("general")}
                style={{ marginTop: "3px" }}
              />
              <div>
                <strong style={{ display: "block", fontSize: "14px", color: "var(--text-main)" }}>
                  Option B — Organize into General Categories
                </strong>
                <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                  Sort files into standard top-level categories (Documents, Images, Videos, Audio, Archives, Code, Other) within the workspace.
                </p>
              </div>
            </label>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleGeneratePlan}
              disabled={isLoading || !selectedFolder}
            >
              <Sparkles size={16} />
              <span>{isLoading ? "Analyzing & Generating Plan..." : "Generate Organization Plan"}</span>
            </button>

            {planItems.length > 0 && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setSuggestionsResult(null);
                  setPlanItems([]);
                  setExecutionResult(null);
                }}
              >
                Reset Plan
              </button>
            )}
          </div>

          {error && (
            <div style={{ marginTop: "12px", color: "var(--danger)", fontSize: "13px" }}>
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Execution Results Banner */}
      {executionResult && (
        <div
          style={{
            backgroundColor: "#F0FDF4",
            border: "1px solid #BBF7D0",
            borderRadius: "var(--radius-md)",
            padding: "16px 20px",
            marginBottom: "24px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
            <CheckCircle size={20} className="text-success" />
            <strong style={{ fontSize: "15px", color: "#166534" }}>
              Plan Execution Completed!
            </strong>
          </div>
          <p style={{ fontSize: "13px", color: "#166534", margin: 0 }}>
            Successfully relocated <strong>{executionResult.successful_moves || 0} files</strong>.{" "}
            {executionResult.failed_moves > 0 && (
              <span style={{ color: "var(--danger)" }}>
                ({executionResult.failed_moves} moves failed or skipped due to collisions/protection).
              </span>
            )}
            {" "}All operations are safely logged in the audit ledger and can be reversed via Activity History & Undo.
          </p>
          <div style={{ marginTop: "12px", display: "flex", gap: "10px" }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onRefreshAll && onRefreshAll()}
            >
              <RefreshCw size={13} />
              <span>Refresh Inventory</span>
            </button>
            {onNavigate && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onNavigate("history")}
              >
                View Activity History
              </button>
            )}
          </div>
        </div>
      )}

      {/* Plan Review & Action Card */}
      {suggestionsResult && (
        <div className="card">
          <div className="card-header" style={{ flexWrap: "wrap", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span className="card-title">
                <Sparkles size={16} className="text-warning" />
                Proposed Organization Plan ({planItems.length} Files)
              </span>
              <span className={`badge ${suggestionsResult.method === "ai" ? "badge-primary" : "badge-neutral"}`}>
                <Cpu size={12} style={{ marginRight: "4px" }} />
                {suggestionsResult.method === "ai" ? "AI Generated (Gemma 3)" : "Deterministic Extension Rules"}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handleSelectAll(true)}
              >
                Select All
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handleSelectAll(false)}
              >
                Deselect All
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowConfirmModal(true)}
                disabled={approvedCount === 0 || isExecuting}
              >
                <ArrowRight size={14} />
                <span>Execute Approved Moves ({approvedCount})</span>
              </button>
            </div>
          </div>

          {/* Notice banner */}
          <div
            style={{
              padding: "10px 20px",
              backgroundColor: "#F8FAFC",
              borderBottom: "1px solid var(--border-light)",
              fontSize: "12px",
              color: "var(--text-muted)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>{suggestionsResult.notice}</span>
            <span>
              Selected: <strong>{approvedCount}</strong> of {eligibleCount} eligible ({formatBytes(totalApprovedBytes)})
            </span>
          </div>

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: "40px", textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={approvedCount > 0 && approvedCount === eligibleCount}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      title="Select / Deselect All Eligible"
                    />
                  </th>
                  <th>Source File</th>
                  <th>Proposed Destination</th>
                  <th>Classification Reason</th>
                  <th>Method</th>
                  <th>Size</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {planItems.length > 0 ? (
                  planItems.map((item, idx) => (
                    <tr
                      key={`plan-row-${item.source_path}-${idx}`}
                      style={{
                        backgroundColor: item.approved ? "rgba(59, 130, 246, 0.02)" : "transparent",
                        opacity: item.eligible ? 1 : 0.6,
                      }}
                    >
                      <td style={{ textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={item.approved}
                          disabled={!item.eligible}
                          onChange={() => toggleApprove(idx)}
                        />
                      </td>

                      <td>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                          <FileText size={16} className="text-primary" style={{ flexShrink: 0, marginTop: "2px" }} />
                          <div>
                            <strong style={{ color: "var(--text-main)", display: "block" }}>
                              {item.filename}
                            </strong>
                            <div
                              style={{
                                fontSize: "11px",
                                color: "var(--text-subtle)",
                                maxWidth: "280px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                              title={item.source_path}
                            >
                              {item.source_path}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="copy-btn"
                            onClick={() => handleCopyPath(item.source_path)}
                            title="Copy source path"
                            style={{ marginLeft: "4px" }}
                          >
                            {copiedPath === item.source_path ? (
                              <Check size={11} className="text-success" />
                            ) : (
                              <Copy size={11} />
                            )}
                          </button>
                        </div>
                      </td>

                      <td>
                        {item.isEditing ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <input
                              type="text"
                              defaultValue={item.destination_folder}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleUpdateDestination(idx, e.target.value);
                                if (e.key === "Escape") toggleEditing(idx);
                              }}
                              onBlur={(e) => handleUpdateDestination(idx, e.target.value)}
                              autoFocus
                              style={{
                                padding: "4px 8px",
                                fontSize: "12px",
                                border: "1px solid var(--primary)",
                                borderRadius: "4px",
                                width: "120px",
                              }}
                            />
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              style={{ padding: "2px 6px" }}
                              onClick={() => toggleEditing(idx)}
                            >
                              <Check size={12} />
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span className="badge badge-primary">{item.destination_folder}</span>
                            <button
                              type="button"
                              className="copy-btn"
                              onClick={() => toggleEditing(idx)}
                              title="Edit destination folder"
                            >
                              <Edit2 size={11} />
                            </button>
                          </div>
                        )}
                      </td>

                      <td style={{ fontSize: "12px", color: "var(--text-muted)", maxWidth: "260px" }}>
                        {item.reason}
                      </td>

                      <td>
                        <span className={`badge ${item.method === "ai" ? "badge-primary" : "badge-neutral"}`} style={{ fontSize: "11px" }}>
                          {item.method === "ai" ? "AI" : "Rule"}
                        </span>
                      </td>

                      <td style={{ fontSize: "12px", fontWeight: 500, whiteSpace: "nowrap" }}>
                        {formatBytes(item.size_bytes)}
                      </td>

                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {item.eligible ? (
                          <button
                            type="button"
                            className={`btn btn-sm ${item.approved ? "btn-secondary" : "btn-primary"}`}
                            onClick={() => toggleApprove(idx)}
                            style={{ minWidth: "75px" }}
                          >
                            {item.approved ? "Reject" : "Approve"}
                          </button>
                        ) : (
                          <span className="badge badge-warning" title="Protected file or folder">
                            Protected
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "36px" }}>
                      <div className="empty-state" style={{ padding: 0 }}>
                        <CheckCircle size={32} className="text-success" style={{ margin: "0 auto 8px auto" }} />
                        <span className="empty-state-title">Files Already Organized</span>
                        <p className="empty-state-desc" style={{ marginBottom: 0 }}>
                          All files are already organized in their destination categories or subfolders.
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Footer action bar */}
          {planItems.length > 0 && (
            <div
              style={{
                padding: "16px 20px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderTop: "1px solid var(--border-color)",
                backgroundColor: "var(--bg-surface)",
              }}
            >
              <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                Selected moves: <strong>{approvedCount}</strong> ({formatBytes(totalApprovedBytes)})
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setSuggestionsResult(null);
                    setPlanItems([]);
                  }}
                >
                  Cancel Plan
                </button>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setShowConfirmModal(true)}
                  disabled={approvedCount === 0 || isExecuting}
                >
                  <ArrowRight size={15} />
                  <span>Execute Approved Plan ({approvedCount})</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={showConfirmModal}
        title="Execute Approved Organization Plan?"
        message={`This operation will physically move ${approvedCount} file${approvedCount > 1 ? "s" : ""} into categorized subfolders within "${selectedFolder}". All destination folders will be safely created if they do not exist. Any move can be safely undone via Activity History.`}
        confirmText={`Confirm & Move ${approvedCount} Files`}
        confirmVariant="primary"
        isLoading={isExecuting}
        onConfirm={handleExecuteApprovedPlan}
        onCancel={() => setShowConfirmModal(false)}
      />
    </div>
  );
}

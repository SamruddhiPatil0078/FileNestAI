import React, { useState, useMemo } from "react";
import {
  Sparkles,
  Shield,
  ShieldCheck,
  Search,
  CheckCircle,
  File,
  X,
  ArchiveRestore,
  AlertTriangle,
  Info,
  CheckSquare,
  Square,
  Copy,
} from "lucide-react";
import { formatBytes } from "../utils/formatters";
import { protectPath, executeCleanupActions } from "../api";
import ConfirmModal from "../components/ConfirmModal";

export default function CleanupPage({
  cleanupData,
  analysisData,
  onProtectSuccess,
  onExecuteSuccess,
  onNotify,
  selectedFolder,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  // Selection state: set of file paths selected for quarantine
  const [selectedPaths, setSelectedPaths] = useState(new Set());
  const [selectedFileForReview, setSelectedFileForReview] = useState(null);

  // Execution & Confirmation modal state
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionSummary, setExecutionSummary] = useState(null);

  const suggestions = cleanupData?.suggestions || [];
  const duplicateGroups = analysisData?.duplicate_groups || [];

  // Filtered suggestions
  const filteredSuggestions = useMemo(() => {
    return suggestions.filter((item) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const nameMatch = item.name.toLowerCase().includes(q);
        const pathMatch = item.path.toLowerCase().includes(q);
        if (!nameMatch && !pathMatch) return false;
      }

      if (categoryFilter !== "all" && item.category !== categoryFilter) {
        return false;
      }

      if (priorityFilter !== "all" && item.priority !== priorityFilter) {
        return false;
      }

      return true;
    });
  }, [suggestions, searchQuery, categoryFilter, priorityFilter]);

  // Toggle selection for a single file
  function toggleSelection(filePath) {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  }

  // Select all filtered eligible items
  function handleSelectAll() {
    if (selectedPaths.size === filteredSuggestions.length && filteredSuggestions.length > 0) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(filteredSuggestions.map((s) => s.path)));
    }
  }

  // Calculate estimated reclaimable space for current selection
  const selectedBytes = useMemo(() => {
    return suggestions
      .filter((s) => selectedPaths.has(s.path))
      .reduce((sum, s) => sum + (s.size_bytes || 0), 0);
  }, [suggestions, selectedPaths]);

  // Execute Quarantine on Selected Files
  async function handleConfirmExecution() {
    if (selectedPaths.size === 0) return;

    setIsExecuting(true);
    setExecutionSummary(null);

    const itemsToQuarantine = Array.from(selectedPaths).map((p) => {
      const match = suggestions.find((s) => s.path === p);
      return {
        path: p,
        action: "quarantine",
        reason: match ? match.reasons.join("; ") : "Smart cleanup quarantine",
      };
    });

    try {
      const res = await executeCleanupActions({
        items: itemsToQuarantine,
        allowedRoot: selectedFolder,
        approved: true,
      });

      setExecutionSummary(res);
      setSelectedPaths(new Set());
      setIsConfirmOpen(false);

      onNotify({
        type: "success",
        message: `Successfully quarantined ${res.total_processed} files (${formatBytes(res.reclaimed_bytes)} reclaimed).`,
      });

      if (onExecuteSuccess) {
        onExecuteSuccess();
      }
    } catch (err) {
      onNotify({
        type: "error",
        message: err.message || "Cleanup execution failed.",
      });
    } finally {
      setIsExecuting(false);
    }
  }

  // Protect single file
  async function handleProtectFile(filePath) {
    try {
      await protectPath(filePath);
      onNotify({
        type: "success",
        message: `Protected '${filePath.split(/[\\/]/).pop()}'. Added to protected rules.`,
      });
      // Remove from selection if it was selected
      setSelectedPaths((prev) => {
        const next = new Set(prev);
        next.delete(filePath);
        return next;
      });
      if (onProtectSuccess) onProtectSuccess();
    } catch (err) {
      onNotify({
        type: "error",
        message: err.message || "Failed to protect file.",
      });
    }
  }

  const categoryCounts = suggestions.reduce((acc, curr) => {
    acc[curr.category] = (acc[curr.category] || 0) + 1;
    return acc;
  }, {});

  const allSelected =
    filteredSuggestions.length > 0 && selectedPaths.size === filteredSuggestions.length;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Smart Cleanup Actions</h1>
          <p className="page-description">
            Review recommendations, select eligible clutter, and safely quarantine files with full rollback support.
          </p>
        </div>

        {selectedPaths.size > 0 && (
          <button
            type="button"
            className="btn btn-primary text-nowrap"
            onClick={() => setIsConfirmOpen(true)}
          >
            <ArchiveRestore size={15} />
            <span>
              Quarantine Selected ({selectedPaths.size} · {formatBytes(selectedBytes)})
            </span>
          </button>
        )}
      </div>

      {/* Advisory Banner */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "12px",
          backgroundColor: "#EFF6FF",
          border: "1px solid #BFDBFE",
          borderRadius: "var(--radius-md)",
          padding: "14px 18px",
          marginBottom: "20px",
          fontSize: "13px",
          color: "#1E40AF",
        }}
      >
        <Info size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
        <div>
          <strong>Reversible Quarantine Workflow:</strong> Selected files are staged into the protected{" "}
          <code>.filenest_quarantine</code> area rather than being immediately deleted. You can review them in the{" "}
          <strong>Quarantine Vault</strong> and restore any file with a single click.
        </div>
      </div>

      {/* Post-execution summary alert if executed */}
      {executionSummary && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "12px",
            backgroundColor: "#ECFDF5",
            border: "1px solid #A7F3D0",
            borderRadius: "var(--radius-md)",
            padding: "14px 18px",
            marginBottom: "20px",
            fontSize: "13px",
            color: "#065F46",
          }}
        >
          <CheckCircle size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
          <div>
            <strong>Operation Complete:</strong> Verified {executionSummary.total_processed} files quarantined.{" "}
            <strong>{formatBytes(executionSummary.reclaimed_bytes)}</strong> verified space reclaimed.
            {executionSummary.total_failed > 0 && (
              <span style={{ color: "var(--danger)", marginLeft: "8px" }}>
                ({executionSummary.total_failed} files skipped due to permissions or protection)
              </span>
            )}
          </div>
        </div>
      )}

      {/* Search and Filters Bar */}
      <div
        className="card"
        style={{
          padding: "16px 20px",
          marginBottom: "20px",
          display: "flex",
          flexWrap: "wrap",
          gap: "14px",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: "260px" }}>
          <Search size={16} className="text-muted" />
          <input
            type="text"
            className="path-input"
            placeholder="Search recommended files by name or path..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ padding: "7px 12px", fontSize: "13px" }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {/* Select All Toggle */}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleSelectAll}
            disabled={filteredSuggestions.length === 0}
          >
            {allSelected ? <CheckSquare size={14} className="text-primary" /> : <Square size={14} />}
            <span>{allSelected ? "Deselect All" : "Select All"}</span>
          </button>

          {/* Category Dropdown */}
          <select
            className="path-input"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ padding: "7px 12px", fontSize: "13px" }}
          >
            <option value="all">All Categories ({suggestions.length})</option>
            <option value="duplicate">Duplicates ({categoryCounts["duplicate"] || 0})</option>
            <option value="potentially_unused">Potentially Unused ({categoryCounts["potentially_unused"] || 0})</option>
            <option value="temporary_file">Temporary Files ({categoryCounts["temporary_file"] || 0})</option>
            <option value="archive_review">Archives ({categoryCounts["archive_review"] || 0})</option>
            <option value="review_file_type">Log & Backup Files ({categoryCounts["review_file_type"] || 0})</option>
          </select>

          {/* Priority Dropdown */}
          <select
            className="path-input"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            style={{ padding: "7px 12px", fontSize: "13px" }}
          >
            <option value="all">All Priorities</option>
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>
        </div>
      </div>

      {/* Suggestions List */}
      <div className="card">
        <div className="card-header" style={{ flexWrap: "wrap", gap: "10px" }}>
          <span className="card-title">
            <Sparkles size={16} className="text-warning" />
            Recommendations ({filteredSuggestions.length} items)
          </span>

          <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "13px" }}>
            <span style={{ color: "var(--text-muted)" }}>
              Selected: <strong>{selectedPaths.size}</strong> ({formatBytes(selectedBytes)})
            </span>
          </div>
        </div>

        <div className="card-body" style={{ padding: 0 }}>
          {filteredSuggestions.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {filteredSuggestions.map((item, idx) => {
                const isSelected = selectedPaths.has(item.path);
                const priorityBadgeClass =
                  item.priority === "high"
                    ? "badge-danger"
                    : item.priority === "medium"
                    ? "badge-warning"
                    : "badge-neutral";

                return (
                  <div
                    key={`sug-${item.path || idx}`}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: "16px",
                      padding: "16px 20px",
                      borderBottom: "1px solid var(--border-light)",
                      backgroundColor: isSelected ? "var(--primary-light)" : "transparent",
                      transition: "background-color 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", flex: 1, minWidth: 0 }}>
                      {/* Checkbox */}
                      <button
                        type="button"
                        onClick={() => toggleSelection(item.path)}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          cursor: "pointer",
                          marginTop: "2px",
                          color: isSelected ? "var(--primary)" : "var(--text-subtle)",
                        }}
                        title={isSelected ? "Deselect" : "Select for quarantine"}
                      >
                        {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                      </button>

                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <strong style={{ fontSize: "14px", color: "var(--text-main)" }}>
                            {item.name}
                          </strong>
                          <span className={`badge ${priorityBadgeClass}`}>{item.priority}</span>
                          <span className="badge badge-neutral">{item.category.replace("_", " ")}</span>
                          <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)" }}>
                            {formatBytes(item.size_bytes)}
                          </span>
                        </div>

                        <div
                          style={{
                            fontSize: "12px",
                            color: "var(--text-subtle)",
                            marginTop: "4px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={item.path}
                        >
                          {item.path}
                        </div>

                        {/* Reasons */}
                        <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "2px" }}>
                          {item.reasons.map((r, rIdx) => (
                            <div
                              key={`r-${rIdx}`}
                              style={{
                                fontSize: "12px",
                                color: "var(--text-muted)",
                                display: "flex",
                                alignItems: "center",
                                gap: "5px",
                              }}
                            >
                              <span style={{ color: "var(--warning)" }}>•</span>
                              <span>{r}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setSelectedFileForReview(item)}
                      >
                        Inspect
                      </button>

                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleProtectFile(item.path)}
                        title="Protect file so it won't be suggested for cleanup"
                      >
                        <Shield size={13} className="text-success" />
                        <span>Protect</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <CheckCircle size={36} className="text-success" style={{ margin: "0 auto 12px auto" }} />
              <span className="empty-state-title">No Cleanup Recommendations</span>
              <p className="empty-state-desc">
                {searchQuery || categoryFilter !== "all"
                  ? "No files matched your filter criteria."
                  : "All scanned files are active, unique, and not matching any cleanup flags."}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal before Quarantine Execution */}
      <ConfirmModal
        isOpen={isConfirmOpen}
        title={`Quarantine ${selectedPaths.size} Files?`}
        message={`Are you sure you want to move ${selectedPaths.size} files (${formatBytes(selectedBytes)}) into the Quarantine Vault?`}
        confirmText="Confirm & Quarantine"
        confirmVariant="primary"
        isLoading={isExecuting}
        onConfirm={handleConfirmExecution}
        onCancel={() => setIsConfirmOpen(false)}
      >
        <div style={{ maxHeight: "160px", overflowY: "auto", border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)", padding: "8px 12px", fontSize: "12px", backgroundColor: "#FAFAFC" }}>
          {Array.from(selectedPaths).map((p, idx) => (
            <div key={`p-${idx}`} style={{ padding: "3px 0", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              • {p.split(/[\\/]/).pop()}
            </div>
          ))}
        </div>
      </ConfirmModal>

      {/* File Details Inspection Modal */}
      {selectedFileForReview && (
        <div className="modal-overlay" onClick={() => setSelectedFileForReview(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "560px" }}>
            <div className="modal-header">
              <h3>File Details & Comparison</h3>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setSelectedFileForReview(null)}
                style={{ border: "none", padding: "4px" }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="modal-body">
              <div style={{ marginBottom: "14px" }}>
                <strong style={{ display: "block", fontSize: "15px", color: "var(--text-main)" }}>
                  {selectedFileForReview.name}
                </strong>
                <code style={{ fontSize: "12px", color: "var(--text-muted)", wordBreak: "break-all" }}>
                  {selectedFileForReview.path}
                </code>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", backgroundColor: "#FAFAFC", padding: "12px", borderRadius: "var(--radius-sm)", marginBottom: "16px", fontSize: "13px" }}>
                <div>
                  <span style={{ color: "var(--text-subtle)", fontSize: "11px", display: "block" }}>SIZE</span>
                  <strong>{formatBytes(selectedFileForReview.size_bytes)}</strong>
                </div>
                <div>
                  <span style={{ color: "var(--text-subtle)", fontSize: "11px", display: "block" }}>CATEGORY</span>
                  <strong>{selectedFileForReview.category}</strong>
                </div>
                <div>
                  <span style={{ color: "var(--text-subtle)", fontSize: "11px", display: "block" }}>PRIORITY</span>
                  <span className={`badge ${selectedFileForReview.priority === "high" ? "badge-danger" : "badge-warning"}`}>
                    {selectedFileForReview.priority}
                  </span>
                </div>
                <div>
                  <span style={{ color: "var(--text-subtle)", fontSize: "11px", display: "block" }}>STATUS</span>
                  <strong>{selectedFileForReview.status}</strong>
                </div>
              </div>

              <h4 style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px", color: "var(--text-main)" }}>
                Reasons for Recommendation
              </h4>
              <ul style={{ paddingLeft: "18px", fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.6 }}>
                {selectedFileForReview.reasons.map((reason, index) => (
                  <li key={`reason-${index}`}>{reason}</li>
                ))}
              </ul>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSelectedFileForReview(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  handleProtectFile(selectedFileForReview.path);
                  setSelectedFileForReview(null);
                }}
              >
                <ShieldCheck size={14} className="text-success" />
                <span>Protect File</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

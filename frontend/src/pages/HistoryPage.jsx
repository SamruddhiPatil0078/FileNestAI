import React, { useState, useMemo } from "react";
import {
  History as HistoryIcon,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Info,
  Copy,
  Check,
  Search,
} from "lucide-react";
import { formatDateTime } from "../utils/formatters";
import { undoOperation } from "../api";
import ConfirmModal from "../components/ConfirmModal";

export default function HistoryPage({
  historyData,
  onRefresh,
  onNotify,
  selectedFolder,
}) {
  const [undoTarget, setUndoTarget] = useState(null);
  const [isUndoing, setIsUndoing] = useState(false);
  const [copiedPath, setCopiedPath] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const operations = historyData?.operations || [];

  const filteredOperations = useMemo(() => {
    if (!searchQuery.trim()) return operations;
    const q = searchQuery.toLowerCase();
    return operations.filter(
      (op) =>
        (op.source_path && op.source_path.toLowerCase().includes(q)) ||
        (op.destination_path && op.destination_path.toLowerCase().includes(q)) ||
        (op.operation_type && op.operation_type.toLowerCase().includes(q))
    );
  }, [operations, searchQuery]);

  function handleCopy(path) {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(""), 2000);
  }

  async function handleConfirmUndo() {
    if (!undoTarget) return;

    setIsUndoing(true);
    try {
      const res = await undoOperation(undoTarget.id, {
        approved: true,
        allowedRoot: selectedFolder,
      });

      onNotify({
        type: "success",
        message: `Successfully restored file to: ${res.restored_path}`,
      });
      setUndoTarget(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      onNotify({
        type: "error",
        message: err.message || "Failed to undo file operation.",
      });
    } finally {
      setIsUndoing(false);
    }
  }

  function getStatusBadge(status) {
    switch (status) {
      case "completed":
        return <span className="badge badge-success"><CheckCircle2 size={11} /> Completed</span>;
      case "undone":
        return <span className="badge badge-neutral"><RotateCcw size={11} /> Undone</span>;
      case "failed":
        return <span className="badge badge-danger"><XCircle size={11} /> Failed</span>;
      case "deleted":
        return <span className="badge badge-danger">Deleted</span>;
      default:
        return <span className="badge badge-warning"><Clock size={11} /> Pending</span>;
    }
  }

  function getOpTypeBadge(type) {
    switch (type) {
      case "move":
        return <span className="badge badge-primary">MOVE</span>;
      case "quarantine":
        return <span className="badge badge-warning">QUARANTINE</span>;
      case "restore":
        return <span className="badge badge-success">RESTORE</span>;
      case "delete":
        return <span className="badge badge-danger">DELETE</span>;
      default:
        return <span className="badge badge-neutral">{type?.toUpperCase() || "OP"}</span>;
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Activity History & Undo</h1>
          <p className="page-description">
            Complete audit trail of all file movements and quarantines, with atomic one-click undo capability.
          </p>
        </div>
      </div>

      {/* Info Banner */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "12px",
          backgroundColor: "#F8FAFC",
          border: "1px solid var(--border-color)",
          borderRadius: "var(--radius-md)",
          padding: "14px 18px",
          marginBottom: "24px",
          fontSize: "13px",
          color: "var(--text-muted)",
        }}
      >
        <Info size={18} style={{ flexShrink: 0, marginTop: "2px" }} className="text-primary" />
        <div>
          <strong>Atomic Undo Safeguards:</strong> FileNest AI logs every operation with exact cryptographic or path metadata.
          Undoing an operation moves the file back to its verified original location only if destination safety and workspace containment are confirmed.
        </div>
      </div>

      {/* Operations Table */}
      <div className="card">
        <div className="card-header" style={{ flexWrap: "wrap", gap: "12px" }}>
          <span className="card-title">
            <HistoryIcon size={16} className="text-primary" />
            File Operations Log ({filteredOperations.length} of {operations.length} events)
          </span>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Search size={14} className="text-muted" />
            <input
              type="text"
              className="path-input"
              placeholder="Search history by path or filename..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ padding: "4px 10px", fontSize: "12px", width: "240px" }}
            />
          </div>
        </div>

        <div className="table-container" style={{ border: "none", borderRadius: 0, overflowX: "auto" }}>
          <table className="data-table" style={{ tableLayout: "fixed", width: "100%", minWidth: "750px" }}>
            <colgroup>
              <col style={{ width: "55px" }} />
              <col style={{ width: "95px" }} />
              <col style={{ width: "auto" }} />
              <col style={{ width: "115px" }} />
              <col style={{ width: "165px" }} />
              <col style={{ width: "125px" }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ paddingLeft: "20px" }}>ID</th>
                <th>Operation</th>
                <th>Source & Destination</th>
                <th>Status</th>
                <th>Date & Time</th>
                <th style={{ textAlign: "right", paddingRight: "20px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOperations.length > 0 ? (
                filteredOperations.map((op, idx) => {
                  const isEligibleForUndo =
                    op.status === "completed" && (op.operation_type === "move" || op.operation_type === "quarantine");

                  return (
                    <tr key={op.id ? `op-row-${op.id}` : `op-row-idx-${idx}`}>
                      <td style={{ fontWeight: 700, color: "var(--text-subtle)", fontSize: "12px", paddingLeft: "20px" }}>
                        #{op.id || idx + 1}
                      </td>
                      <td>{getOpTypeBadge(op.operation_type)}</td>
                      <td style={{ overflow: "hidden" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "12px", minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
                            <strong style={{ color: "var(--text-main)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {(op.source_path || "").split(/[\\/]/).pop()}
                            </strong>
                            <button
                              type="button"
                              className="copy-btn"
                              onClick={() => handleCopy(op.source_path)}
                              title="Copy original path"
                              style={{ flexShrink: 0 }}
                            >
                              {copiedPath === op.source_path ? <Check size={11} className="text-success" /> : <Copy size={11} />}
                            </button>
                          </div>
                          <div
                            style={{
                              color: "var(--text-subtle)",
                              fontSize: "11px",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={op.source_path}
                          >
                            From: {op.source_path}
                          </div>
                          <div
                            style={{
                              color: "var(--text-muted)",
                              fontSize: "11px",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={op.destination_path}
                          >
                            To: {op.destination_path}
                          </div>
                        </div>
                      </td>
                      <td>{getStatusBadge(op.status)}</td>
                      <td style={{ fontSize: "12px", color: "var(--text-subtle)" }}>
                        <div style={{ whiteSpace: "nowrap" }}>{formatDateTime(op.created_at)}</div>
                        {op.undone_at && (
                          <div style={{ fontSize: "10px", color: "var(--text-subtle)", whiteSpace: "nowrap" }}>
                            Undone: {formatDateTime(op.undone_at)}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap", paddingRight: "20px" }}>
                        {isEligibleForUndo ? (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setUndoTarget(op)}
                            disabled={isUndoing}
                            style={{ whiteSpace: "nowrap", padding: "6px 12px", fontSize: "12px" }}
                            title={op.operation_type === "quarantine" ? "Restore file from quarantine" : "Undo this file move"}
                          >
                            <RotateCcw size={12} className="text-primary" />
                            <span>{op.operation_type === "quarantine" ? "Restore" : "Undo Move"}</span>
                          </button>
                        ) : (
                          <span style={{ fontSize: "12px", color: "var(--text-subtle)", fontWeight: 500, display: "inline-block" }}>
                            {op.status === "undone" ? "Restored" : "—"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "32px" }}>
                    No operations matching your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Undo Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(undoTarget)}
        title={undoTarget?.operation_type === "quarantine" ? "Restore Quarantined File?" : "Undo File Movement?"}
        message={`Are you sure you want to move "${(undoTarget?.source_path || "").split(/[\\/]/).pop()}" back from "${undoTarget?.destination_path}" to its original location "${undoTarget?.source_path}"?`}
        confirmText={undoTarget?.operation_type === "quarantine" ? "Restore File" : "Undo Move"}
        confirmVariant="primary"
        isLoading={isUndoing}
        onConfirm={handleConfirmUndo}
        onCancel={() => setUndoTarget(null)}
      />
    </div>
  );
}

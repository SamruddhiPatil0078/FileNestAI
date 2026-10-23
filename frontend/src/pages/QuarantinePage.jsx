import React, { useState, useEffect } from "react";
import {
  ArchiveRestore,
  RotateCcw,
  Trash2,
  AlertTriangle,
  File,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { formatBytes, formatDateTime } from "../utils/formatters";
import { listQuarantine, restoreQuarantine, deleteQuarantine } from "../api";
import ConfirmModal from "../components/ConfirmModal";

export default function QuarantinePage({
  selectedFolder,
  onNotify,
  onRefreshAll,
}) {
  const [quarantinedFiles, setQuarantinedFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    loadQuarantine();
  }, [selectedFolder]);

  async function loadQuarantine() {
    if (!selectedFolder) return;
    setIsLoading(true);
    try {
      const res = await listQuarantine(selectedFolder);
      setQuarantinedFiles(res.quarantined_files || []);
    } catch (err) {
      // Non-blocking
    } finally {
      setIsLoading(false);
    }
  }

  async function handleConfirmRestore() {
    if (!restoreTarget) return;
    setIsProcessing(true);
    try {
      await restoreQuarantine(restoreTarget.id, selectedFolder);
      onNotify({
        type: "success",
        message: `Restored '${restoreTarget.filename}' to its original path.`,
      });
      setRestoreTarget(null);
      await loadQuarantine();
      if (onRefreshAll) onRefreshAll();
    } catch (err) {
      onNotify({
        type: "error",
        message: err.message || "Failed to restore quarantined file.",
      });
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setIsProcessing(true);
    try {
      await deleteQuarantine(deleteTarget.id, selectedFolder);
      onNotify({
        type: "success",
        message: `Permanently deleted '${deleteTarget.filename}'.`,
      });
      setDeleteTarget(null);
      await loadQuarantine();
      if (onRefreshAll) onRefreshAll();
    } catch (err) {
      onNotify({
        type: "error",
        message: err.message || "Failed to delete file.",
      });
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Quarantine Vault</h1>
          <p className="page-description">
            Safe holding area for cleanup files. Quarantined files are staged safely and can be restored at any time.
          </p>
        </div>

        <button
          className="btn btn-secondary btn-sm"
          onClick={loadQuarantine}
          disabled={isLoading}
        >
          <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
          <span>Refresh Vault</span>
        </button>
      </div>

      {/* Info Card */}
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
        <ArchiveRestore size={18} className="text-primary" style={{ flexShrink: 0, marginTop: "2px" }} />
        <div>
          <strong>Reversible Cleanup:</strong> When files are quarantined, they are moved to the hidden{" "}
          <code>.filenest_quarantine</code> folder inside your workspace. If you discover a file was needed, click{" "}
          <strong>"Restore"</strong> to return it immediately to its exact original location.
        </div>
      </div>

      {/* Quarantined Files Table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <ArchiveRestore size={16} className="text-primary" />
            Held in Quarantine ({quarantinedFiles.length} files)
          </span>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>File Name</th>
                <th>Original Location</th>
                <th>File Size</th>
                <th>Quarantined At</th>
                <th style={{ textAlign: "right", width: "170px", minWidth: "170px", paddingRight: "20px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {quarantinedFiles.length > 0 ? (
                quarantinedFiles.map((file, idx) => (
                  <tr key={`qfile-${file.id || idx}`}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <File size={15} className="text-muted" />
                        <strong style={{ color: "var(--text-main)" }}>{file.filename}</strong>
                      </div>
                    </td>
                    <td
                      style={{
                        fontSize: "12px",
                        color: "var(--text-muted)",
                        maxWidth: "360px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={file.source_path}
                    >
                      {file.source_path}
                    </td>
                    <td style={{ fontWeight: 600 }}>{formatBytes(file.size_bytes)}</td>
                    <td style={{ fontSize: "12px", color: "var(--text-subtle)", whiteSpace: "nowrap" }}>
                      {formatDateTime(file.created_at)}
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap", width: "170px", minWidth: "170px", paddingRight: "20px" }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setRestoreTarget(file)}
                        style={{ marginRight: "8px" }}
                        title="Restore file to original location"
                      >
                        <RotateCcw size={13} className="text-primary" />
                        <span>Restore</span>
                      </button>

                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => setDeleteTarget(file)}
                        title="Permanently remove file from disk"
                      >
                        <Trash2 size={13} />
                        <span>Delete</span>
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "36px" }}>
                    <div className="empty-state" style={{ padding: 0 }}>
                      <CheckCircle2 size={32} className="text-success" style={{ margin: "0 auto 8px auto" }} />
                      <span className="empty-state-title">Quarantine Vault is Empty</span>
                      <p className="empty-state-desc" style={{ marginBottom: 0 }}>
                        No files are currently quarantined. When you clean up duplicates or clutter in Smart Cleanup, they are staged here.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Restore Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(restoreTarget)}
        title="Restore Quarantined File?"
        message={`Are you sure you want to restore "${restoreTarget?.filename}" back to "${restoreTarget?.source_path}"?`}
        confirmText="Restore File"
        confirmVariant="primary"
        isLoading={isProcessing}
        onConfirm={handleConfirmRestore}
        onCancel={() => setRestoreTarget(null)}
      />

      {/* Permanent Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="Permanently Delete File?"
        message={`WARNING: This will permanently delete "${deleteTarget?.filename}" from your drive. This action CANNOT be undone.`}
        confirmText="Permanently Delete"
        confirmVariant="danger"
        isLoading={isProcessing}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

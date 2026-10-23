import React, { useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Trash2,
  Plus,
  Folder,
  File,
  Info,
  CheckCircle,
  Copy,
  Check,
} from "lucide-react";
import { formatDateTime } from "../utils/formatters";
import { protectPath, unprotectPath } from "../api";
import ConfirmModal from "../components/ConfirmModal";

export default function ProtectedPage({
  protectedPaths = [],
  onRefresh,
  onNotify,
  selectedFolder,
}) {
  const [newPathInput, setNewPathInput] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [unprotectTarget, setUnprotectTarget] = useState(null);
  const [isUnprotecting, setIsUnprotecting] = useState(false);
  const [copiedPath, setCopiedPath] = useState("");

  function handleCopy(path) {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(""), 2000);
  }

  async function handleAddProtection(e) {
    e.preventDefault();
    if (!newPathInput.trim()) return;

    setIsAdding(true);
    try {
      await protectPath(newPathInput.trim());
      onNotify({
        type: "success",
        message: `Successfully protected path: ${newPathInput.trim()}`,
      });
      setNewPathInput("");
      if (onRefresh) onRefresh();
    } catch (err) {
      onNotify({
        type: "error",
        message: err.message || "Failed to protect path.",
      });
    } finally {
      setIsAdding(false);
    }
  }

  async function handleConfirmUnprotect() {
    if (!unprotectTarget) return;

    setIsUnprotecting(true);
    try {
      await unprotectPath(unprotectTarget.path);
      onNotify({
        type: "success",
        message: `Removed protection rule for: ${unprotectTarget.path}`,
      });
      setUnprotectTarget(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      onNotify({
        type: "error",
        message: err.message || "Failed to remove protection.",
      });
    } finally {
      setIsUnprotecting(false);
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Protected Files & Folders</h1>
          <p className="page-description">
            Protected paths and all their descendant files are permanently exempted from Smart Cleanup suggestions and organization.
          </p>
        </div>
      </div>

      {/* Info Banner */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "12px",
          backgroundColor: "#ECFDF5",
          border: "1px solid #A7F3D0",
          borderRadius: "var(--radius-md)",
          padding: "14px 18px",
          marginBottom: "24px",
          fontSize: "13px",
          color: "#065F46",
        }}
      >
        <ShieldCheck size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
        <div>
          <strong>Strict Protection Rule:</strong> When a folder is protected, FileNest AI protects the entire
          sub-tree underneath it. Files inside will never appear in cleanup recommendations or batch organization plans.
        </div>
      </div>

      {/* Add Protected Path Card */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <Plus size={16} className="text-primary" />
            Protect a File or Folder Path
          </span>
        </div>
        <div className="card-body">
          <form onSubmit={handleAddProtection} style={{ display: "flex", gap: "10px" }}>
            <input
              type="text"
              className="path-input"
              placeholder="Enter absolute file or folder path to protect..."
              value={newPathInput}
              onChange={(e) => setNewPathInput(e.target.value)}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isAdding || !newPathInput.trim()}
            >
              <ShieldCheck size={16} />
              <span>{isAdding ? "Protecting..." : "Add Protection"}</span>
            </button>
          </form>
        </div>
      </div>

      {/* Protected Items Table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <ShieldCheck size={16} className="text-success" />
            Active Protection Rules ({protectedPaths.length})
          </span>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Protected Path</th>
                <th>Rule Created</th>
                <th style={{ textAlign: "right", width: "120px", minWidth: "120px", paddingRight: "20px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {protectedPaths.length > 0 ? (
                protectedPaths.map((rule, idx) => (
                  <tr key={rule.path ? `prot-${rule.path}` : `prot-idx-${idx}`}>
                    <td>
                      <span className="badge badge-success">
                        {rule.kind === "folder" ? <Folder size={12} /> : <File size={12} />}
                        {rule.kind}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <code style={{ fontSize: "13px", color: "var(--text-main)", fontWeight: 500 }}>
                          {rule.path}
                        </code>
                        <button
                          type="button"
                          className="copy-btn"
                          onClick={() => handleCopy(rule.path)}
                          title="Copy path"
                        >
                          {copiedPath === rule.path ? <Check size={11} className="text-success" /> : <Copy size={11} />}
                        </button>
                      </div>
                    </td>
                    <td style={{ color: "var(--text-subtle)", fontSize: "12px", whiteSpace: "nowrap" }}>
                      {formatDateTime(rule.created_at)}
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap", width: "120px", minWidth: "120px", paddingRight: "20px" }}>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => setUnprotectTarget(rule)}
                        title="Remove protection rule"
                      >
                        <Trash2 size={13} />
                        <span>Unprotect</span>
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", padding: "32px" }}>
                    No protected paths yet. Add paths above or click "Protect" in Smart Cleanup.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(unprotectTarget)}
        title="Remove Protection Rule?"
        message={`Are you sure you want to unprotect "${unprotectTarget?.path}"? This file or folder will no longer be excluded from cleanup recommendations.`}
        confirmText="Unprotect"
        confirmVariant="danger"
        isLoading={isUnprotecting}
        onConfirm={handleConfirmUnprotect}
        onCancel={() => setUnprotectTarget(null)}
      />
    </div>
  );
}

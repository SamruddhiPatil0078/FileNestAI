import React, { useState } from "react";
import {
  PieChart as PieChartIcon,
  BarChart2,
  Copy,
  FileText,
  File,
  AlertCircle,
  Hash,
  ArchiveRestore,
  CheckCircle,
  Check,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
} from "recharts";
import { formatBytes, formatDateTime, classifyExtension, CATEGORY_COLORS } from "../utils/formatters";
import { executeCleanupActions } from "../api";
import ConfirmModal from "../components/ConfirmModal";

export default function AnalyticsPage({
  scanData,
  analysisData,
  selectedFolder,
  onNavigate,
  onRefreshAll,
  onNotify,
}) {
  const [copiedPath, setCopiedPath] = useState("");
  const [quarantineTargetGroup, setQuarantineTargetGroup] = useState(null);
  const [keptFilePath, setKeptFilePath] = useState(null);
  const [isQuarantining, setIsQuarantining] = useState(false);

  // Aggregate files into categories
  const categoryMap = {};
  if (scanData?.files) {
    scanData.files.forEach((f) => {
      const cat = classifyExtension(f.extension);
      categoryMap[cat] = (categoryMap[cat] || 0) + f.size_bytes;
    });
  }

  const categoryChartData = Object.entries(categoryMap).map(([name, value]) => ({
    name,
    value,
    color: CATEGORY_COLORS[name] || CATEGORY_COLORS.Other,
  }));

  // Top folders from analysisData
  const folderChartData = (analysisData?.folder_sizes || [])
    .filter((f) => f.path !== selectedFolder)
    .slice(0, 8)
    .map((f) => ({
      name: f.path.split(/[\\/]/).filter(Boolean).pop() || f.path,
      fullPath: f.path,
      size: f.size_bytes,
    }));

  const largeFiles = analysisData?.large_files || [];
  const duplicateGroups = analysisData?.duplicate_groups || [];
  const totalWasted = analysisData?.potential_wasted_bytes || 0;

  function handleCopy(path) {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(""), 2000);
  }

  function openQuarantineModal(group) {
    // Default: keep the first copy, quarantine the rest
    setQuarantineTargetGroup(group);
    setKeptFilePath(group.files[0]?.path || null);
  }

  async function handleConfirmQuarantineDuplicates() {
    if (!quarantineTargetGroup || !keptFilePath) return;

    const redundantFiles = quarantineTargetGroup.files.filter((f) => f.path !== keptFilePath);
    if (redundantFiles.length === 0) return;

    setIsQuarantining(true);
    try {
      const items = redundantFiles.map((f) => ({
        path: f.path,
        action: "quarantine",
        reason: `Redundant duplicate copy (kept: ${keptFilePath.split(/[\\/]/).pop()})`,
      }));

      const res = await executeCleanupActions({
        items,
        allowedRoot: selectedFolder,
        approved: true,
      });

      if (onNotify) {
        onNotify({
          type: "success",
          message: `Quarantined ${res.total_processed} redundant duplicate copy(ies) (${formatBytes(res.reclaimed_bytes)} reclaimed).`,
        });
      }

      setQuarantineTargetGroup(null);
      setKeptFilePath(null);

      if (onRefreshAll) {
        onRefreshAll();
      }
    } catch (err) {
      if (onNotify) {
        onNotify({
          type: "error",
          message: err.message || "Failed to quarantine duplicate copies.",
        });
      }
    } finally {
      setIsQuarantining(false);
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Storage Analytics</h1>
          <p className="page-description">
            Deep dive into file categories, largest space consumers, and exact duplicate clusters.
          </p>
        </div>
      </div>

      {/* Charts Section */}
      <div className="charts-grid">
        {/* Doughnut Chart: Storage by Category */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <PieChartIcon size={16} className="text-primary" />
              Storage by File Type Category
            </span>
          </div>
          <div className="card-body" style={{ height: "320px" }}>
            {categoryChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryChartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="45%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                  >
                    {categoryChartData.map((entry, index) => (
                      <Cell key={`an-pie-${entry.name || index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatBytes(value)}
                    contentStyle={{
                      backgroundColor: "#fff",
                      border: "1px solid var(--border-color)",
                      borderRadius: "6px",
                      fontSize: "12px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state">
                <span className="empty-state-desc">No data available.</span>
              </div>
            )}

            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", justifyContent: "center" }}>
              {categoryChartData.map((item, idx) => (
                <div key={`an-cat-${item.name || idx}`} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "var(--text-muted)" }}>
                  <span style={{ width: "9px", height: "9px", borderRadius: "50%", backgroundColor: item.color }} />
                  <span>{item.name}: {formatBytes(item.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bar Chart: Storage by Folder */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <BarChart2 size={16} className="text-primary" />
              Storage by Folder Comparison
            </span>
          </div>
          <div className="card-body" style={{ height: "320px" }}>
            {folderChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={folderChartData} layout="vertical" margin={{ top: 10, right: 30, left: 30, bottom: 10 }}>
                  <XAxis type="number" tickFormatter={(val) => formatBytes(val)} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={80} />
                  <Tooltip
                    formatter={(val) => formatBytes(val)}
                    contentStyle={{
                      backgroundColor: "#fff",
                      border: "1px solid var(--border-color)",
                      borderRadius: "6px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="size" fill="#6366F1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state">
                <span className="empty-state-desc">No subfolders to compare.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Duplicate Analysis Section */}
      <div className="card">
        <div className="card-header">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span className="card-title">
              <Copy size={16} className="text-danger" />
              Exact Duplicate Files ({duplicateGroups.length} Groups)
            </span>
            <span className="badge badge-warning">
              Potential Savings: {formatBytes(totalWasted)}
            </span>
          </div>
        </div>
        <div className="card-body">
          {duplicateGroups.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {duplicateGroups.map((group, gIdx) => (
                <div
                  key={group.sha256 ? `dup-grp-${group.sha256}` : `dup-grp-idx-${gIdx}`}
                  style={{
                    backgroundColor: "#FAFAFC",
                    border: "1px solid var(--border-color)",
                    borderRadius: "var(--radius-sm)",
                    padding: "16px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
                    <div>
                      <strong style={{ fontSize: "14px", color: "var(--text-main)" }}>
                        {group.copies} Identical Copies ({formatBytes(group.size_bytes)} each)
                      </strong>
                      <div style={{ fontSize: "12px", color: "var(--danger)", fontWeight: 500, marginTop: "2px" }}>
                        Redundant storage consumed: {formatBytes(group.potential_wasted_bytes)}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span className="badge badge-primary">SHA-256 Verified Match</span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => openQuarantineModal(group)}
                        title="Select a copy to keep and quarantine redundant copies"
                      >
                        <ArchiveRestore size={13} className="text-primary" />
                        <span>Resolve Duplicates</span>
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {group.files.map((file, idx) => (
                      <div
                        key={file.path ? `dup-file-${file.path}` : `dup-file-idx-${idx}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          fontSize: "12px",
                          backgroundColor: "#fff",
                          padding: "8px 12px",
                          borderRadius: "4px",
                          border: "1px solid var(--border-light)",
                        }}
                      >
                        <File size={14} className="text-muted" style={{ flexShrink: 0 }} />
                        <span style={{ fontWeight: 600, color: "var(--text-main)" }}>{file.name}</span>
                        <span
                          style={{
                            color: "var(--text-subtle)",
                            fontSize: "11px",
                            marginLeft: "auto",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            maxWidth: "420px",
                            whiteSpace: "nowrap",
                          }}
                          title={file.path}
                        >
                          {file.path}
                        </span>
                        <button
                          type="button"
                          className="copy-btn"
                          onClick={() => handleCopy(file.path)}
                          title="Copy file path"
                        >
                          {copiedPath === file.path ? <Check size={11} className="text-success" /> : <Copy size={11} />}
                        </button>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "10px", fontSize: "11px", color: "var(--text-subtle)" }}>
                    <Hash size={12} />
                    <span>Hash: <code>{group.sha256}</code></span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <CheckCircle size={32} className="text-success" style={{ margin: "0 auto 8px auto" }} />
              <span className="empty-state-title">No Exact Duplicates Found</span>
              <p className="empty-state-desc">
                None of the files in this folder have identical SHA-256 content hashes.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Largest Files Table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <FileText size={16} className="text-primary" />
            Top 10 Largest Files
          </span>
        </div>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>File Name</th>
                <th>Type</th>
                <th>File Size</th>
                <th>Folder Location</th>
                <th>Last Modified</th>
                <th style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {largeFiles.length > 0 ? (
                largeFiles.map((file, idx) => {
                  const cat = classifyExtension(file.extension);
                  return (
                    <tr key={file.path ? `lg-${file.path}` : `lg-idx-${idx}`}>
                      <td style={{ fontWeight: 700, color: "var(--text-subtle)" }}>
                        #{idx + 1}
                      </td>
                      <td style={{ fontWeight: 600 }}>{file.name}</td>
                      <td>
                        <span className="badge badge-neutral">{file.extension || "No ext"}</span>
                      </td>
                      <td style={{ fontWeight: 600, color: "var(--text-main)" }}>
                        {formatBytes(file.size_bytes)}
                      </td>
                      <td style={{ color: "var(--text-muted)", fontSize: "12px", maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={file.path}>
                        {file.path}
                      </td>
                      <td style={{ color: "var(--text-subtle)", fontSize: "12px", whiteSpace: "nowrap" }}>
                        {formatDateTime(file.modified)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          type="button"
                          className="copy-btn"
                          onClick={() => handleCopy(file.path)}
                          title="Copy file path"
                        >
                          {copiedPath === file.path ? <Check size={11} className="text-success" /> : <Copy size={11} />}
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "24px" }}>
                    No files found in this scan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Duplicate Resolution Modal */}
      {quarantineTargetGroup && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "20px",
          }}
        >
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: "var(--radius-md)",
              maxWidth: "600px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
              padding: "24px",
            }}
          >
            <h3 style={{ fontSize: "17px", fontWeight: 700, color: "var(--text-main)", marginBottom: "8px" }}>
              Resolve Duplicate Files
            </h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px" }}>
              Select which copy you want to <strong>KEEP</strong>. The remaining redundant copy(ies) will be safely staged into the Quarantine Vault and can be restored at any time.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
              {quarantineTargetGroup.files.map((file, idx) => {
                const isKept = keptFilePath === file.path;
                return (
                  <label
                    key={`res-opt-${file.path || idx}`}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "10px",
                      padding: "12px",
                      border: `1.5px solid ${isKept ? "var(--primary)" : "var(--border-color)"}`,
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: isKept ? "var(--primary-light)" : "#fff",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="radio"
                      name="keepFile"
                      checked={isKept}
                      onChange={() => setKeptFilePath(file.path)}
                      style={{ marginTop: "3px" }}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <strong style={{ fontSize: "13px", color: "var(--text-main)" }}>
                          {file.name}
                        </strong>
                        <span className={`badge ${isKept ? "badge-success" : "badge-neutral"}`}>
                          {isKept ? "KEEP THIS COPY" : "QUARANTINE"}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: "11px",
                          color: "var(--text-subtle)",
                          marginTop: "2px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {file.path}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setQuarantineTargetGroup(null)}
                disabled={isQuarantining}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleConfirmQuarantineDuplicates}
                disabled={isQuarantining || !keptFilePath}
              >
                <ArchiveRestore size={14} />
                <span>
                  {isQuarantining
                    ? "Quarantining..."
                    : `Quarantine ${(quarantineTargetGroup.files.length - 1)} Redundant Copies`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

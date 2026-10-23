import React from "react";
import {
  Files,
  HardDrive,
  Copy,
  Sparkles,
  ArrowRight,
  RefreshCw,
  FolderTree,
  ShieldCheck,
  Clock,
  PieChart as PieChartIcon,
  ArchiveRestore,
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
import { formatBytes, classifyExtension, CATEGORY_COLORS } from "../utils/formatters";

export default function DashboardPage({
  scanData,
  analysisData,
  cleanupData,
  historyData,
  selectedFolder,
  onNavigate,
  onRescan,
  isScanning,
}) {
  // Aggregate files into categories for the chart
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
    .slice(0, 5)
    .map((f) => {
      const shortName = f.path.split(/[\\/]/).filter(Boolean).pop() || f.path;
      return {
        name: shortName,
        fullPath: f.path,
        size: f.size_bytes,
      };
    });

  const totalFiles = scanData?.file_count ?? 0;
  const totalBytes = scanData?.total_size_bytes ?? 0;
  const duplicateCount = analysisData?.duplicate_group_count ?? 0;
  const wastedBytes = analysisData?.potential_wasted_bytes ?? 0;
  const cleanupCount = cleanupData?.suggestion_count ?? 0;

  const recentOps = (historyData?.operations || []).slice(0, 5);

  function getOpLabel(opType) {
    switch (opType) {
      case "move":
        return "File Relocated";
      case "quarantine":
        return "File Quarantined";
      case "restore":
        return "File Restored";
      case "delete":
        return "File Deleted";
      default:
        return "File Operation";
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Overview Dashboard</h1>
          <p className="page-description">
            Storage metrics and file insights for <strong>{selectedFolder}</strong>
          </p>
        </div>

        <button
          className="btn btn-secondary btn-sm"
          onClick={onRescan}
          disabled={isScanning}
        >
          <RefreshCw size={14} className={isScanning ? "animate-spin" : ""} />
          <span>Rescan Folder</span>
        </button>
      </div>

      {/* Metrics Row */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Files Scanned</span>
            <div className="stat-icon">
              <Files size={16} />
            </div>
          </div>
          <div className="stat-value">{totalFiles.toLocaleString()}</div>
          <span className="stat-foot">Discovered items</span>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Storage Analyzed</span>
            <div className="stat-icon" style={{ backgroundColor: "#EEF2FF", color: "#6366F1" }}>
              <HardDrive size={16} />
            </div>
          </div>
          <div className="stat-value">{formatBytes(totalBytes)}</div>
          <span className="stat-foot">Total size of files</span>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Duplicate Groups</span>
            <div className="stat-icon" style={{ backgroundColor: "#FEF2F2", color: "#EF4444" }}>
              <Copy size={16} />
            </div>
          </div>
          <div className="stat-value">{duplicateCount}</div>
          <span className="stat-foot">Identical file sets</span>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Potential Savings</span>
            <div className="stat-icon" style={{ backgroundColor: "#ECFDF5", color: "#10B981" }}>
              <Sparkles size={16} />
            </div>
          </div>
          <div className="stat-value" style={{ color: wastedBytes > 0 ? "var(--success)" : "inherit" }}>
            {formatBytes(wastedBytes)}
          </div>
          <span className="stat-foot">Estimated redundant space</span>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Cleanup Suggestions</span>
            <div className="stat-icon" style={{ backgroundColor: "#FFFBEB", color: "#F59E0B" }}>
              <Sparkles size={16} />
            </div>
          </div>
          <div className="stat-value">{cleanupCount}</div>
          <span className="stat-foot">Files for review</span>
        </div>
      </div>

      {/* Charts Row */}
      <div className="charts-grid">
        {/* Doughnut Chart: Storage by Category */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <PieChartIcon size={16} className="text-primary" />
              Storage Distribution by Category
            </span>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => onNavigate("analytics")}
            >
              Details
            </button>
          </div>
          <div className="card-body" style={{ height: "300px" }}>
            {categoryChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryChartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="45%"
                    innerRadius={55}
                    outerRadius={95}
                    paddingAngle={3}
                  >
                    {categoryChartData.map((entry, index) => (
                      <Cell key={`pie-cell-${entry.name || index}`} fill={entry.color} />
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
                <span className="empty-state-desc">No files scanned yet.</span>
              </div>
            )}

            {/* Color Legend */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", justifyContent: "center", marginTop: "10px" }}>
              {categoryChartData.map((item, idx) => (
                <div key={`dash-cat-${item.name || idx}`} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "var(--text-muted)" }}>
                  <span style={{ width: "9px", height: "9px", borderRadius: "50%", backgroundColor: item.color }} />
                  <span>{item.name} ({formatBytes(item.value)})</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bar Chart: Storage by Folder */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <FolderTree size={16} className="text-primary" />
              Top Folders by Size
            </span>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => onNavigate("analytics")}
            >
              View All
            </button>
          </div>
          <div className="card-body" style={{ height: "300px" }}>
            {folderChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={folderChartData} layout="vertical" margin={{ top: 10, right: 30, left: 40, bottom: 10 }}>
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
                  <Bar dataKey="size" fill="#3B82F6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state">
                <span className="empty-state-desc">
                  {analysisData ? "No subfolders found." : "Run storage analysis to view folder sizes."}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions & Recent Operations */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        {/* Quick Actions */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Quick Actions</span>
          </div>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <button
              className="btn btn-secondary"
              onClick={() => onNavigate("cleanup")}
              style={{ justifyContent: "space-between" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <Sparkles size={16} className="text-warning" />
                <span>Review Smart Cleanup Suggestions</span>
              </div>
              <ArrowRight size={14} />
            </button>

            <button
              className="btn btn-secondary"
              onClick={() => onNavigate("quarantine")}
              style={{ justifyContent: "space-between" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <ArchiveRestore size={16} className="text-primary" />
                <span>Manage Quarantine Vault</span>
              </div>
              <ArrowRight size={14} />
            </button>

            <button
              className="btn btn-secondary"
              onClick={() => onNavigate("analytics")}
              style={{ justifyContent: "space-between" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <Copy size={16} className="text-danger" />
                <span>Inspect Duplicate Files & Largest Hogs</span>
              </div>
              <ArrowRight size={14} />
            </button>

            <button
              className="btn btn-secondary"
              onClick={() => onNavigate("assistant")}
              style={{ justifyContent: "space-between" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <ShieldCheck size={16} className="text-success" />
                <span>Execute AI Organization Plan</span>
              </div>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>

        {/* Recent Operations */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <Clock size={16} className="text-muted" />
              Recent Operations
            </span>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => onNavigate("history")}
            >
              History Log
            </button>
          </div>
          <div className="card-body">
            {recentOps.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {recentOps.map((op, idx) => (
                  <div
                    key={op.id ? `recent-op-${op.id}` : `recent-op-idx-${idx}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontSize: "13px",
                      paddingBottom: "8px",
                      borderBottom: "1px solid var(--border-light)",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text-main)" }}>
                        {getOpLabel(op.operation_type)}
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)", maxWidth: "320px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {(op.source_path || "").split(/[\\/]/).pop()}
                      </div>
                    </div>
                    <span className={`badge ${op.status === "completed" ? "badge-success" : op.status === "undone" ? "badge-neutral" : "badge-warning"}`}>
                      {op.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: "20px 0" }}>
                <p className="empty-state-desc" style={{ marginBottom: 0 }}>
                  No operations recorded yet. File moves will appear here.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

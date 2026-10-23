import React, { useState, useMemo } from "react";
import {
  FolderTree,
  Search,
  Filter,
  ArrowUpDown,
  File,
  FileText,
  Image,
  Video,
  Archive,
  Code2,
  Music,
  Copy,
  Check,
} from "lucide-react";
import { formatBytes, formatDateTime, classifyExtension } from "../utils/formatters";

export default function ExplorerPage({ scanData, selectedFolder, onNotify }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sizeFilter, setSizeFilter] = useState("all");
  const [sortField, setSortField] = useState("size_bytes");
  const [sortOrder, setSortOrder] = useState("desc");
  const [copiedPath, setCopiedPath] = useState("");

  const files = scanData?.files || [];

  function handleCopyPath(path) {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(""), 2000);
    if (onNotify) {
      onNotify({ type: "info", message: `Copied path to clipboard.` });
    }
  }

  // Icon mapping helper
  function getFileIcon(cat) {
    switch (cat) {
      case "Documents": return <FileText size={15} style={{ color: "#3B82F6" }} />;
      case "Images": return <Image size={15} style={{ color: "#6366F1" }} />;
      case "Videos": return <Video size={15} style={{ color: "#8B5CF6" }} />;
      case "Audio": return <Music size={15} style={{ color: "#EC4899" }} />;
      case "Archives": return <Archive size={15} style={{ color: "#F59E0B" }} />;
      case "Code": return <Code2 size={15} style={{ color: "#10B981" }} />;
      default: return <File size={15} style={{ color: "#64748B" }} />;
    }
  }

  // Filtered and sorted files
  const filteredFiles = useMemo(() => {
    return files
      .filter((file) => {
        // Search
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          if (!file.name.toLowerCase().includes(q) && !file.path.toLowerCase().includes(q)) {
            return false;
          }
        }

        // Category filter
        const cat = classifyExtension(file.extension);
        if (categoryFilter !== "all" && cat !== categoryFilter) {
          return false;
        }

        // Size filter
        if (sizeFilter === "small" && file.size_bytes >= 1024 * 1024) return false;
        if (sizeFilter === "medium" && (file.size_bytes < 1024 * 1024 || file.size_bytes > 50 * 1024 * 1024)) return false;
        if (sizeFilter === "large" && file.size_bytes <= 50 * 1024 * 1024) return false;

        return true;
      })
      .sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];

        if (typeof valA === "string") valA = valA.toLowerCase();
        if (typeof valB === "string") valB = valB.toLowerCase();

        if (valA < valB) return sortOrder === "asc" ? -1 : 1;
        if (valA > valB) return sortOrder === "asc" ? 1 : -1;
        return 0;
      });
  }, [files, searchQuery, categoryFilter, sizeFilter, sortField, sortOrder]);

  function handleSort(field) {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">File Explorer</h1>
          <p className="page-description">
            Filter, search, and inspect through all {files.length.toLocaleString()} files discovered in <strong>{selectedFolder}</strong>.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
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
            placeholder="Search by file name or extension..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ padding: "7px 12px", fontSize: "13px" }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* Category Filter */}
          <select
            className="path-input"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ padding: "7px 12px", fontSize: "13px" }}
          >
            <option value="all">All File Types</option>
            <option value="Documents">Documents</option>
            <option value="Images">Images</option>
            <option value="Videos">Videos</option>
            <option value="Audio">Audio</option>
            <option value="Archives">Archives</option>
            <option value="Code">Code</option>
            <option value="Other">Other</option>
          </select>

          {/* Size Filter */}
          <select
            className="path-input"
            value={sizeFilter}
            onChange={(e) => setSizeFilter(e.target.value)}
            style={{ padding: "7px 12px", fontSize: "13px" }}
          >
            <option value="all">All Sizes</option>
            <option value="small">&lt; 1 MB (Small)</option>
            <option value="medium">1 MB - 50 MB (Medium)</option>
            <option value="large">&gt; 50 MB (Large)</option>
          </select>
        </div>
      </div>

      {/* Files Table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <FolderTree size={16} className="text-primary" />
            Discovered Files ({filteredFiles.length.toLocaleString()} matching)
          </span>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th onClick={() => handleSort("name")} style={{ cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>File Name</span>
                    <ArrowUpDown size={12} />
                  </div>
                </th>
                <th>Type</th>
                <th onClick={() => handleSort("size_bytes")} style={{ cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>Size</span>
                    <ArrowUpDown size={12} />
                  </div>
                </th>
                <th>Folder Location</th>
                <th onClick={() => handleSort("modified")} style={{ cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>Last Modified</span>
                    <ArrowUpDown size={12} />
                  </div>
                </th>
                <th style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredFiles.length > 0 ? (
                filteredFiles.map((file, idx) => {
                  const cat = classifyExtension(file.extension);
                  return (
                    <tr key={file.path ? `expl-${file.path}` : `expl-idx-${idx}`}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          {getFileIcon(cat)}
                          <strong style={{ fontWeight: 600, color: "var(--text-main)" }}>
                            {file.name}
                          </strong>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-neutral">
                          {file.extension || "none"}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{formatBytes(file.size_bytes)}</td>
                      <td
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "12px",
                          maxWidth: "360px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={file.path}
                      >
                        {file.path}
                      </td>
                      <td style={{ color: "var(--text-subtle)", fontSize: "12px", whiteSpace: "nowrap" }}>
                        {formatDateTime(file.modified)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          type="button"
                          className="copy-btn"
                          onClick={() => handleCopyPath(file.path)}
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
                  <td colSpan={6} style={{ textAlign: "center", padding: "32px" }}>
                    No files found matching your search and filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

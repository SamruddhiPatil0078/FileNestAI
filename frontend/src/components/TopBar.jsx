import React, { useState } from "react";
import {
  Folder,
  RefreshCw,
  FolderSearch,
  Check,
  Copy,
  Cpu,
} from "lucide-react";

export default function TopBar({
  selectedFolder,
  onChangeFolder,
  onRescan,
  isScanning,
  backendStatus,
  aiAvailable,
}) {
  const [copied, setCopied] = useState(false);
  const isHealthy = backendStatus === "healthy";

  function handleCopyPath() {
    if (!selectedFolder) return;
    navigator.clipboard.writeText(selectedFolder);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <header className="top-bar">
      <div className="top-bar-left">
        {selectedFolder ? (
          <div className="folder-badge" title={selectedFolder}>
            <Folder size={14} className="text-primary" style={{ flexShrink: 0 }} />
            <span style={{ flexShrink: 0, fontWeight: 500 }}>Target:</span>
            <code style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {selectedFolder}
            </code>
            <button
              type="button"
              className="copy-btn"
              onClick={handleCopyPath}
              title={copied ? "Copied!" : "Copy path"}
            >
              {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
            </button>
          </div>
        ) : (
          <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>No folder selected</span>
        )}
      </div>

      <div className="top-bar-right">
        {/* Backend Status Badge */}
        <div className="connection-tag" title={isHealthy ? "Connected to local FastAPI" : "Backend unreachable"}>
          <span className={`status-dot ${isHealthy ? "healthy" : ""}`} />
          <span>{isHealthy ? "Backend" : "Offline"}</span>
        </div>

        {/* AI Status Badge */}
        <div
          className="connection-tag"
          title={aiAvailable ? "Ollama Gemma 3 1B connected" : "Ollama offline (using rule fallback)"}
        >
          <Cpu size={12} className={aiAvailable ? "text-primary" : "text-subtle"} />
          <span>{aiAvailable ? "Gemma 3" : "Rules"}</span>
        </div>

        {selectedFolder && (
          <div className="top-bar-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm text-nowrap"
              onClick={onChangeFolder}
              disabled={isScanning}
            >
              <FolderSearch size={14} />
              <span>Change Folder</span>
            </button>

            <button
              type="button"
              className="btn btn-primary btn-sm text-nowrap"
              onClick={onRescan}
              disabled={isScanning || !isHealthy}
            >
              <RefreshCw size={14} className={isScanning ? "animate-spin" : ""} />
              <span>{isScanning ? "Scanning..." : "Rescan"}</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

import React, { useState } from "react";
import {
  FolderOpen,
  HardDrive,
  FileSearch,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  FlaskConical,
} from "lucide-react";
import { browseFolder, validateFolder } from "../api";

export default function WelcomeScreen({
  onFolderSelected,
  onStartScan,
  isScanning,
  backendStatus,
  currentFolder,
}) {
  const [inputPath, setInputPath] = useState(currentFolder || "");
  const [validatedPath, setValidatedPath] = useState(currentFolder || "");
  const [validationError, setValidationError] = useState("");
  const [isValidating, setIsValidating] = useState(false);

  const samplePath = "E:\\FileNestAI\\sample_files\\Mixed";

  async function handleBrowse() {
    setValidationError("");
    try {
      setIsValidating(true);
      const res = await browseFolder();
      if (res.selected && res.folder_path) {
        setInputPath(res.folder_path);
        setValidatedPath(res.folder_path);
        onFolderSelected(res.folder_path);
      }
    } catch (err) {
      setValidationError(err.message || "Failed to select folder.");
    } finally {
      setIsValidating(false);
    }
  }

  async function handleValidateManual() {
    if (!inputPath.trim()) {
      setValidationError("Please enter a folder path.");
      return;
    }

    setValidationError("");
    setIsValidating(true);
    try {
      const res = await validateFolder(inputPath.trim());
      if (res.valid && res.folder_path) {
        setValidatedPath(res.folder_path);
        onFolderSelected(res.folder_path);
      }
    } catch (err) {
      setValidationError(err.message || "Invalid or inaccessible folder.");
      setValidatedPath("");
    } finally {
      setIsValidating(false);
    }
  }

  function handleSelectSample() {
    setInputPath(samplePath);
    setValidatedPath(samplePath);
    setValidationError("");
    onFolderSelected(samplePath);
  }

  return (
    <div className="welcome-canvas">
      <div className="welcome-card">
        <div className="welcome-icon-box">
          <HardDrive size={32} />
        </div>

        <h1 className="welcome-title">Take Control of Your Storage</h1>
        <p className="welcome-subtitle">
          FileNest AI analyzes your local files, identifies exact duplicates,
          highlights large space hogs, and recommends safe cleanup — with 100%
          local privacy.
        </p>

        <div className="welcome-selector-box">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-main)" }}>
              Step 1: Choose Folder to Analyze
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleSelectSample}
              style={{ fontSize: "11px", padding: "4px 8px" }}
            >
              <FlaskConical size={12} />
              Use Sample Files
            </button>
          </div>

          <div className="path-input-group">
            <input
              type="text"
              className="path-input"
              placeholder="e.g. D:\Projects or C:\Users\YourName\Documents"
              value={inputPath}
              onChange={(e) => {
                setInputPath(e.target.value);
                setValidationError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleValidateManual();
              }}
            />

            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleBrowse}
              disabled={isValidating || backendStatus !== "healthy"}
              title="Open native Windows Folder Picker"
            >
              <FolderOpen size={16} />
              <span>Browse...</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleValidateManual}
              disabled={isValidating || !inputPath.trim()}
            >
              Verify
            </button>
          </div>

          {validationError && (
            <div style={{ marginTop: "10px", display: "flex", alignItems: "center", gap: "6px", color: "var(--danger)", fontSize: "13px" }}>
              <AlertCircle size={15} />
              <span>{validationError}</span>
            </div>
          )}

          {validatedPath && !validationError && (
            <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "8px", color: "var(--success-text)", fontSize: "13px", backgroundColor: "var(--success-light)", padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--success-border)" }}>
              <CheckCircle2 size={16} />
              <span>
                <strong>Folder verified:</strong> {validatedPath}
              </span>
            </div>
          )}
        </div>

        <div className="folder-feature-list">
          <div className="folder-feature-item">
            <FileSearch size={20} className="text-primary" />
            <div>
              <strong>Duplicate Detection</strong>
              <span>Byte-accurate SHA-256 detection.</span>
            </div>
          </div>

          <div className="folder-feature-item">
            <Sparkles size={20} className="text-warning" />
            <div>
              <strong>Smart Cleanup</strong>
              <span>Review suggestions for inactive files.</span>
            </div>
          </div>

          <div className="folder-feature-item">
            <ShieldCheck size={20} className="text-success" />
            <div>
              <strong>Safe & Protected</strong>
              <span>Never modifies files without your approval.</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: "12px", marginTop: "24px" }}>
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={() => onStartScan(validatedPath)}
            disabled={!validatedPath || isScanning || backendStatus !== "healthy"}
            style={{ minWidth: "220px" }}
          >
            <span>{isScanning ? "Scanning Folder..." : "Scan Folder"}</span>
            <ArrowRight size={18} />
          </button>
        </div>

        <div style={{ marginTop: "16px", fontSize: "12px", color: "var(--text-subtle)" }}>
          Backend status: {backendStatus === "healthy" ? "Connected" : "Waiting for backend..."} · No files will be modified without your approval.
        </div>
      </div>
    </div>
  );
}

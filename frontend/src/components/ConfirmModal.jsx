import React, { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  confirmVariant = "primary",
  onConfirm,
  onCancel,
  isLoading = false,
  children,
}) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape" && isOpen && !isLoading) {
        onCancel();
      }
    }
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isLoading, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={isLoading ? undefined : onCancel} role="dialog" aria-modal="true">
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
            <AlertTriangle
              size={18}
              style={{
                flexShrink: 0,
                color: confirmVariant === "danger" ? "var(--danger)" : "var(--primary)",
              }}
            />
            <h3 style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {title}
            </h3>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onCancel}
            disabled={isLoading}
            style={{ padding: "4px 6px", border: "none" }}
            aria-label="Close dialog"
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          {message && <p style={{ marginBottom: children ? "14px" : 0 }}>{message}</p>}
          {children}
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary text-nowrap"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${confirmVariant === "danger" ? "btn-danger" : "btn-primary"} text-nowrap`}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? "Processing..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

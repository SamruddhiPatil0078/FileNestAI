import React from "react";
import {
  LayoutDashboard,
  PieChart,
  Sparkles,
  FolderTree,
  ShieldCheck,
  History,
  Bot,
  Folder,
  ArchiveRestore,
} from "lucide-react";

export default function Sidebar({
  activeTab,
  setActiveTab,
  selectedFolder,
  cleanupCount = 0,
  protectedCount = 0,
  quarantineCount = 0,
}) {
  const navItems = [
    { id: "dashboard", label: "Overview", icon: LayoutDashboard },
    { id: "analytics", label: "Storage Analytics", icon: PieChart },
    {
      id: "cleanup",
      label: "Smart Cleanup",
      icon: Sparkles,
      badge: cleanupCount > 0 ? cleanupCount : null,
      badgeType: "warning",
    },
    { id: "explorer", label: "File Explorer", icon: FolderTree },
    {
      id: "protected",
      label: "Protected Files",
      icon: ShieldCheck,
      badge: protectedCount > 0 ? protectedCount : null,
    },
    {
      id: "quarantine",
      label: "Quarantine Vault",
      icon: ArchiveRestore,
      badge: quarantineCount > 0 ? quarantineCount : null,
      badgeType: "neutral",
    },
    { id: "history", label: "Activity & Undo", icon: History },
    { id: "assistant", label: "AI Assistant", icon: Bot },
  ];

  const folderBaseName = selectedFolder
    ? selectedFolder.split(/[\\/]/).filter(Boolean).pop() || selectedFolder
    : "";

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-logo">F</div>
        <div style={{ minWidth: 0 }}>
          <span className="sidebar-brand-text">
            FileNest <span className="sidebar-brand-ai">AI</span>
          </span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={`nav-${item.id}`}
              className={`nav-item ${isActive ? "active" : ""}`}
              onClick={() => setActiveTab(item.id)}
            >
              <Icon size={17} style={{ flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.label}
              </span>
              {item.badge !== null && item.badge !== undefined && (
                <span className={`nav-badge ${item.badgeType === "warning" ? "nav-badge-warning" : ""}`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {selectedFolder && (
        <div className="sidebar-footer">
          <div className="sidebar-folder-card">
            <div className="sidebar-folder-label">
              <Folder size={12} />
              <span>Workspace Scope</span>
            </div>
            <div className="sidebar-folder-name" title={selectedFolder}>
              {folderBaseName}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

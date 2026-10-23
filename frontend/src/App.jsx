import React, { useState, useEffect } from "react";
import {
  checkBackend,
  scanFolder,
  analyzeFolder,
  getCleanupSuggestions,
  getProtectedPaths,
  getOperationHistory,
  listQuarantine,
} from "./api";

import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import WelcomeScreen from "./components/WelcomeScreen";

import DashboardPage from "./pages/DashboardPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import CleanupPage from "./pages/CleanupPage";
import ExplorerPage from "./pages/ExplorerPage";
import ProtectedPage from "./pages/ProtectedPage";
import QuarantinePage from "./pages/QuarantinePage";
import HistoryPage from "./pages/HistoryPage";
import AssistantPage from "./pages/AssistantPage";

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedFolder, setSelectedFolder] = useState("");
  const [showWelcome, setShowWelcome] = useState(true);

  const [backendStatus, setBackendStatus] = useState("checking");
  const [aiAvailable, setAiAvailable] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  const [scanData, setScanData] = useState(null);
  const [analysisData, setAnalysisData] = useState(null);
  const [cleanupData, setCleanupData] = useState(null);
  const [protectedPaths, setProtectedPaths] = useState([]);
  const [quarantineCount, setQuarantineCount] = useState(0);
  const [historyData, setHistoryData] = useState({ operations: [] });

  const [notifications, setNotifications] = useState([]);

  // Check health and load initial rules on mount
  useEffect(() => {
    checkHealthAndAi();
    loadProtectedRules();
  }, []);

  async function checkHealthAndAi() {
    try {
      const data = await checkBackend();
      setBackendStatus(data.status || "healthy");
      setAiAvailable(Boolean(data.ollama_available));
    } catch {
      setBackendStatus("unavailable");
      setAiAvailable(false);
    }
  }

  async function loadProtectedRules() {
    try {
      const res = await getProtectedPaths();
      setProtectedPaths(res.protected_paths || []);
    } catch {
      // Non-blocking
    }
  }

  async function loadQuarantineData(targetFolder) {
    const target = targetFolder || selectedFolder;
    if (!target) return;
    try {
      const res = await listQuarantine(target);
      setQuarantineCount((res.quarantined_files || []).length);
    } catch {
      setQuarantineCount(0);
    }
  }

  async function loadHistory(targetFolder) {
    try {
      const target = targetFolder || selectedFolder;
      const res = await getOperationHistory(100, target || null);
      setHistoryData(res || { operations: [] });
    } catch {
      // Non-blocking
    }
  }

  function addNotification({ type = "info", message }) {
    const id = Date.now() + Math.random();
    setNotifications((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 4500);
  }

  async function handleStartScan(folderToScan) {
    const target = folderToScan || selectedFolder;
    if (!target) return;

    setSelectedFolder(target);
    setIsScanning(true);

    try {
      // 1. Scan folder
      const scanRes = await scanFolder(target);
      setScanData(scanRes);

      // 2. Storage Analysis
      const analysisRes = await analyzeFolder(target);
      setAnalysisData(analysisRes);

      // 3. Smart Cleanup suggestions
      const cleanupRes = await getCleanupSuggestions(target);
      setCleanupData(cleanupRes);

      // 4. Update quarantine, history & protection
      await loadProtectedRules();
      await loadQuarantineData(target);
      await loadHistory(target);
      await checkHealthAndAi();

      setShowWelcome(false);

      addNotification({
        type: "success",
        message: `Scanned ${scanRes.file_count} files in '${target.split(/[\\/]/).pop()}'.`,
      });
    } catch (err) {
      addNotification({
        type: "error",
        message: err.message || "Failed to scan folder.",
      });
    } finally {
      setIsScanning(false);
    }
  }

  function handleRescan() {
    if (selectedFolder) {
      handleStartScan(selectedFolder);
    }
  }

  function handleChangeFolder() {
    setShowWelcome(true);
  }

  return (
    <div className="app-shell">
      {/* Toast Notifications */}
      <div className="toast-container">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`toast ${n.type === "error" ? "toast-error" : "toast-success"}`}
          >
            <span>{n.message}</span>
          </div>
        ))}
      </div>

      {showWelcome ? (
        <WelcomeScreen
          currentFolder={selectedFolder}
          onFolderSelected={(folder) => setSelectedFolder(folder)}
          onStartScan={handleStartScan}
          isScanning={isScanning}
          backendStatus={backendStatus}
        />
      ) : (
        <>
          <Sidebar
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            selectedFolder={selectedFolder}
            cleanupCount={cleanupData?.suggestion_count || 0}
            protectedCount={protectedPaths.length}
            quarantineCount={quarantineCount}
          />

          <div className="main-wrapper">
            <TopBar
              selectedFolder={selectedFolder}
              onChangeFolder={handleChangeFolder}
              onRescan={handleRescan}
              isScanning={isScanning}
              backendStatus={backendStatus}
              aiAvailable={aiAvailable}
            />

            <main>
              {activeTab === "dashboard" && (
                <DashboardPage
                  scanData={scanData}
                  analysisData={analysisData}
                  cleanupData={cleanupData}
                  historyData={historyData}
                  selectedFolder={selectedFolder}
                  onNavigate={setActiveTab}
                  onRescan={handleRescan}
                  isScanning={isScanning}
                />
              )}

              {activeTab === "analytics" && (
                <AnalyticsPage
                  scanData={scanData}
                  analysisData={analysisData}
                  selectedFolder={selectedFolder}
                  onNavigate={setActiveTab}
                  onRefreshAll={handleRescan}
                  onNotify={addNotification}
                />
              )}

              {activeTab === "cleanup" && (
                <CleanupPage
                  cleanupData={cleanupData}
                  analysisData={analysisData}
                  onProtectSuccess={() => {
                    loadProtectedRules();
                    if (selectedFolder) {
                      getCleanupSuggestions(selectedFolder).then(setCleanupData);
                    }
                  }}
                  onExecuteSuccess={handleRescan}
                  onNotify={addNotification}
                  selectedFolder={selectedFolder}
                />
              )}

              {activeTab === "explorer" && (
                <ExplorerPage
                  scanData={scanData}
                  selectedFolder={selectedFolder}
                  onNotify={addNotification}
                />
              )}

              {activeTab === "protected" && (
                <ProtectedPage
                  protectedPaths={protectedPaths}
                  onRefresh={loadProtectedRules}
                  onNotify={addNotification}
                  selectedFolder={selectedFolder}
                />
              )}

              {activeTab === "quarantine" && (
                <QuarantinePage
                  selectedFolder={selectedFolder}
                  onNotify={addNotification}
                  onRefreshAll={handleRescan}
                />
              )}

              {activeTab === "history" && (
                <HistoryPage
                  historyData={historyData}
                  onRefresh={() => loadHistory(selectedFolder)}
                  onNotify={addNotification}
                  selectedFolder={selectedFolder}
                />
              )}

              {activeTab === "assistant" && (
                <AssistantPage
                  scanData={scanData}
                  analysisData={analysisData}
                  selectedFolder={selectedFolder}
                  onNotify={addNotification}
                  onRefreshAll={handleRescan}
                  onNavigate={setActiveTab}
                />
              )}
            </main>
          </div>
        </>
      )}
    </div>
  );
}

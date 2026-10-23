const API_BASE = "http://127.0.0.1:8000";

/**
 * Helper to handle fetch responses and extract meaningful error messages.
 */
async function handleResponse(response) {
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Invalid server response (HTTP ${response.status})`);
  }

  if (!response.ok) {
    const errorMsg = data.detail || data.message || `Request failed (HTTP ${response.status})`;
    throw new Error(errorMsg);
  }

  return data;
}

/**
 * Backend health check.
 */
export async function checkBackend() {
  const response = await fetch(`${API_BASE}/api/health`);
  return handleResponse(response);
}

/**
 * Trigger the native Windows folder selection dialog.
 */
export async function browseFolder() {
  const response = await fetch(`${API_BASE}/api/browse-folder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  return handleResponse(response);
}

/**
 * Validate that a folder path is valid, accessible, and not a system directory.
 */
export async function validateFolder(folderPath) {
  const response = await fetch(`${API_BASE}/api/validate-folder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder_path: folderPath }),
  });
  return handleResponse(response);
}

/**
 * Scan a folder to discover files and metadata.
 */
export async function scanFolder(folderPath) {
  const response = await fetch(`${API_BASE}/api/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder_path: folderPath }),
  });
  return handleResponse(response);
}

/**
 * Run storage analysis (duplicates, large files, folder hierarchy).
 */
export async function analyzeFolder(folderPath) {
  const response = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder_path: folderPath }),
  });
  return handleResponse(response);
}

/**
 * Fetch cleanup suggestions for the selected folder.
 */
export async function getCleanupSuggestions(folderPath) {
  const response = await fetch(`${API_BASE}/api/cleanup/suggestions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: folderPath }),
  });
  return handleResponse(response);
}

/**
 * Execute approved cleanup actions (quarantine, protect).
 */
export async function executeCleanupActions({ items, allowedRoot, approved = true }) {
  const response = await fetch(`${API_BASE}/api/cleanup/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items,
      allowed_root: allowedRoot,
      approved,
    }),
  });
  return handleResponse(response);
}

/**
 * Fetch list of protected files and folders.
 */
export async function getProtectedPaths() {
  const response = await fetch(`${API_BASE}/api/cleanup/protected`);
  return handleResponse(response);
}

/**
 * Mark a file or folder as protected.
 */
export async function protectPath(path) {
  const response = await fetch(`${API_BASE}/api/cleanup/protect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  return handleResponse(response);
}

/**
 * Unprotect a previously protected file or folder.
 */
export async function unprotectPath(path) {
  const response = await fetch(`${API_BASE}/api/cleanup/unprotect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  return handleResponse(response);
}

/**
 * Retrieve operation history log.
 */
export async function getOperationHistory(limit = 100, workspaceRoot = null) {
  let url = `${API_BASE}/api/operations/history?limit=${limit}`;
  if (workspaceRoot) {
    url += `&workspace_root=${encodeURIComponent(workspaceRoot)}`;
  }
  const response = await fetch(url);
  return handleResponse(response);
}

/**
 * Move a single file after explicit approval.
 */
export async function moveFile({ sourcePath, destinationPath, approved = true, allowedRoot = null }) {
  const response = await fetch(`${API_BASE}/api/operations/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_path: sourcePath,
      destination_path: destinationPath,
      approved,
      allowed_root: allowedRoot,
    }),
  });
  return handleResponse(response);
}

/**
 * Undo a completed file move or quarantine.
 */
export async function undoOperation(operationId, { approved = true, allowedRoot = null } = {}) {
  const response = await fetch(`${API_BASE}/api/operations/${operationId}/undo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      approved,
      allowed_root: allowedRoot,
    }),
  });
  return handleResponse(response);
}

/**
 * Get organization suggestions (AI + rule-based fallback).
 */
export async function getOrganizationSuggestions(folderPath, organizationMode = "inside") {
  const response = await fetch(`${API_BASE}/api/organize/suggestions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      folder_path: folderPath,
      organization_mode: organizationMode,
    }),
  });
  return handleResponse(response);
}

/**
 * Execute approved batch organization plan.
 */
export async function executeOrganizationPlan({ plan, allowedRoot, approved = true }) {
  const response = await fetch(`${API_BASE}/api/organize/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      plan,
      allowed_root: allowedRoot,
      approved,
    }),
  });
  return handleResponse(response);
}

/**
 * Retrieve list of files currently in quarantine.
 */
export async function listQuarantine(folderPath) {
  const response = await fetch(`${API_BASE}/api/quarantine?folder_path=${encodeURIComponent(folderPath)}`);
  return handleResponse(response);
}

/**
 * Restore a quarantined file.
 */
export async function restoreQuarantine(operationId, allowedRoot) {
  const response = await fetch(`${API_BASE}/api/quarantine/${operationId}/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      approved: true,
      allowed_root: allowedRoot,
    }),
  });
  return handleResponse(response);
}

/**
 * Permanently delete a quarantined file.
 */
export async function deleteQuarantine(operationId, allowedRoot) {
  const response = await fetch(`${API_BASE}/api/quarantine/${operationId}/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      approved: true,
      allowed_root: allowedRoot,
    }),
  });
  return handleResponse(response);
}

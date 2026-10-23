/**
 * Format bytes into human-readable B, KB, MB, GB, TB.
 */
export function formatBytes(bytes = 0) {
  if (bytes === 0 || bytes === null || bytes === undefined) return "0 B";
  const num = Number(bytes);
  if (isNaN(num)) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(num) / Math.log(1024));
  const clampedIndex = Math.min(i, units.length - 1);
  if (clampedIndex === 0) return `${num} B`;

  return `${(num / Math.pow(1024, clampedIndex)).toFixed(2)} ${units[clampedIndex]}`;
}

/**
 * Format ISO datetime into a clean, human-readable date and time.
 */
export function formatDateTime(isoString) {
  if (!isoString) return "—";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString.replace("T", " ").slice(0, 19);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return String(isoString);
  }
}

/**
 * Classify file extensions into standardized high-level categories.
 */
export function classifyExtension(ext = "") {
  const cleanExt = (ext || "").toLowerCase().trim();

  const categories = {
    Documents: [
      ".txt", ".pdf", ".doc", ".docx", ".rtf", ".odt",
      ".xls", ".xlsx", ".csv", ".ppt", ".pptx", ".md",
    ],
    Images: [
      ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp",
      ".svg", ".tif", ".tiff", ".heic", ".ico",
    ],
    Videos: [
      ".mp4", ".mkv", ".mov", ".avi", ".webm", ".wmv",
      ".m4v", ".flv",
    ],
    Audio: [
      ".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a", ".wma",
    ],
    Archives: [
      ".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".iso",
    ],
    Code: [
      ".js", ".jsx", ".ts", ".tsx", ".py", ".html", ".css",
      ".json", ".java", ".c", ".cpp", ".cs", ".go", ".rs", ".sql",
    ],
  };

  for (const [category, extensions] of Object.entries(categories)) {
    if (extensions.includes(cleanExt)) {
      return category;
    }
  }

  return "Other";
}

export const CATEGORY_COLORS = {
  Documents: "#3B82F6", // Blue
  Images: "#6366F1",    // Indigo
  Videos: "#8B5CF6",    // Purple
  Audio: "#EC4899",     // Pink
  Archives: "#F59E0B",   // Amber
  Code: "#10B981",       // Green
  Other: "#64748B",      // Slate
};

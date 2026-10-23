
import os
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

from typing import Optional
from app.services.scanner import scan_folder, TEST_ROOT
from app.services.storage_analyzer import analyze_folder
from app.services.path_security import validate_accessible_folder


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DB_PATH = PROJECT_ROOT / "filenest_cleanup.db"

LARGE_FILE_BYTES = 500 * 1024 * 1024
INACTIVE_FILE_DAYS = 180
VERY_OLD_FILE_DAYS = 365
ARCHIVE_REVIEW_BYTES = 50 * 1024 * 1024

# Never suggest personal photos or videos based on age alone.
PERSONAL_MEDIA = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp",
    ".heic", ".raw", ".mp4", ".mov", ".avi", ".mkv",
    ".wmv", ".m4v", ".3gp",
}

ARCHIVE_EXTENSIONS = {
    ".zip", ".rar", ".7z", ".tar", ".gz", ".bz2"
}

TEMP_EXTENSIONS = {
    ".tmp", ".temp"
}

REVIEW_EXTENSIONS = {
    ".log", ".bak", ".old"
}

def _init_db():
    """Create the persistent protection table if it doesn't exist."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS protected_paths (
                path TEXT PRIMARY KEY,
                kind TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)


def _validated_path(path: str, allowed_root: Optional[Path] = None) -> Path:
    """Validate a file or folder for protection."""
    requested = Path(path).expanduser()

    if requested.is_symlink():
        raise ValueError("Symbolic links cannot be protected.")

    candidate = requested.resolve(strict=True)

    if allowed_root is not None:
        if not candidate.is_relative_to(allowed_root.resolve()):
            raise ValueError(f"Path is outside the approved folder: {allowed_root}")
    elif TEST_ROOT is not None and candidate.is_relative_to(TEST_ROOT.resolve()):
        pass
    else:
        # Validate that the folder/parent is not a restricted system path
        folder_to_check = candidate if candidate.is_dir() else candidate.parent
        validate_accessible_folder(str(folder_to_check))

    if not candidate.is_file() and not candidate.is_dir():
        raise ValueError("Select an existing file or folder.")

    return candidate


def protect_path(path: str, allowed_root: Optional[Path] = None) -> dict:
    """Persist protection for a file or folder."""
    _init_db()
    target = _validated_path(path, allowed_root=allowed_root)
    kind = "folder" if target.is_dir() else "file"

    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO protected_paths (path, kind, created_at)
            VALUES (?, ?, ?)
            ON CONFLICT(path) DO NOTHING
            """,
            (
                str(target),
                kind,
                datetime.now().isoformat(timespec="seconds"),
            ),
        )

    return {
        "path": str(target),
        "kind": kind,
        "protected": True,
    }


def unprotect_path(path: str, allowed_root: Optional[Path] = None) -> dict:
    """Remove a saved protection rule."""
    _init_db()
    target = _validated_path(path, allowed_root=allowed_root)

    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "DELETE FROM protected_paths WHERE path = ?",
            (str(target),),
        )

    return {
        "path": str(target),
        "protected": False,
    }


def get_protected_paths() -> list:
    """Return all persisted protection rules."""
    _init_db()

    with sqlite3.connect(DB_PATH) as conn:
        rows = conn.execute(
            """
            SELECT path, kind, created_at
            FROM protected_paths
            ORDER BY path
            """
        ).fetchall()

    return [
        {
            "path": path,
            "kind": kind,
            "created_at": created_at,
        }
        for path, kind, created_at in rows
    ]


def _is_protected(path: Path, protected: list) -> bool:
    """Windows-safe check for protected files and their parent folders."""
    candidate = os.path.normcase(os.path.abspath(str(path)))

    for item in protected:
        protected_path = os.path.normcase(
            os.path.abspath(item["path"])
        )

        # Protect the exact path or anything inside a protected folder.
        if candidate == protected_path:
            return True

        folder_prefix = protected_path.rstrip("\\/") + os.sep

        if candidate.startswith(folder_prefix):
            return True

    return False



def get_cleanup_suggestions(folder_path: str, allowed_root: Optional[Path] = None) -> dict:
    """
    Return review suggestions only.
    This function never deletes or moves files.
    """
    scan = scan_folder(folder_path, allowed_root=allowed_root)
    analysis = analyze_folder(folder_path, allowed_root=allowed_root)
    protected = get_protected_paths()

    now = datetime.now()
    suggestions = {}

    def add_suggestion(
        file_info: dict,
        reason: str,
        category: str,
        priority: str = "medium",
    ):
        path = Path(file_info["path"]).resolve()

        if _is_protected(path, protected):
            return

        key = str(path)

        if key not in suggestions:
            suggestions[key] = {
                "name": file_info["name"],
                "path": key,
                "size_bytes": file_info["size_bytes"],
                "reasons": [],
                "category": category,
                "priority": priority,
                "status": "Review suggested",
                "protected": False,
                "requires_user_approval": True,
            }

        # Preserve all reasons when a file matches multiple rules.
        if reason not in suggestions[key]["reasons"]:
            suggestions[key]["reasons"].append(reason)

        # Keep the highest priority assigned to this file.
        priority_rank = {"low": 0, "medium": 1, "high": 2}
        if priority_rank[priority] > priority_rank[
            suggestions[key]["priority"]
        ]:
            suggestions[key]["priority"] = priority

    # 1. Inactive files, archives, temporary files and large-file insights.
    for item in scan["files"]:
        ext = item["extension"].lower()

        try:
            modified = datetime.fromisoformat(item["modified"])
            age = now - modified
        except (ValueError, TypeError):
            age = None

        # Main cleanup rule: inactivity.
        # Never suggest personal media based on age alone.
        if ext not in PERSONAL_MEDIA and age is not None:
            if age >= timedelta(days=VERY_OLD_FILE_DAYS):
                add_suggestion(
                    item,
                    "Not modified for over 12 months; review whether it is still needed.",
                    "potentially_unused",
                    "high",
                )
            elif age >= timedelta(days=INACTIVE_FILE_DAYS):
                add_suggestion(
                    item,
                    "Not modified for at least 6 months; review whether it is still needed.",
                    "potentially_unused",
                    "medium",
                )

        # Temporary files are candidates, but may still be in use.
        if ext in TEMP_EXTENSIONS:
            add_suggestion(
                item,
                "Temporary-file type; verify it is not being used by an active application.",
                "temporary_file",
                "high",
            )

        # Backup, log and old files: require at least 30 days of inactivity.
        elif ext in REVIEW_EXTENSIONS and age is not None:
            if age >= timedelta(days=30):
                add_suggestion(
                    item,
                    "Log, backup or old-file type not modified for at least 30 days; review before cleanup.",
                    "review_file_type",
                    "medium",
                )

        # Archives are review candidates if old OR relatively large.
        if ext in ARCHIVE_EXTENSIONS:
            if (
                (age is not None and age >= timedelta(
                    days=INACTIVE_FILE_DAYS
                ))
                or item["size_bytes"] >= ARCHIVE_REVIEW_BYTES
            ):
                add_suggestion(
                    item,
                    "Archive is old or at least 50 MB; check its contents and whether another copy is needed.",
                    "archive_review",
                    "medium",
                )

        # Large files are storage insights, not automatically unused.
        # They are only included here if they already qualify for another
        # cleanup category; large-file insights remain in storage analysis.

    # 2. Identify duplicate copies using the analyzer's verified duplicate groups.
    file_lookup = {
        item["path"]: item
        for item in scan["files"]
    }

    for group in analysis.get("duplicate_groups", []):
        duplicate_files = []

        for duplicate in group.get("files", []):
            item = file_lookup.get(duplicate.get("path"))
            if item:
                duplicate_files.append(item)

        if len(duplicate_files) < 2:
            continue

        # Prefer to retain the newest copy as a default suggestion rule.
        # This is only a recommendation; no copy is deleted.
        def modified_timestamp(item):
            try:
                return datetime.fromisoformat(
                    item["modified"]
                ).timestamp()
            except (ValueError, TypeError, KeyError):
                return 0

        duplicate_files.sort(
            key=modified_timestamp,
            reverse=True,
        )

        # Suggest the remaining copies for review, not the newest copy.
        for item in duplicate_files[1:]:
            add_suggestion(
                item,
                "Identical content found in another file; compare locations and keep at least one copy.",
                "duplicate",
                "high",
            )

    # 3. Sort high-priority candidates first, then by size.
    priority_rank = {"high": 2, "medium": 1, "low": 0}

    results = sorted(
        suggestions.values(),
        key=lambda item: (
            priority_rank[item["priority"]],
            item["size_bytes"],
        ),
        reverse=True,
    )

    return {
        "folder": scan["folder"],
        "suggestion_count": len(results),
        "suggestions": results,
        "protected_paths": protected,
        "read_only": True,
        "message": "Suggestions only. No files were deleted or moved.",
        "errors": (scan["errors"] + analysis["errors"])[:30],
    }

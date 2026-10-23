import json
import os
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List, Dict, Any

from app.services.operation_history import (
    create_pending_operation,
    update_operation_status,
    get_connection,
)
from app.services.cleanup_service import _is_protected, get_protected_paths
from app.services.path_security import validate_accessible_folder, validate_path_within_root


def get_quarantine_dir(allowed_root: Path) -> Path:
    """Return the quarantine directory inside the approved workspace root."""
    quarantine_dir = allowed_root / ".filenest_quarantine"
    quarantine_dir.mkdir(parents=True, exist_ok=True)
    return quarantine_dir


def quarantine_file(
    file_path: str,
    allowed_root: Path,
    approved: bool = False,
    reason: str = "Smart cleanup quarantine",
) -> Dict[str, Any]:
    """
    Safely move a file to the workspace quarantine folder after user approval.
    Re-checks file existence, permissions, and protection before acting.
    """
    if approved is not True:
        raise ValueError("Explicit approval is required to quarantine files.")

    root = allowed_root.resolve(strict=True)
    source = validate_path_within_root(file_path, root, must_exist=True)

    if not source.is_file():
        raise ValueError(f"Source is not a regular file: {source}")

    if source.is_symlink():
        raise ValueError("Symbolic links cannot be quarantined.")

    # Re-check protection rules
    protected_rules = get_protected_paths()
    if _is_protected(source, protected_rules):
        raise ValueError(f"Cannot quarantine protected file: {source.name}")

    file_size = source.stat().st_size
    quarantine_dir = get_quarantine_dir(root)

    # Unique timestamped destination inside quarantine
    timestamp_prefix = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    target_name = f"{timestamp_prefix}_{source.name}"
    target_path = quarantine_dir / target_name

    # Handle collision inside quarantine just in case
    counter = 1
    while target_path.exists():
        target_name = f"{timestamp_prefix}_{counter}_{source.name}"
        target_path = quarantine_dir / target_name
        counter += 1

    # Record intent in history before modifying filesystem
    operation_id = create_pending_operation(
        operation_type="quarantine",
        source_path=str(source),
        destination_path=str(target_path),
    )

    try:
        # Physical move into quarantine
        os.replace(str(source), str(target_path))
        update_operation_status(operation_id, "completed")

        return {
            "success": True,
            "operation_id": operation_id,
            "source_path": str(source),
            "quarantined_path": str(target_path),
            "size_bytes": file_size,
            "reason": reason,
        }
    except Exception as exc:
        update_operation_status(operation_id, "failed")
        raise RuntimeError(f"Failed to quarantine file '{source.name}': {exc}") from exc


def _prune_quarantine_if_empty(quarantine_dir: Path):
    """Safely remove the .filenest_quarantine directory if it exists and has no remaining files."""
    try:
        resolved = quarantine_dir.resolve()
        if resolved.is_dir() and resolved.name == ".filenest_quarantine":
            # Check if directory has any entries left
            if not any(resolved.iterdir()):
                resolved.rmdir()
    except OSError:
        pass


def restore_quarantined_file(
    operation_id: int,
    allowed_root: Path,
    approved: bool = False,
) -> Dict[str, Any]:
    """
    Restore a quarantined file back to its exact original path.
    Re-checks that the original location is not already occupied.
    """
    if approved is not True:
        raise ValueError("Explicit approval is required to restore quarantined files.")

    root = allowed_root.resolve(strict=True)

    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT id, operation_type, source_path, destination_path, status
            FROM file_operations
            WHERE id = ?
            """,
            (operation_id,),
        ).fetchone()

    if not row:
        raise ValueError(f"Operation record #{operation_id} not found.")

    op = dict(row)
    if op["operation_type"] != "quarantine":
        raise ValueError(f"Operation #{operation_id} is not a quarantine operation.")

    if op["status"] != "completed":
        raise ValueError(f"Cannot restore operation with status '{op['status']}'.")

    original_path = Path(op["source_path"])
    quarantined_path = Path(op["destination_path"])

    # Ensure both paths are within root
    if not original_path.resolve().is_relative_to(root) or not quarantined_path.resolve().is_relative_to(root):
        raise ValueError("Operation paths are outside the authorized workspace.")

    if not quarantined_path.is_file():
        raise ValueError(f"Quarantined file missing from: {quarantined_path}")

    if original_path.exists():
        raise ValueError(f"Cannot restore: original location is already occupied by another file ({original_path.name}).")

    # Ensure parent directory exists for original path
    original_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        os.replace(str(quarantined_path), str(original_path))
        undone_at = datetime.now(timezone.utc).isoformat()
        update_operation_status(operation_id, "undone", undone_at=undone_at)

        # Automatically remove quarantine folder if it is now empty
        _prune_quarantine_if_empty(quarantined_path.parent)

        return {
            "success": True,
            "operation_id": operation_id,
            "restored_path": str(original_path),
        }
    except Exception as exc:
        raise RuntimeError(f"Failed to restore quarantined file: {exc}") from exc


def permanently_delete_quarantined_file(
    operation_id: int,
    allowed_root: Path,
    approved: bool = False,
) -> Dict[str, Any]:
    """
    Permanently delete a file that is currently in quarantine after explicit user approval.
    """
    if approved is not True:
        raise ValueError("Explicit approval is required for permanent deletion.")

    root = allowed_root.resolve(strict=True)

    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT id, operation_type, source_path, destination_path, status
            FROM file_operations
            WHERE id = ?
            """,
            (operation_id,),
        ).fetchone()

    if not row:
        raise ValueError(f"Operation record #{operation_id} not found.")

    op = dict(row)
    if op["operation_type"] != "quarantine":
        raise ValueError("Only quarantined files can be permanently deleted through this workflow.")

    if op["status"] != "completed":
        raise ValueError(f"Cannot delete file for operation with status '{op['status']}'.")

    quarantined_path = Path(op["destination_path"])

    if not quarantined_path.resolve().is_relative_to(root):
        raise ValueError("Quarantine path is outside the authorized workspace.")

    if not quarantined_path.is_file():
        raise ValueError("Quarantined file not found on disk.")

    try:
        os.remove(str(quarantined_path))
        update_operation_status(operation_id, "deleted")

        # Automatically remove quarantine folder if it is now empty
        _prune_quarantine_if_empty(quarantined_path.parent)

        return {
            "success": True,
            "operation_id": operation_id,
            "deleted_path": str(quarantined_path),
        }
    except Exception as exc:
        raise RuntimeError(f"Failed to permanently delete quarantined file: {exc}") from exc


def get_quarantined_files(allowed_root: Path) -> List[Dict[str, Any]]:
    """List all files currently held in quarantine within this workspace."""
    root = allowed_root.resolve(strict=True)

    # Prune empty quarantine directory if left over
    _prune_quarantine_if_empty(root / ".filenest_quarantine")

    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, operation_type, source_path, destination_path, status, created_at
            FROM file_operations
            WHERE operation_type = 'quarantine' AND status = 'completed'
            ORDER BY id DESC
            """
        ).fetchall()

    results = []
    for r in rows:
        d = dict(r)
        q_path = Path(d["destination_path"])
        # Only include if actually within this root and still exists on disk
        if q_path.resolve().is_relative_to(root) and q_path.is_file():
            d["size_bytes"] = q_path.stat().st_size
            d["filename"] = Path(d["source_path"]).name
            results.append(d)

    return results



import os
from datetime import datetime, timezone
from pathlib import Path

from app.services.operation_history import (
    get_connection,
    update_operation_status,
)


def _prune_empty_ancestors(folder: Path, root: Path):
    """
    Remove empty parent directories up to (but excluding) the workspace root.
    Only removes folders that are completely empty.
    """
    try:
        curr = folder.resolve()
        resolved_root = root.resolve()

        while curr != resolved_root and curr.is_relative_to(resolved_root):
            if any(curr.iterdir()):
                break
            curr.rmdir()
            curr = curr.parent
    except OSError:
        pass


def undo_file_move(
    operation_id: int,
    allowed_root: Path,
    approved: bool = False,
) -> dict:
    """Undo a completed move after explicit approval."""

    if approved is not True:
        raise ValueError("Explicit approval is required to undo.")

    try:
        root = allowed_root.resolve(strict=True)

        if not root.is_dir():
            raise ValueError("Approved root must be a directory.")

        with get_connection() as connection:
            row = connection.execute(
                """
                SELECT id, operation_type, source_path,
                       destination_path, status
                FROM file_operations
                WHERE id = ?
                """,
                (operation_id,),
            ).fetchone()

        if row is None:
            raise ValueError("Operation was not found.")

        operation = dict(row)

        if operation["operation_type"] == "quarantine":
            from app.services.quarantine_service import restore_quarantined_file
            return restore_quarantined_file(operation_id, root, approved=approved)

        if operation["operation_type"] != "move":
            raise ValueError("Only file moves and quarantines can be undone.")

        if operation["status"] != "completed":
            raise ValueError("Only completed operations can be undone.")

        original = Path(operation["source_path"])
        moved = Path(operation["destination_path"])

        # Both paths must remain within the approved root.
        if not original.is_relative_to(root) or not moved.is_relative_to(root):
            raise ValueError("Operation paths are outside the approved folder.")

        # Resolve the current paths to detect symlink/path changes.
        if moved.is_symlink() or not moved.is_file():
            raise ValueError("Moved file is missing or is not a regular file.")

        if moved.resolve(strict=True).parent != moved.parent.resolve(strict=True):
            raise ValueError("Moved file path is no longer safe.")

        if original.exists() or original.is_symlink():
            raise ValueError("Original location is already occupied.")

        original_parent = original.parent.resolve(strict=True)

        if not original_parent.is_relative_to(root):
            raise ValueError("Original folder is outside the approved root.")

        # Recheck before moving the file back.
        if original.exists() or original.is_symlink():
            raise ValueError("Original location is already occupied.")

        os.rename(str(moved), str(original))

        undone_at = datetime.now(timezone.utc).isoformat()

        if not update_operation_status(
            operation_id,
            "undone",
            undone_at=undone_at,
        ):
            # Attempt to restore the previous state if history update fails.
            try:
                os.rename(str(original), str(moved))
            except OSError:
                raise RuntimeError(
                    "Undo history update failed and automatic recovery failed."
                )

            raise RuntimeError("Could not update operation history.")

        # Safely prune empty directories created during organization
        _prune_empty_ancestors(moved.parent, root)

        return {
            "success": True,
            "operation_id": operation_id,
            "restored_path": str(original),
            "operation": "undo",
        }

    except (OSError, RuntimeError) as exc:
        raise RuntimeError("Could not safely undo this operation.") from exc

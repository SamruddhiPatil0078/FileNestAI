
from pathlib import Path
from app.services.operation_history import (
    create_pending_operation,
    update_operation_status,
)


def validate_file_move(
    source_value: str,
    destination_value: str,
    allowed_root: Path,
    create_destination: bool = False,
) -> dict:
    """
    Validate a proposed file move without changing any files.
    """

    try:
        root = allowed_root.resolve(strict=True)
        source_input = Path(source_value)
        destination_input = Path(destination_value)

        # Reject a symlink used as the source itself.
        if source_input.is_symlink():
            raise ValueError("Symbolic-link sources are not allowed.")

        source = source_input.resolve(strict=True)

        if not source.is_relative_to(root):
            raise ValueError("Source is outside the approved folder.")

        if not source.is_file():
            raise ValueError("Source must be an existing regular file.")

        # Reject symbolic-link destinations.
        if destination_input.is_symlink():
            raise ValueError("Symbolic-link destinations are not allowed.")

        if destination_input.exists():
            destination = destination_input.resolve(strict=True)

            if not destination.is_relative_to(root):
                raise ValueError(
                    "Destination is outside the approved folder."
                )

            if not destination.is_dir():
                raise ValueError("Destination must be a folder.")

        else:
            if not create_destination:
                raise ValueError(
                    "Destination folder does not exist."
                )

            destination_parent = destination_input.parent.resolve(
                strict=True
            )

            if not destination_parent.is_relative_to(root):
                raise ValueError(
                    "Destination parent is outside the approved folder."
                )

            destination = destination_parent / destination_input.name

        if source.parent == destination:
            raise ValueError(
                "Source file is already in the destination folder."
            )

        target = destination / source.name

        if target.exists() or target.is_symlink():
            raise ValueError(
                "A file with this name already exists at the destination."
            )

        return {
            "valid": True,
            "source": str(source),
            "destination_folder": str(destination),
            "destination_file": str(target),
            "will_create_destination": not destination.exists(),
            "read_only": True,
        }

    except (OSError, RuntimeError) as exc:
        raise ValueError(
            "Could not safely validate the proposed file move."
        ) from exc

    
import shutil



import os
from pathlib import Path



def move_file_after_approval(
    source_value: str,
    destination_value: str,
    allowed_root: Path,
    approved: bool = False,
) -> dict:
    """Move one file after explicit approval and track its status."""

    if approved is not True:
        raise ValueError("Explicit approval is required.")

    from app.services.cleanup_service import _is_protected, get_protected_paths
    protected_rules = get_protected_paths()
    if _is_protected(Path(source_value).resolve(), protected_rules):
        raise PermissionError(f"Cannot move protected path: {source_value}")

    validation = validate_file_move(
        source_value=source_value,
        destination_value=destination_value,
        allowed_root=allowed_root,
        create_destination=False,
    )

    source = Path(validation["source"])
    target = Path(validation["destination_file"])

    if source.is_symlink() or not source.is_file():
        raise ValueError("Source file is no longer safe to move.")

    if target.exists() or target.is_symlink():
        raise ValueError("Destination file already exists.")

    # Record intent before changing the filesystem.
    operation_id = create_pending_operation(
        operation_type="move",
        source_path=str(source),
        destination_path=str(target),
    )

    try:
        # Recheck immediately before the move.
        if source.is_symlink() or not source.is_file():
            raise ValueError("Source file is no longer safe to move.")

        if target.exists() or target.is_symlink():
            raise ValueError("Destination file already exists.")

        os.rename(str(source), str(target))

    except ValueError:
        update_operation_status(operation_id, "failed")
        raise
    except OSError as exc:
        update_operation_status(operation_id, "failed")
        raise RuntimeError("The file move failed.") from exc

    # If this database update fails, the pending record remains
    # available for later reconciliation.
    update_operation_status(operation_id, "completed")

    return {
        "success": True,
        "source": str(source),
        "destination": str(target),
        "operation": "move",
        "operation_id": operation_id,
    }


def execute_batch_moves(
    moves: list[dict],
    allowed_root: Path,
    approved: bool = False,
) -> dict:
    """Execute a batch of approved file movements with path and protection validation."""
    if approved is not True:
        raise ValueError("Explicit approval is required to execute batch file organization.")

    from app.services.cleanup_service import _is_protected, get_protected_paths
    from app.services.path_security import validate_path_within_root

    root = allowed_root.resolve(strict=True)
    protected_rules = get_protected_paths()

    results = []
    success_count = 0
    failure_count = 0

    for item in moves:
        source_str = item.get("source_path", "")
        dest_str = item.get("destination_path", "")
        item_approved = item.get("approved", True)

        if not item_approved:
            results.append({
                "source": source_str,
                "destination": dest_str,
                "status": "skipped",
                "error": "User excluded this item from execution",
            })
            continue

        try:
            source_p = validate_path_within_root(source_str, root, must_exist=True)
            if _is_protected(source_p, protected_rules):
                raise ValueError(f"File '{source_p.name}' is protected and cannot be moved.")

            dest_folder = Path(dest_str)
            if not dest_folder.is_absolute():
                dest_folder = root / dest_str

            dest_folder = validate_path_within_root(str(dest_folder), root, must_exist=False)

            # Ensure destination folder exists within workspace root
            dest_folder.mkdir(parents=True, exist_ok=True)

            res = move_file_after_approval(
                source_value=str(source_p),
                destination_value=str(dest_folder),
                allowed_root=root,
                approved=True,
            )
            results.append({
                "source": str(source_p),
                "destination": res["destination"],
                "status": "completed",
                "operation_id": res["operation_id"],
                "error": None,
            })
            success_count += 1
        except Exception as exc:
            results.append({
                "source": source_str,
                "destination": dest_str,
                "status": "failed",
                "error": str(exc),
            })
            failure_count += 1

    return {
        "success": failure_count == 0,
        "total_moved": success_count,
        "successful_moves": success_count,
        "total_failed": failure_count,
        "failed_moves": failure_count,
        "results": results,
    }


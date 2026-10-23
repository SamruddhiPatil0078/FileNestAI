
from pathlib import Path
from datetime import datetime
import os
from typing import Optional

from app.services.path_security import validate_accessible_folder

# During initial testing and automated tests, this dedicated test folder is used.
PROJECT_ROOT = Path(__file__).resolve().parents[3]
TEST_ROOT = (PROJECT_ROOT / "sample_files").resolve()

MAX_FILES = 5000


def scan_folder(folder_path: str, allowed_root: Optional[Path] = None) -> dict:
    if allowed_root is not None:
        requested = Path(folder_path).resolve(strict=True)
        if not requested.is_dir():
            raise ValueError("The selected path is not a folder.")
        if not requested.is_relative_to(allowed_root.resolve()):
            raise ValueError(f"For now, scan only {allowed_root} or one of its subfolders.")
    else:
        requested = validate_accessible_folder(folder_path)

    files = []
    errors = []
    total_size = 0
    pending = [requested]

    while pending and len(files) < MAX_FILES:
        current = pending.pop()

        try:
            with os.scandir(current) as entries:
                for entry in entries:
                    if len(files) >= MAX_FILES:
                        break

                    try:
                        # Never follow symbolic links or scan quarantine folder
                        if entry.is_symlink() or entry.name.startswith(".filenest"):
                            continue

                        if entry.is_dir(follow_symlinks=False):
                            pending.append(Path(entry.path))
                            continue

                        if not entry.is_file(follow_symlinks=False):
                            continue

                        stat = entry.stat(follow_symlinks=False)
                        file_path = Path(entry.path)
                        size = stat.st_size

                        files.append({
                            "name": file_path.name,
                            "path": str(file_path),
                            "extension": file_path.suffix.lower(),
                            "size_bytes": size,
                            "modified": datetime.fromtimestamp(
                                stat.st_mtime
                            ).isoformat(timespec="seconds"),
                        })
                        total_size += size

                    except OSError:
                        errors.append(
                            f"Could not read an entry in {current}"
                        )

        except OSError:
            errors.append(f"Could not access folder: {current}")

    return {
        "folder": str(requested),
        "file_count": len(files),
        "total_size_bytes": total_size,
        "limit_reached": bool(pending) or len(files) >= MAX_FILES,
        "errors": errors[:20],
        "files": files,
    }


from collections import defaultdict
from pathlib import Path
import hashlib

from app.services.scanner import scan_folder


def calculate_sha256(file_path: Path) -> str:
    """Calculate a file hash without loading the whole file into RAM."""
    digest = hashlib.sha256()

    with file_path.open("rb") as file:
        while True:
            chunk = file.read(1024 * 1024)  # 1 MB at a time
            if not chunk:
                break
            digest.update(chunk)

    return digest.hexdigest()

from typing import Optional


def analyze_folder(folder_path: str, allowed_root: Optional[Path] = None) -> dict:
    scan = scan_folder(folder_path, allowed_root=allowed_root)
    root = Path(scan["folder"])

    files = scan["files"]
    size_groups = defaultdict(list)

    # Group files by size first. Identical files must have the same size,
    # so this avoids hashing files that cannot be duplicates.
    for file_info in files:
        size_groups[file_info["size_bytes"]].append(file_info)

    hash_groups = defaultdict(list)
    hash_errors = []

    for size, candidates in size_groups.items():
        if len(candidates) < 2:
            continue

        for file_info in candidates:
            path = Path(file_info["path"])

            try:
                before = path.stat()
                digest = calculate_sha256(path)
                after = path.stat()

                # Ignore a file if it changed while being analyzed.
                if (
                    before.st_size != after.st_size
                    or before.st_mtime_ns != after.st_mtime_ns
                ):
                    hash_errors.append(
                        f"File changed during analysis: {path.name}"
                    )
                    continue

                hash_groups[(size, digest)].append(file_info)

            except OSError:
                hash_errors.append(
                    f"Could not hash file: {path.name}"
                )

    duplicates = []

    for (size, digest), matching_files in hash_groups.items():
        if len(matching_files) < 2:
            continue

        duplicates.append({
            "sha256": digest,
            "size_bytes": size,
            "copies": len(matching_files),
            "potential_wasted_bytes": size * (len(matching_files) - 1),
            "files": [
                {
                    "name": item["name"],
                    "path": item["path"],
                }
                for item in matching_files
            ],
        })

    duplicates.sort(
        key=lambda item: item["potential_wasted_bytes"],
        reverse=True,
    )

    # Rank files by size, largest first.
    large_files = sorted(
        files,
        key=lambda item: item["size_bytes"],
        reverse=True,
    )[:10]

    # Calculate aggregate sizes for each folder within the scanned root.
    folder_sizes = defaultdict(int)

    for file_info in files:
        file_path = Path(file_info["path"])
        parent = file_path.parent

        while True:
            folder_sizes[str(parent)] += file_info["size_bytes"]

            if parent == root:
                break

            if root not in parent.parents:
                break

            parent = parent.parent

    folder_summary = [
        {
            "path": path,
            "size_bytes": size,
        }
        for path, size in folder_sizes.items()
    ]

    folder_summary.sort(
        key=lambda item: item["size_bytes"],
        reverse=True,
    )

    return {
        "folder": scan["folder"],
        "file_count": scan["file_count"],
        "total_size_bytes": scan["total_size_bytes"],
        "large_files": large_files,
        "duplicate_groups": duplicates,
        "duplicate_group_count": len(duplicates),
        "potential_wasted_bytes": sum(
            group["potential_wasted_bytes"]
            for group in duplicates
        ),
        "folder_sizes": folder_summary,
        "errors": (scan["errors"] + hash_errors)[:30],
        "read_only": True,
        "files": files,
    }

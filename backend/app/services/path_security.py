import os
import subprocess
import sys
from pathlib import Path
from typing import Optional, Tuple


def get_system_deny_list() -> list[Path]:
    """Return a list of sensitive system paths that should never be scanned or modified."""
    deny_list = []
    
    # Standard Windows environment variables
    env_vars = ["SystemRoot", "WINDIR", "ProgramFiles", "ProgramFiles(x86)", "ProgramData", "CommonProgramFiles"]
    for var in env_vars:
        val = os.environ.get(var)
        if val:
            try:
                deny_list.append(Path(val).resolve())
            except Exception:
                pass

    # Common system root directories on system drive
    system_drive = os.environ.get("SystemDrive", "C:")
    standard_paths = [
        f"{system_drive}\\Windows",
        f"{system_drive}\\Program Files",
        f"{system_drive}\\Program Files (x86)",
        f"{system_drive}\\ProgramData",
        f"{system_drive}\\Recovery",
        f"{system_drive}\\System Volume Information",
        f"{system_drive}\\$Recycle.Bin",
    ]
    for p in standard_paths:
        try:
            path_obj = Path(p).resolve()
            if path_obj not in deny_list:
                deny_list.append(path_obj)
        except Exception:
            pass

    return deny_list


def is_drive_root(path: Path) -> bool:
    """Check if the path is a bare drive root (e.g., C:\\, D:\\)."""
    try:
        resolved = path.resolve()
        return resolved == Path(resolved.anchor) or resolved.parent == resolved
    except Exception:
        return False


def is_system_restricted(path: Path) -> Tuple[bool, str]:
    """Check if a path enters any restricted Windows system directories or bare drive roots."""
    try:
        resolved = path.resolve()
    except Exception as exc:
        return True, f"Invalid path resolution: {exc}"

    # Disallow bare drive root
    if is_drive_root(resolved):
        return True, "Scanning an entire drive root (e.g., C:\\ or D:\\) is restricted for system safety. Please select a specific folder."

    # Check against system deny list
    deny_list = get_system_deny_list()
    for sys_path in deny_list:
        try:
            # Matches sys_path exactly or is inside it
            if resolved == sys_path or resolved.is_relative_to(sys_path):
                return True, f"Access to system directory '{sys_path.name}' is prohibited for system security."
        except Exception:
            continue

    # Also check special folder names anywhere in path
    sensitive_names = {"$recycle.bin", "system volume information", "recovery"}
    for part in resolved.parts:
        if part.lower() in sensitive_names:
            return True, f"Access to protected system folder '{part}' is prohibited."

    return False, ""


def validate_accessible_folder(folder_path: str) -> Path:
    """
    Validate that a user-specified folder path:
    1. Is non-empty and well-formed.
    2. Exists and is an actual directory.
    3. Is not a symbolic link.
    4. Is not a restricted Windows system directory or drive root.
    5. Is readable.
    """
    if not folder_path or not str(folder_path).strip():
        raise ValueError("Folder path cannot be empty.")

    raw_path = Path(folder_path).expanduser()

    if raw_path.is_symlink():
        raise ValueError("Symbolic links are not allowed for folder selection.")

    try:
        resolved = raw_path.resolve(strict=True)
    except FileNotFoundError:
        raise ValueError(f"The folder does not exist: {folder_path}")
    except PermissionError:
        raise ValueError(f"Permission denied accessing folder: {folder_path}")
    except (OSError, RuntimeError) as exc:
        raise ValueError(f"Cannot resolve folder path: {exc}")

    if not resolved.is_dir():
        raise ValueError(f"The selected path is a file, not a directory: {folder_path}")

    restricted, reason = is_system_restricted(resolved)
    if restricted:
        raise ValueError(reason)

    # Check readability
    if not os.access(resolved, os.R_OK):
        raise ValueError(f"Folder is not readable: {folder_path}")

    return resolved


def validate_path_within_root(path_value: str, allowed_root: Path, must_exist: bool = True) -> Path:
    """
    Ensure path_value resolves to a path strictly inside allowed_root,
    without symlinks or path traversal.
    """
    root = allowed_root.resolve(strict=True)
    target = Path(path_value).expanduser()

    if target.is_symlink():
        raise ValueError("Symbolic links are not permitted.")

    try:
        resolved = target.resolve(strict=must_exist)
    except FileNotFoundError:
        raise ValueError(f"Path does not exist: {path_value}")
    except Exception as exc:
        raise ValueError(f"Could not resolve path safely: {exc}")

    if not resolved.is_relative_to(root):
        raise ValueError(f"Path '{path_value}' is outside the authorized folder '{root}'.")

    return resolved


def open_windows_folder_dialog() -> str:
    """
    Launch a native Windows folder picker dialog using Python's standard Tkinter.
    Runs in a subprocess to ensure zero interference with the async server or thread loop.
    Returns the chosen folder path as a string, or empty string if cancelled.
    """
    script = (
        "import tkinter as tk\n"
        "from tkinter import filedialog\n"
        "root = tk.Tk()\n"
        "root.withdraw()\n"
        "root.attributes('-topmost', True)\n"
        "root.focus_force()\n"
        "folder = filedialog.askdirectory(title='Select Folder - FileNest AI')\n"
        "root.destroy()\n"
        "if folder:\n"
        "    print(folder)\n"
    )

    try:
        result = subprocess.run(
            [sys.executable, "-c", script],
            capture_output=True,
            text=True,
            timeout=120,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        if result.returncode == 0:
            return result.stdout.strip()
        return ""
    except Exception as exc:
        raise RuntimeError(f"Could not open native folder dialog: {exc}")

import os
from pathlib import Path
import pytest

from app.services.path_security import (
    validate_accessible_folder,
    is_system_restricted,
    is_drive_root,
    get_system_deny_list,
    validate_path_within_root,
)
from app.services.scanner import scan_folder
from app.services.storage_analyzer import analyze_folder


def test_system_deny_list_contains_windows_folder():
    deny = get_system_deny_list()
    assert any("windows" in str(p).lower() for p in deny)


def test_drive_root_is_restricted():
    drive = Path(Path.cwd().anchor)
    assert is_drive_root(drive)
    restricted, msg = is_system_restricted(drive)
    assert restricted is True
    assert "entire drive root" in msg


def test_system_windows_directory_is_restricted():
    win_dir = Path(os.environ.get("SystemRoot", "C:\\Windows"))
    restricted, msg = is_system_restricted(win_dir)
    assert restricted is True
    assert "prohibited" in msg


def test_valid_user_directory_is_allowed(tmp_path):
    user_folder = tmp_path / "MyUserFiles"
    user_folder.mkdir()
    validated = validate_accessible_folder(str(user_folder))
    assert validated == user_folder.resolve()


def test_nonexistent_folder_is_rejected(tmp_path):
    missing = tmp_path / "NonExistentFolder123"
    with pytest.raises(ValueError, match="does not exist"):
        validate_accessible_folder(str(missing))


def test_file_instead_of_folder_is_rejected(tmp_path):
    test_file = tmp_path / "file.txt"
    test_file.write_text("content", encoding="utf-8")
    with pytest.raises(ValueError, match="not a directory"):
        validate_accessible_folder(str(test_file))


def test_empty_path_is_rejected():
    with pytest.raises(ValueError, match="cannot be empty"):
        validate_accessible_folder("")


def test_validate_path_within_root(tmp_path):
    root = tmp_path / "Workspace"
    root.mkdir()
    child = root / "document.pdf"
    child.write_text("pdf data", encoding="utf-8")

    assert validate_path_within_root(str(child), root) == child.resolve()

    outside = tmp_path / "outside.txt"
    outside.write_text("secret", encoding="utf-8")
    with pytest.raises(ValueError, match="outside the authorized folder"):
        validate_path_within_root(str(outside), root)


def test_scan_user_folder(tmp_path):
    folder = tmp_path / "CustomFolder"
    folder.mkdir()
    f1 = folder / "test1.txt"
    f1.write_text("hello world", encoding="utf-8")
    f2 = folder / "test2.log"
    f2.write_text("log data", encoding="utf-8")

    result = scan_folder(str(folder))
    assert result["file_count"] == 2
    assert result["folder"] == str(folder.resolve())
    assert result["total_size_bytes"] > 0


def test_analyze_user_folder(tmp_path):
    folder = tmp_path / "CustomAnalysisFolder"
    folder.mkdir()
    # Create two duplicate files
    content = "duplicate content for hashing test"
    f1 = folder / "dup1.txt"
    f1.write_text(content, encoding="utf-8")
    f2 = folder / "dup2.txt"
    f2.write_text(content, encoding="utf-8")

    result = analyze_folder(str(folder))
    assert result["file_count"] == 2
    assert result["duplicate_group_count"] == 1
    assert result["duplicate_groups"][0]["copies"] == 2

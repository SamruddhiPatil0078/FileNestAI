
import pytest

from app.services import cleanup_service as cleanup


def test_protected_file_is_excluded(tmp_path, monkeypatch):
    protected_file = tmp_path / "important.txt"
    protected_file.write_text("keep this file")

    protected = [{
        "path": str(protected_file),
        "kind": "file",
        "created_at": "",
    }]

    monkeypatch.setattr(cleanup, "get_protected_paths", lambda: protected)

    assert cleanup._is_protected(protected_file, protected)


def test_file_inside_protected_folder_is_excluded(tmp_path):
    folder = tmp_path / "Keep"
    folder.mkdir()
    child = folder / "notes.txt"
    child.write_text("keep")

    protected = [{
        "path": str(folder),
        "kind": "folder",
        "created_at": "",
    }]

    assert cleanup._is_protected(child, protected)


def test_unrelated_file_is_not_protected(tmp_path):
    protected_folder = tmp_path / "Keep"
    protected_folder.mkdir()

    other_folder = tmp_path / "Review"
    other_folder.mkdir()
    candidate = other_folder / "notes.txt"
    candidate.write_text("review")

    protected = [{
        "path": str(protected_folder),
        "kind": "folder",
        "created_at": "",
    }]

    assert not cleanup._is_protected(candidate, protected)


def test_protection_persists_in_database(tmp_path, monkeypatch):
    protected_file = tmp_path / "important.txt"
    protected_file.write_text("keep")

    monkeypatch.setattr(cleanup, "DB_PATH", tmp_path / "test_cleanup.db")
    monkeypatch.setattr(cleanup, "TEST_ROOT", tmp_path)

    cleanup.protect_path(str(protected_file))

    saved = cleanup.get_protected_paths()

    assert any(
        item["path"] == str(protected_file)
        and item["kind"] == "file"
        for item in saved
    )

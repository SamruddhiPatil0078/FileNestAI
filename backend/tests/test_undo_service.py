
import pytest

import app.services.operation_history as history
from app.services.undo_service import undo_file_move


def test_undo_requires_approval(tmp_path):
    with pytest.raises(ValueError, match="approval"):
        undo_file_move(1, tmp_path, approved=False)


def test_undo_restores_moved_file(tmp_path, monkeypatch):
    root = tmp_path / "sample_files"
    mixed = root / "Mixed"
    documents = root / "Documents"

    mixed.mkdir(parents=True)
    documents.mkdir()

    database = tmp_path / "history.db"
    monkeypatch.setattr(history, "DATABASE_PATH", database)
    history.initialize_database()

    original = mixed / "assignment.txt"
    moved = documents / "assignment.txt"
    moved.write_text("safe test content", encoding="utf-8")

    operation_id = history.record_operation(
        "move",
        str(original),
        str(moved),
    )

    result = undo_file_move(operation_id, root, approved=True)

    assert result["success"] is True
    assert original.read_text(encoding="utf-8") == "safe test content"
    assert not moved.exists()

    operations = history.get_operation_history()
    assert operations[0]["status"] == "undone"


def test_undo_refuses_to_overwrite_original(tmp_path, monkeypatch):
    root = tmp_path / "sample_files"
    mixed = root / "Mixed"
    documents = root / "Documents"

    mixed.mkdir(parents=True)
    documents.mkdir()

    database = tmp_path / "history.db"
    monkeypatch.setattr(history, "DATABASE_PATH", database)
    history.initialize_database()

    original = mixed / "assignment.txt"
    moved = documents / "assignment.txt"

    original.write_text("new file", encoding="utf-8")
    moved.write_text("moved file", encoding="utf-8")

    operation_id = history.record_operation(
        "move",
        str(original),
        str(moved),
    )

    with pytest.raises(ValueError, match="occupied"):
        undo_file_move(operation_id, root, approved=True)

    assert original.read_text(encoding="utf-8") == "new file"
    assert moved.read_text(encoding="utf-8") == "moved file"

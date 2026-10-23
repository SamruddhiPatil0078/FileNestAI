from pathlib import Path
import pytest
from app.services.quarantine_service import (
    quarantine_file,
    restore_quarantined_file,
    permanently_delete_quarantined_file,
    get_quarantined_files,
)
from app.services.file_operations import execute_batch_moves
from app.services.cleanup_service import protect_path
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_quarantine_and_restore_workflow(tmp_path):
    workspace = tmp_path / "MyWorkspace"
    workspace.mkdir()
    file_to_quarantine = workspace / "junk.tmp"
    file_to_quarantine.write_text("temporary clutter data", encoding="utf-8")

    # 1. Quarantine requires explicit approval
    with pytest.raises(ValueError, match="Explicit approval is required"):
        quarantine_file(str(file_to_quarantine), workspace, approved=False)

    # 2. Approved quarantine moves file to .filenest_quarantine
    res = quarantine_file(str(file_to_quarantine), workspace, approved=True)
    assert res["success"] is True
    assert not file_to_quarantine.exists()

    quarantined_file = Path(res["quarantined_path"])
    assert quarantined_file.exists()
    assert ".filenest_quarantine" in str(quarantined_file)

    # 3. List quarantined files
    items = get_quarantined_files(workspace)
    assert len(items) == 1
    assert items[0]["filename"] == "junk.tmp"

    # 4. Restore quarantined file
    restore_res = restore_quarantined_file(res["operation_id"], workspace, approved=True)
    assert restore_res["success"] is True
    assert file_to_quarantine.exists()
    assert file_to_quarantine.read_text(encoding="utf-8") == "temporary clutter data"
    assert not quarantined_file.exists()


def test_quarantine_rejects_protected_files(tmp_path):
    workspace = tmp_path / "MyWorkspace"
    workspace.mkdir()
    important = workspace / "important.doc"
    important.write_text("critical information", encoding="utf-8")

    protect_path(str(important), allowed_root=workspace)

    with pytest.raises(ValueError, match="protected"):
        quarantine_file(str(important), workspace, approved=True)

    assert important.exists()


def test_batch_moves_execution(tmp_path):
    workspace = tmp_path / "BatchWorkspace"
    workspace.mkdir()
    f1 = workspace / "doc1.txt"
    f1.write_text("doc1", encoding="utf-8")
    f2 = workspace / "doc2.txt"
    f2.write_text("doc2", encoding="utf-8")

    dest_dir = workspace / "Documents"

    plan = [
        {"source_path": str(f1), "destination_path": str(dest_dir), "approved": True},
        {"source_path": str(f2), "destination_path": str(dest_dir), "approved": True},
    ]

    res = execute_batch_moves(plan, allowed_root=workspace, approved=True)
    assert res["success"] is True
    assert res["total_moved"] == 2
    assert (dest_dir / "doc1.txt").exists()
    assert (dest_dir / "doc2.txt").exists()
    assert not f1.exists()
    assert not f2.exists()


def test_organize_suggestions_api_never_502(tmp_path):
    workspace = tmp_path / "ApiTestWorkspace"
    workspace.mkdir()
    (workspace / "notes.txt").write_text("hello", encoding="utf-8")
    (workspace / "pic.png").write_text("image", encoding="utf-8")

    response = client.post("/api/organize/suggestions", json={
        "folder_path": str(workspace),
        "organization_mode": "general",
    })

    assert response.status_code == 200
    data = response.json()
    assert "suggestions" in data
    assert len(data["suggestions"]) >= 2
    assert data["method"] in ["ai", "rule-based"]


def test_cleanup_execute_api(tmp_path):
    workspace = tmp_path / "CleanupApiWorkspace"
    workspace.mkdir()
    temp_file = workspace / "temp.tmp"
    temp_file.write_text("temp", encoding="utf-8")

    response = client.post("/api/cleanup/execute", json={
        "items": [{"path": str(temp_file), "action": "quarantine"}],
        "allowed_root": str(workspace),
        "approved": True,
    })

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["total_processed"] == 1
    assert not temp_file.exists()

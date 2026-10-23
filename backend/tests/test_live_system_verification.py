import os
import shutil
import tempfile
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.scanner import scan_folder
from app.services.storage_analyzer import analyze_folder
from app.services.cleanup_service import get_cleanup_suggestions, protect_path, unprotect_path
from app.services.path_security import validate_accessible_folder, validate_path_within_root
from app.services.quarantine_service import (
    quarantine_file,
    restore_quarantined_file,
    permanently_delete_quarantined_file,
    get_quarantined_files,
)
from app.services.file_operations import execute_batch_moves, move_file_after_approval
from app.services.undo_service import undo_file_move
from app.services.operation_history import get_operation_history

client = TestClient(app)


@pytest.fixture
def sandbox_workspace(tmp_path):
    """Create a fully isolated sandbox directory structure."""
    ws = tmp_path / "sandbox_workspace"
    ws.mkdir(parents=True, exist_ok=True)

    # 1. Plain text file
    (ws / "notes.txt").write_text("Meeting notes from project kickoff", encoding="utf-8")

    # 2. Duplicate files (exact SHA-256 content match)
    (ws / "original_image.png").write_bytes(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDRtestcontent")
    sub = ws / "duplicates"
    sub.mkdir()
    (sub / "copied_image.png").write_bytes(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDRtestcontent")

    # 3. Media files
    (ws / "presentation.mp4").write_bytes(b"mock video data 1234567890")
    (ws / "budget.xlsx").write_bytes(b"mock spreadsheet data 1234567890")

    # 4. Protected subfolder
    prot_dir = ws / "Confidential"
    prot_dir.mkdir()
    (prot_dir / "secret.txt").write_text("Top secret file", encoding="utf-8")

    yield ws

    # Cleanup
    if ws.exists():
        shutil.rmtree(ws, ignore_errors=True)


def test_path_security_enforcement(sandbox_workspace):
    """Verify paths outside workspace or system paths are strictly blocked."""
    # Attempt to validate system directory
    with pytest.raises(ValueError, match="prohibited"):
        validate_accessible_folder("C:\\Windows")

    with pytest.raises(ValueError, match="prohibited"):
        validate_accessible_folder("C:\\Program Files")

    # Attempt directory traversal outside sandbox
    with pytest.raises(ValueError, match="outside the authorized folder"):
        validate_path_within_root(str(sandbox_workspace / ".." / "escaped.txt"), sandbox_workspace, must_exist=False)


def test_duplicate_detection(sandbox_workspace):
    """Verify exact SHA-256 content duplicate detection."""
    analysis = analyze_folder(str(sandbox_workspace))
    dup_groups = analysis["duplicate_groups"]

    assert len(dup_groups) >= 1
    # Check that original_image.png and copied_image.png are grouped together
    group = next(g for g in dup_groups if g["copies"] == 2)
    paths = [Path(f["path"]).name for f in group["files"]]
    assert "original_image.png" in paths
    assert "copied_image.png" in paths
    assert group["potential_wasted_bytes"] == group["size_bytes"]


def test_quarantine_restore_delete_lifecycle(sandbox_workspace):
    """Test full file quarantine, safe staging, restoration, and deletion."""
    target_file = sandbox_workspace / "duplicates" / "copied_image.png"
    assert target_file.exists()

    # 1. Quarantine redundant duplicate
    q_res = quarantine_file(str(target_file), sandbox_workspace, approved=True)
    assert q_res["success"] is True
    assert not target_file.exists()
    q_path = Path(q_res["quarantined_path"])
    assert q_path.exists()

    # 2. Restore file
    op_id = q_res["operation_id"]
    r_res = restore_quarantined_file(op_id, sandbox_workspace, approved=True)
    assert r_res["success"] is True
    assert target_file.exists()
    assert not q_path.exists()

    # 3. Quarantine again and permanently delete
    q_res2 = quarantine_file(str(target_file), sandbox_workspace, approved=True)
    op_id2 = q_res2["operation_id"]
    q_path2 = Path(q_res2["quarantined_path"])
    assert q_path2.exists()

    d_res = permanently_delete_quarantined_file(op_id2, sandbox_workspace, approved=True)
    assert d_res["success"] is True
    assert not target_file.exists()
    assert not q_path2.exists()


def test_protected_files_enforcement(sandbox_workspace):
    """Verify that protected files and their descendants are exempted from moves and cleanup."""
    prot_folder = sandbox_workspace / "Confidential"
    prot_file = prot_folder / "secret.txt"

    # Add protection rule
    protect_path(str(prot_folder))

    # Verify Smart Cleanup exempts it
    cleanup = get_cleanup_suggestions(str(sandbox_workspace))
    suggested_paths = [s["path"] for s in cleanup["suggestions"]]
    assert str(prot_file) not in suggested_paths

    # Verify file move is blocked
    dest_dir = sandbox_workspace / "Moved"
    dest_dir.mkdir(exist_ok=True)
    with pytest.raises(PermissionError, match="protected"):
        move_file_after_approval(
            str(prot_file),
            str(dest_dir),
            sandbox_workspace,
            approved=True,
        )

    # Clean up rule
    unprotect_path(str(prot_folder))


def test_organization_plan_generation_and_execution(sandbox_workspace):
    """Verify organization plan suggestions and physical batch execution."""
    res = client.post(
        "/api/organize/suggestions",
        json={"folder_path": str(sandbox_workspace), "organization_mode": "general"},
    )
    assert res.status_code == 200
    data = res.json()
    assert "suggestions" in data
    assert data["total_suggestions"] > 0

    # Execute approved plan
    plan_to_exec = [
        {
            "source_path": item["source_path"],
            "destination_path": item["destination_path"],
            "approved": True,
        }
        for item in data["suggestions"]
        if "notes.txt" in item["source_path"] or "presentation.mp4" in item["source_path"]
    ]

    exec_res = client.post(
        "/api/organize/execute",
        json={
            "plan": plan_to_exec,
            "allowed_root": str(sandbox_workspace),
            "approved": True,
        },
    )
    assert exec_res.status_code == 200
    exec_data = exec_res.json()
    assert exec_data["successful_moves"] >= 1

    # Verify physical file movement
    assert (sandbox_workspace / "Documents" / "notes.txt").exists() or (
        sandbox_workspace / "Videos" / "presentation.mp4"
    ).exists()


def test_atomic_undo_operation(sandbox_workspace):
    """Verify physical undo of a file move restores exact source location."""
    file_to_move = sandbox_workspace / "budget.xlsx"
    dest_dir = sandbox_workspace / "Documents"
    dest_dir.mkdir(exist_ok=True)

    move_res = move_file_after_approval(
        str(file_to_move),
        str(dest_dir),
        sandbox_workspace,
        approved=True,
    )
    dest_file = dest_dir / "budget.xlsx"
    assert dest_file.exists()
    assert not file_to_move.exists()

    op_id = move_res["operation_id"]
    undo_res = undo_file_move(op_id, sandbox_workspace, approved=True)
    assert undo_res["success"] is True
    assert undo_res["restored_path"] == str(file_to_move)
    assert file_to_move.exists()
    assert not dest_file.exists()

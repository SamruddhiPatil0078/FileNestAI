import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_validate_folder_valid(tmp_path):
    folder = tmp_path / "ValidFolder"
    folder.mkdir()
    response = client.post("/api/validate-folder", json={"folder_path": str(folder)})
    assert response.status_code == 200
    data = response.json()
    assert data["valid"] is True
    assert data["name"] == "ValidFolder"


def test_validate_folder_system_rejected():
    response = client.post("/api/validate-folder", json={"folder_path": "C:\\Windows"})
    assert response.status_code == 400
    assert "prohibited" in response.json()["detail"].lower()


def test_scan_user_folder_api(tmp_path):
    folder = tmp_path / "ScanApiTest"
    folder.mkdir()
    (folder / "fileA.txt").write_text("content A", encoding="utf-8")

    response = client.post("/api/scan", json={"folder_path": str(folder)})
    assert response.status_code == 200
    data = response.json()
    assert data["file_count"] == 1
    assert data["files"][0]["name"] == "fileA.txt"


def test_cleanup_protected_api(tmp_path):
    response = client.get("/api/cleanup/protected")
    assert response.status_code == 200
    assert "protected_paths" in response.json()

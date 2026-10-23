import pytest
from app.services import operation_history, cleanup_service

@pytest.fixture(autouse=True)
def isolate_test_databases(tmp_path, monkeypatch):
    """Ensure automated tests never touch the production history or cleanup databases."""
    test_history_db = tmp_path / "test_history.db"
    test_cleanup_db = tmp_path / "test_cleanup.db"

    monkeypatch.setattr(operation_history, "DATABASE_PATH", test_history_db)
    monkeypatch.setattr(cleanup_service, "DB_PATH", test_cleanup_db)

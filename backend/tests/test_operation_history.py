
import app.services.operation_history as history


def test_initialize_database_creates_table(tmp_path, monkeypatch):
    database = tmp_path / "test_history.db"

    monkeypatch.setattr(history, "DATABASE_PATH", database)

    history.initialize_database()

    assert database.exists()

    with history.get_connection() as connection:
        result = connection.execute(
            """
            SELECT name FROM sqlite_master
            WHERE type = 'table' AND name = 'file_operations'
            """
        ).fetchone()

    assert result is not None


def test_record_and_read_operation(tmp_path, monkeypatch):
    database = tmp_path / "test_history.db"

    monkeypatch.setattr(history, "DATABASE_PATH", database)

    history.initialize_database()

    operation_id = history.record_operation(
        operation_type="move",
        source_path="E:/FileNestAI/sample_files/Mixed/demo.txt",
        destination_path="E:/FileNestAI/sample_files/Documents/demo.txt",
    )

    operations = history.get_operation_history()

    assert len(operations) == 1
    assert operations[0]["id"] == operation_id
    assert operations[0]["operation_type"] == "move"
    assert operations[0]["status"] == "completed"
    assert operations[0]["undone_at"] is None


def test_history_limit_validation():
    import pytest

    with pytest.raises(ValueError):
        history.get_operation_history(limit=0)

    with pytest.raises(ValueError):
        history.get_operation_history(limit=501)
 
def test_pending_operation_can_be_marked_completed(tmp_path, monkeypatch):
    import app.services.operation_history as history

    database = tmp_path / "test_history.db"
    monkeypatch.setattr(history, "DATABASE_PATH", database)

    history.initialize_database()

    operation_id = history.create_pending_operation(
        operation_type="move",
        source_path="E:/sample_files/Mixed/demo.txt",
        destination_path="E:/sample_files/Videos/demo.txt",
    )

    assert history.update_operation_status(operation_id, "completed")

    operations = history.get_operation_history()

    assert operations[0]["id"] == operation_id
    assert operations[0]["status"] == "completed"


def test_pending_operation_can_be_marked_failed(tmp_path, monkeypatch):
    import app.services.operation_history as history

    database = tmp_path / "test_history.db"
    monkeypatch.setattr(history, "DATABASE_PATH", database)

    history.initialize_database()

    operation_id = history.create_pending_operation(
        operation_type="move",
        source_path="E:/sample_files/Mixed/demo.txt",
        destination_path="E:/sample_files/Videos/demo.txt",
    )

    assert history.update_operation_status(operation_id, "failed")

    operations = history.get_operation_history()

    assert operations[0]["status"] == "failed"


def test_invalid_operation_status_is_rejected(tmp_path, monkeypatch):
    import pytest
    import app.services.operation_history as history

    database = tmp_path / "test_history.db"
    monkeypatch.setattr(history, "DATABASE_PATH", database)

    history.initialize_database()

    with pytest.raises(ValueError):
        history.update_operation_status(1, "unknown")

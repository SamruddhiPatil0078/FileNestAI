
import sqlite3
from pathlib import Path
from typing import Optional


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATABASE_PATH = PROJECT_ROOT / "filenest_history.db"


def get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DATABASE_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database() -> None:
    """Create the operation history table if needed."""

    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS file_operations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                operation_type TEXT NOT NULL,
                source_path TEXT NOT NULL,
                destination_path TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL DEFAULT (
                    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                ),
                undone_at TEXT
            )
            """
        )


def create_pending_operation(
    operation_type: str,
    source_path: str,
    destination_path: str,
) -> int:
    """Persist the operation before touching the file."""

    initialize_database()

    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO file_operations (
                operation_type,
                source_path,
                destination_path,
                status
            )
            VALUES (?, ?, ?, 'pending')
            """,
            (operation_type, source_path, destination_path),
        )

        return int(cursor.lastrowid)


def update_operation_status(
    operation_id: int,
    status: str,
    undone_at: Optional[str] = None,
) -> bool:
    """Update an operation's status."""

    allowed_statuses = {"pending", "completed", "failed", "undone", "deleted"}

    if status not in allowed_statuses:
        raise ValueError("Invalid operation status.")

    with get_connection() as connection:
        cursor = connection.execute(
            """
            UPDATE file_operations
            SET status = ?, undone_at = ?
            WHERE id = ?
            """,
            (status, undone_at, operation_id),
        )

        return cursor.rowcount == 1


def record_operation(
    operation_type: str,
    source_path: str,
    destination_path: str,
) -> int:
    """Record a completed operation."""

    initialize_database()

    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO file_operations (
                operation_type,
                source_path,
                destination_path,
                status
            )
            VALUES (?, ?, ?, 'completed')
            """,
            (operation_type, source_path, destination_path),
        )

        return int(cursor.lastrowid)


def get_operation_history(limit: int = 100) -> list[dict]:
    """Return the most recent operations."""

    if not 1 <= limit <= 500:
        raise ValueError("Limit must be between 1 and 500.")

    initialize_database()

    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, operation_type, source_path,
                   destination_path, status, created_at, undone_at
            FROM file_operations
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    return [dict(row) for row in rows]

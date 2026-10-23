
from pathlib import Path

import pytest

from app.services.file_operations import validate_file_move


def test_valid_move_is_only_validated(tmp_path):
    root = tmp_path / "sample_files"
    source_folder = root / "Mixed"
    destination_folder = root / "Documents"

    source_folder.mkdir(parents=True)
    destination_folder.mkdir()

    source = source_folder / "assignment.txt"
    source.write_text("test file", encoding="utf-8")

    result = validate_file_move(
        str(source),
        str(destination_folder),
        root,
    )

    assert result["valid"] is True
    assert result["destination_file"].endswith("assignment.txt")
    assert result["read_only"] is True
    assert source.exists()
    assert not (destination_folder / "assignment.txt").exists()


def test_reject_source_outside_approved_root(tmp_path):
    root = tmp_path / "sample_files"
    root.mkdir()

    outside = tmp_path / "outside.txt"
    outside.write_text("outside", encoding="utf-8")

    with pytest.raises(ValueError, match="Source is outside"):
        validate_file_move(
            str(outside),
            str(root),
            root,
        )


def test_reject_existing_destination_filename(tmp_path):
    root = tmp_path / "sample_files"
    source_folder = root / "Mixed"
    destination_folder = root / "Documents"

    source_folder.mkdir(parents=True)
    destination_folder.mkdir()

    source = source_folder / "assignment.txt"
    source.write_text("source", encoding="utf-8")

    existing_target = destination_folder / "assignment.txt"
    existing_target.write_text("keep this file", encoding="utf-8")

    with pytest.raises(ValueError, match="already exists"):
        validate_file_move(
            str(source),
            str(destination_folder),
            root,
        )

    assert source.read_text(encoding="utf-8") == "source"
    assert existing_target.read_text(encoding="utf-8") == "keep this file"


def test_reject_destination_outside_approved_root(tmp_path):
    root = tmp_path / "sample_files"
    source_folder = root / "Mixed"
    source_folder.mkdir(parents=True)

    source = source_folder / "assignment.txt"
    source.write_text("test", encoding="utf-8")

    outside_destination = tmp_path / "outside"
    outside_destination.mkdir()

    with pytest.raises(ValueError, match="outside the approved folder"):
        validate_file_move(
            str(source),
            str(outside_destination),
            root,
        )


def test_new_destination_can_be_validated_without_creation(tmp_path):
    root = tmp_path / "sample_files"
    source_folder = root / "Mixed"
    source_folder.mkdir(parents=True)

    source = source_folder / "assignment.txt"
    source.write_text("test", encoding="utf-8")

    new_destination = source_folder / "Documents"

    result = validate_file_move(
        str(source),
        str(new_destination),
        root,
        create_destination=True,
    )

    assert result["valid"] is True
    assert result["will_create_destination"] is True
    assert not new_destination.exists()

from app.services.file_operations import move_file_after_approval


def test_move_requires_explicit_approval(tmp_path):
    root = tmp_path / "sample_files"
    mixed = root / "Mixed"
    documents = root / "Documents"

    mixed.mkdir(parents=True)
    documents.mkdir()

    source = mixed / "assignment.txt"
    source.write_text("test content", encoding="utf-8")

    with pytest.raises(ValueError, match="approval is required"):
        move_file_after_approval(
            str(source),
            str(documents),
            root,
            approved=False,
        )

    assert source.exists()
    assert not (documents / "assignment.txt").exists()


def test_approved_move_preserves_file_content(tmp_path):
    root = tmp_path / "sample_files"
    mixed = root / "Mixed"
    documents = root / "Documents"

    mixed.mkdir(parents=True)
    documents.mkdir()

    source = mixed / "assignment.txt"
    source.write_text("safe test content", encoding="utf-8")

    result = move_file_after_approval(
        str(source),
        str(documents),
        root,
        approved=True,
    )

    destination = documents / "assignment.txt"

    assert result["success"] is True
    assert not source.exists()
    assert destination.read_text(encoding="utf-8") == "safe test content"


def test_approved_move_never_overwrites_existing_file(tmp_path):
    root = tmp_path / "sample_files"
    mixed = root / "Mixed"
    documents = root / "Documents"

    mixed.mkdir(parents=True)
    documents.mkdir()

    source = mixed / "assignment.txt"
    source.write_text("original source", encoding="utf-8")

    destination = documents / "assignment.txt"
    destination.write_text("existing destination", encoding="utf-8")

    with pytest.raises(ValueError, match="already exists"):
        move_file_after_approval(
            str(source),
            str(documents),
            root,
            approved=True,
        )

    assert source.read_text(encoding="utf-8") == "original source"
    assert destination.read_text(encoding="utf-8") == "existing destination"

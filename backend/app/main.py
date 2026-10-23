from pathlib import Path
from typing import Literal, Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.services.storage_analyzer import analyze_folder
from app.services.scanner import scan_folder, TEST_ROOT
from app.services.ai_service import suggest_file_organization, check_ollama_available
from app.services.file_operations import move_file_after_approval, execute_batch_moves
from app.services.operation_history import get_operation_history
from app.services.undo_service import undo_file_move
from app.services.cleanup_service import (
    get_cleanup_suggestions,
    protect_path,
    unprotect_path,
    get_protected_paths,
    _is_protected,
)
from app.services.path_security import (
    validate_accessible_folder,
    open_windows_folder_dialog,
    validate_path_within_root,
)
from app.services.quarantine_service import (
    quarantine_file,
    restore_quarantined_file,
    permanently_delete_quarantined_file,
    get_quarantined_files,
)

app = FastAPI(
    title="FileNest AI API",
    description="Local-first file organization, storage analysis, and safe filesystem operations",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {
        "app": "FileNest AI",
        "status": "running",
        "version": "0.2.0",
    }


@app.get("/api/health")
def health():
    return {
        "status": "healthy",
        "app": "FileNest AI",
        "ollama_available": check_ollama_available(),
    }


class ValidateFolderRequest(BaseModel):
    folder_path: str


@app.post("/api/browse-folder")
def browse_folder():
    """Trigger the native Windows folder picker dialog and return the validated path."""
    try:
        chosen = open_windows_folder_dialog()
        if not chosen:
            return {"selected": False, "folder_path": "", "name": ""}

        validated = validate_accessible_folder(chosen)
        return {
            "selected": True,
            "folder_path": str(validated),
            "name": validated.name,
        }
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/validate-folder")
def validate_folder(request: ValidateFolderRequest):
    """Validate that a user folder path is valid, accessible, and not a dangerous system directory."""
    try:
        validated = validate_accessible_folder(request.folder_path)
        return {
            "valid": True,
            "folder_path": str(validated),
            "name": validated.name,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


class ScanRequest(BaseModel):
    folder_path: str


@app.post("/api/scan")
def scan(request: ScanRequest):
    try:
        validated = validate_accessible_folder(request.folder_path)
        return scan_folder(str(validated))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Folder not found.")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/analyze")
def analyze(request: ScanRequest):
    try:
        validated = validate_accessible_folder(request.folder_path)
        return analyze_folder(str(validated))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Folder not found.")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


class OrganizationRequest(BaseModel):
    folder_path: str
    organization_mode: Literal["inside", "general"] = "inside"


@app.post("/api/organize/suggestions")
def get_organization_suggestions(request: OrganizationRequest):
    try:
        requested = validate_accessible_folder(request.folder_path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    scan_result = scan_folder(str(requested))
    protected_rules = get_protected_paths()

    # Determine existing subfolders inside the target directory
    if request.organization_mode == "inside":
        existing_folders = sorted(
            item.name
            for item in requested.iterdir()
            if item.is_dir() and not item.is_symlink() and not item.name.startswith(".")
        )
    else:
        # Standard general category folders inside the selected root or sibling
        standard_general = ["Documents", "Images", "Videos", "Audio", "Archives", "Code", "Other"]
        existing_folders = standard_general

    files_for_ai = [
        {
            "name": item["name"],
            "path": item["path"],
            "extension": item["extension"],
            "size_bytes": item["size_bytes"],
        }
        for item in scan_result["files"]
        if not _is_protected(Path(item["path"]), protected_rules)
    ]

    # Standard deterministic extension map
    extension_category_map = {
        # Documents
        ".txt": "Documents", ".pdf": "Documents", ".doc": "Documents", ".docx": "Documents",
        ".rtf": "Documents", ".odt": "Documents", ".xls": "Documents", ".xlsx": "Documents",
        ".csv": "Documents", ".ppt": "Documents", ".pptx": "Documents", ".md": "Documents",
        # Images
        ".jpg": "Images", ".jpeg": "Images", ".png": "Images", ".gif": "Images",
        ".bmp": "Images", ".webp": "Images", ".svg": "Images", ".ico": "Images",
        # Videos
        ".mp4": "Videos", ".mkv": "Videos", ".mov": "Videos", ".avi": "Videos",
        ".webm": "Videos", ".wmv": "Videos", ".m4v": "Videos",
        # Audio
        ".mp3": "Audio", ".wav": "Audio", ".flac": "Audio", ".aac": "Audio", ".ogg": "Audio",
        # Archives
        ".zip": "Archives", ".rar": "Archives", ".7z": "Archives", ".tar": "Archives", ".gz": "Archives",
        # Code
        ".js": "Code", ".jsx": "Code", ".ts": "Code", ".tsx": "Code", ".py": "Code",
        ".html": "Code", ".css": "Code", ".json": "Code", ".java": "Code", ".cpp": "Code",
    }

    # Attempt AI organization if Ollama is available
    ai_available = check_ollama_available()
    ai_suggestions = []
    ai_used = False

    if ai_available and len(files_for_ai) > 0:
        try:
            ai_res = suggest_file_organization(
                files=files_for_ai,
                existing_folders=existing_folders,
                organization_mode=request.organization_mode,
            )
            if ai_res.get("status") == "success":
                ai_suggestions = ai_res.get("suggestions", [])
                ai_used = True
        except Exception:
            ai_used = False

    # Build comprehensive, verified plan
    scanned_paths = {
        str(Path(item["path"]).resolve()): item
        for item in scan_result["files"]
    }

    plan = []
    seen_sources = set()

    # 1. Process AI suggestions if present
    for sug in ai_suggestions:
        if not isinstance(sug, dict):
            continue

        raw_source = sug.get("file_path", "")
        try:
            source_p = Path(raw_source).resolve(strict=True)
        except Exception:
            continue

        source_key = str(source_p)
        if source_key not in scanned_paths or source_key in seen_sources:
            continue

        if _is_protected(source_p, protected_rules):
            continue

        dest_name = sug.get("destination_folder", "").strip()
        if not dest_name or dest_name in {".", ".."} or "/" in dest_name or "\\" in dest_name:
            continue

        dest_dir = requested / dest_name
        if source_p.parent == dest_dir.resolve():
            continue

        plan.append({
            "source_path": source_key,
            "filename": source_p.name,
            "category": sug.get("category", dest_name),
            "destination_folder": dest_name,
            "destination_path": str(dest_dir.resolve()),
            "reason": sug.get("reason", f"Classified by AI into '{dest_name}'."),
            "destination_exists": dest_dir.is_dir(),
            "method": "ai",
            "size_bytes": scanned_paths[source_key]["size_bytes"],
            "eligible": True,
        })
        seen_sources.add(source_key)

    # 2. Complete remaining files using deterministic rule heuristics
    for file_info in scan_result["files"]:
        try:
            source_p = Path(file_info["path"]).resolve(strict=True)
        except Exception:
            continue

        source_key = str(source_p)
        if source_key in seen_sources:
            continue

        if _is_protected(source_p, protected_rules):
            continue

        ext = source_p.suffix.lower()
        target_category = extension_category_map.get(ext, "Other")

        if request.organization_mode == "inside":
            # In inside mode, group by extension category or reuse existing folder
            dest_name = target_category
            dest_dir = requested / dest_name
        else:
            dest_name = target_category
            dest_dir = requested / dest_name

        if source_p.parent == dest_dir.resolve():
            continue

        dest_exists = dest_dir.is_dir()

        plan.append({
            "source_path": source_key,
            "filename": source_p.name,
            "category": target_category,
            "destination_folder": dest_name,
            "destination_path": str(dest_dir.resolve()),
            "reason": f"Classified as {target_category} based on file extension '{ext}'.",
            "destination_exists": dest_exists,
            "method": "rule-based",
            "size_bytes": file_info["size_bytes"],
            "eligible": True,
        })
        seen_sources.add(source_key)

    return {
        "folder": str(requested),
        "organization_mode": request.organization_mode,
        "suggestions": plan,
        "total_suggestions": len(plan),
        "method": "ai" if ai_used else "rule-based",
        "ai_available": ai_available,
        "read_only": True,
        "notice": (
            "Generated using local Gemma 3 1B AI + deterministic validation."
            if ai_used
            else "Generated using deterministic extension rules (Ollama offline or bypassed for speed)."
        ),
    }


class OrganizePlanItem(BaseModel):
    source_path: str
    destination_path: str
    approved: bool = True


class OrganizeExecuteRequest(BaseModel):
    plan: List[OrganizePlanItem]
    allowed_root: str
    approved: bool = False


@app.post("/api/organize/execute")
def execute_organization_plan(request: OrganizeExecuteRequest):
    """
    Physically execute the user-approved organization plan.
    Validates permissions, workspace containment, creates directories, and records history.
    """
    if request.approved is not True:
        raise HTTPException(
            status_code=400,
            detail="Explicit approval is required to execute organization operations.",
        )

    try:
        root = validate_accessible_folder(request.allowed_root)
        moves = [
            item.model_dump() if hasattr(item, "model_dump") else item.dict()
            for item in request.plan
        ]
        result = execute_batch_moves(moves=moves, allowed_root=root, approved=True)
        return result
    except (ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


class CleanupActionItem(BaseModel):
    path: str
    action: Literal["quarantine", "delete", "protect"] = "quarantine"
    reason: Optional[str] = "Smart cleanup review"


class CleanupExecuteRequest(BaseModel):
    items: List[CleanupActionItem]
    allowed_root: str
    approved: bool = False


@app.post("/api/cleanup/execute")
def execute_cleanup_actions(request: CleanupExecuteRequest):
    """
    Execute user-approved cleanup actions: safely quarantine or protect files.
    """
    if request.approved is not True:
        raise HTTPException(
            status_code=400,
            detail="Explicit approval is required to execute cleanup actions.",
        )

    try:
        root = validate_accessible_folder(request.allowed_root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    processed = []
    failed = []
    reclaimed_bytes = 0

    for item in request.items:
        try:
            if item.action == "protect":
                res = protect_path(item.path, allowed_root=root)
                processed.append({
                    "path": item.path,
                    "action": "protect",
                    "status": "protected",
                })
            elif item.action == "quarantine":
                res = quarantine_file(
                    file_path=item.path,
                    allowed_root=root,
                    approved=True,
                    reason=item.reason or "Smart cleanup",
                )
                reclaimed_bytes += res.get("size_bytes", 0)
                processed.append({
                    "path": item.path,
                    "action": "quarantine",
                    "status": "quarantined",
                    "operation_id": res["operation_id"],
                    "quarantined_path": res["quarantined_path"],
                })
            else:
                failed.append({
                    "path": item.path,
                    "error": f"Unsupported action: {item.action}",
                })
        except Exception as exc:
            failed.append({
                "path": item.path,
                "error": str(exc),
            })

    return {
        "success": len(failed) == 0,
        "total_processed": len(processed),
        "total_failed": len(failed),
        "reclaimed_bytes": reclaimed_bytes,
        "processed": processed,
        "failed": failed,
    }


@app.get("/api/quarantine")
def list_quarantine(folder_path: str):
    """Retrieve all files currently held in the workspace quarantine."""
    try:
        root = validate_accessible_folder(folder_path)
        quarantined = get_quarantined_files(allowed_root=root)
        return {
            "folder": str(root),
            "count": len(quarantined),
            "quarantined_files": quarantined,
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


class UndoRequest(BaseModel):
    approved: bool = False
    allowed_root: Optional[str] = None


@app.post("/api/quarantine/{operation_id}/restore")
def restore_quarantine(operation_id: int, request: UndoRequest):
    """Restore a quarantined file back to its original location."""
    if request.approved is not True:
        raise HTTPException(status_code=400, detail="Explicit approval is required.")

    try:
        if request.allowed_root:
            root = validate_accessible_folder(request.allowed_root)
        else:
            root = TEST_ROOT

        return restore_quarantined_file(operation_id, allowed_root=root, approved=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/quarantine/{operation_id}/delete")
def delete_quarantine(operation_id: int, request: UndoRequest):
    """Permanently delete a file from quarantine after user confirmation."""
    if request.approved is not True:
        raise HTTPException(status_code=400, detail="Explicit approval is required.")

    try:
        if request.allowed_root:
            root = validate_accessible_folder(request.allowed_root)
        else:
            root = TEST_ROOT

        return permanently_delete_quarantined_file(operation_id, allowed_root=root, approved=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


class MoveRequest(BaseModel):
    source_path: str
    destination_path: str
    approved: bool = False
    allowed_root: Optional[str] = None


@app.post("/api/operations/move")
def move_file(request: MoveRequest):
    try:
        if request.allowed_root:
            root = validate_accessible_folder(request.allowed_root)
        else:
            root = TEST_ROOT.resolve(strict=True)

        source_input = Path(request.source_path)
        destination_input = Path(request.destination_path)

        if source_input.is_symlink() or destination_input.is_symlink():
            raise HTTPException(
                status_code=400,
                detail="Symbolic-link paths are not allowed.",
            )

        source = source_input.resolve(strict=True)
        destination = destination_input.resolve(strict=True)

        if not source.is_relative_to(root) or not destination.is_relative_to(root):
            raise HTTPException(
                status_code=403,
                detail=f"File operations are restricted to the selected folder: {root}.",
            )

        if not source.is_file() or not destination.is_dir():
            raise HTTPException(
                status_code=400,
                detail="Source must be a file and destination must be a folder.",
            )

        return move_file_after_approval(
            source_value=str(source),
            destination_value=str(destination),
            allowed_root=root,
            approved=request.approved,
        )

    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/operations/{operation_id}/undo")
def undo_operation(operation_id: int, request: UndoRequest):
    try:
        if request.allowed_root:
            root = validate_accessible_folder(request.allowed_root)
        else:
            root = TEST_ROOT

        return undo_file_move(
            operation_id=operation_id,
            allowed_root=root,
            approved=request.approved,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/operations/history")
def operation_history(limit: int = 100, workspace_root: Optional[str] = None):
    try:
        operations = get_operation_history(limit=limit)
        if workspace_root:
            try:
                root_p = Path(workspace_root).resolve()
                operations = [
                    op for op in operations
                    if Path(op["source_path"]).resolve().is_relative_to(root_p)
                ]
            except Exception:
                pass
        return {"operations": operations}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class CleanupPathRequest(BaseModel):
    path: str


@app.post("/api/cleanup/suggestions")
def cleanup_suggestions(request: CleanupPathRequest):
    try:
        validated = validate_accessible_folder(request.path)
        return get_cleanup_suggestions(str(validated))
    except (ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/cleanup/protect")
def cleanup_protect(request: CleanupPathRequest):
    try:
        return protect_path(request.path)
    except (ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/cleanup/unprotect")
def cleanup_unprotect(request: CleanupPathRequest):
    try:
        return unprotect_path(request.path)
    except (ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.get("/api/cleanup/protected")
def cleanup_protected():
    return {"protected_paths": get_protected_paths()}

#!/usr/bin/env python3
"""Local API for the Invoice Posting Assistant PDF-merging workflow.

Run: python merge_server.py
Serves only merge API endpoints on http://127.0.0.1:5503.
"""
from __future__ import annotations

from email.parser import BytesParser
from email.policy import default
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
from pathlib import Path
import re
import shutil
import tempfile
import threading
import time
import uuid

from openxl import canonical_lookup, inspect_workbook
from pdf import merge_pdfs, validate_pdf

HOST = "127.0.0.1"
PORT = 5503
PARSER_VERSION = "pivot-fill-v3"
MAX_REQUEST_BYTES = 750 * 1024 * 1024
JOB_TTL_SECONDS = 2 * 60 * 60
JOBS_ROOT = Path(tempfile.gettempdir()) / "invoice-posting-merge-jobs"
JOBS_ROOT.mkdir(parents=True, exist_ok=True)
JOBS: dict[str, dict] = {}
JOBS_LOCK = threading.Lock()


def safe_name(name: str, fallback: str) -> str:
    cleaned = Path(name or fallback).name
    cleaned = re.sub(r"[\x00-\x1f<>:\"/\\|?*]", "_", cleaned).strip(" .")
    return cleaned or fallback


def unique_path(folder: Path, filename: str) -> Path:
    target = folder / filename
    if not target.exists():
        return target
    stem, suffix = target.stem, target.suffix
    index = 2
    while True:
        candidate = folder / f"{stem} ({index}){suffix}"
        if not candidate.exists():
            return candidate
        index += 1


def cleanup_jobs() -> None:
    cutoff = time.time() - JOB_TTL_SECONDS
    with JOBS_LOCK:
        expired = [job_id for job_id, job in JOBS.items() if job["created"] < cutoff]
        for job_id in expired:
            shutil.rmtree(JOBS[job_id]["folder"], ignore_errors=True)
            del JOBS[job_id]


def parse_multipart(handler: BaseHTTPRequestHandler) -> dict[str, list[dict]]:
    content_type = handler.headers.get("Content-Type", "")
    if "multipart/form-data" not in content_type:
        raise ValueError("Expected multipart/form-data.")
    length = int(handler.headers.get("Content-Length", "0"))
    if length <= 0:
        raise ValueError("The request contains no files.")
    if length > MAX_REQUEST_BYTES:
        raise ValueError("The upload is too large for this local service.")
    body = handler.rfile.read(length)
    message = BytesParser(policy=default).parsebytes(
        b"Content-Type: " + content_type.encode("utf-8") + b"\r\nMIME-Version: 1.0\r\n\r\n" + body
    )
    fields: dict[str, list[dict]] = {}
    for part in message.iter_parts():
        disposition = part.get("Content-Disposition", "")
        if "form-data" not in disposition:
            continue
        name = part.get_param("name", header="Content-Disposition")
        filename = part.get_filename()
        payload = part.get_payload(decode=True) or b""
        fields.setdefault(name, []).append({"filename": filename, "data": payload})
    return fields


def validate_waste_pdfs(uploaded: list[Path], required: bool) -> dict:
    """Validate supplier waste-support PDFs separately from invoice matching."""
    valid, unreadable = [], []
    for path in uploaded:
        try:
            validate_pdf(path)
            valid.append(path)
        except Exception as exc:
            unreadable.append({"fileName": path.name, "error": str(exc)})
    duplicates = sorted(name for name, count in __import__("collections").Counter(
        path.name.casefold() for path in uploaded
    ).items() if count > 1)
    return {"valid": valid, "unreadable": unreadable,
            "duplicateUploads": duplicates, "missing": required and not valid}


def match_uploaded_pdfs(entries: list[dict], uploaded: list[Path]) -> dict:
    by_key: dict[str, list[Path]] = {}
    unreadable = []
    valid_paths = []
    for path in uploaded:
        try:
            validate_pdf(path)
            valid_paths.append(path)
            by_key.setdefault(canonical_lookup(path.stem), []).append(path)
        except Exception as exc:
            unreadable.append({"fileName": path.name, "error": str(exc)})

    ordered = []
    missing = []
    ambiguous = []
    used = set()
    seen_entry_keys = set()
    for entry in entries:
        key = entry["lookupKey"]
        # Defensive de-duplication for jobs created by older parser versions.
        # Repeated Pivot rows require one upload and one merged occurrence.
        if key in seen_entry_keys:
            continue
        seen_entry_keys.add(key)
        exact = by_key.get(key, [])
        candidates = exact
        if not candidates:
            candidates = [path for path in valid_paths if key and (key in canonical_lookup(path.stem) or canonical_lookup(path.stem) in key)]
        candidates = [path for path in candidates if path not in used]
        if len(candidates) == 1:
            selected = candidates[0]
            used.add(selected)
            ordered.append(selected)
        elif len(candidates) == 0:
            missing.append({"documentNumber": entry["documentNumber"], "remarks": entry["remarks"], "isWasteDocument": entry.get("isWasteDocument", False)})
        else:
            ambiguous.append({"documentNumber": entry["documentNumber"], "candidates": [p.name for p in candidates], "remarks": entry["remarks"], "isWasteDocument": entry.get("isWasteDocument", False)})

    unexpected = [path.name for path in valid_paths if path not in used]
    duplicate_upload_names = sorted(name for name, count in __import__("collections").Counter(p.name.casefold() for p in uploaded).items() if count > 1)
    return {
        "ordered": ordered,
        "missing": missing,
        "ambiguous": ambiguous,
        "unreadable": unreadable,
        "unexpected": unexpected,
        "unexpectedPaths": [path for path in valid_paths if path not in used],
        "duplicateUploads": duplicate_upload_names,
        "missingWasteDocuments": [item for item in missing if item.get("isWasteDocument")],
        "ambiguousWasteDocuments": [item for item in ambiguous if item.get("isWasteDocument")],
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "InvoiceMerge/1.0"

    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {fmt % args}")

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def send_json(self, status: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self._cors()
        self.end_headers()

    def do_GET(self):
        cleanup_jobs()
        if self.path == "/api/merge/health":
            return self.send_json(200, {"ok": True, "service": "PDF merge", "parserVersion": PARSER_VERSION, "port": PORT})
        match = re.fullmatch(r"/api/merge/download/([a-f0-9-]+)", self.path)
        if match:
            job = JOBS.get(match.group(1))
            if not job or not job.get("output") or not Path(job["output"]).is_file():
                return self.send_json(404, {"ok": False, "error": "The merged file is unavailable or has expired."})
            path = Path(job["output"])
            data = path.read_bytes()
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", mimetypes.guess_type(path.name)[0] or "application/pdf")
            self.send_header("Content-Disposition", f'attachment; filename="{path.name}"')
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        self.send_json(404, {"ok": False, "error": "Endpoint not found."})

    def do_POST(self):
        cleanup_jobs()
        try:
            if self.path == "/api/merge/inspect-report":
                return self.inspect_report()
            if self.path == "/api/merge/process":
                return self.process_pdfs()
            return self.send_json(404, {"ok": False, "error": "Endpoint not found."})
        except ValueError as exc:
            self.send_json(400, {"ok": False, "error": str(exc)})
        except Exception as exc:
            print("Unexpected server error:", repr(exc))
            self.send_json(500, {"ok": False, "error": "The merge service encountered an unexpected error. Check the server console for details."})

    def inspect_report(self):
        fields = parse_multipart(self)
        report_parts = fields.get("report", [])
        if len(report_parts) != 1 or not report_parts[0]["filename"]:
            raise ValueError("Upload exactly one Excel report first.")
        job_id = str(uuid.uuid4())
        folder = JOBS_ROOT / job_id
        folder.mkdir(parents=True)
        filename = safe_name(report_parts[0]["filename"], "report.xlsx")
        report_path = folder / filename
        report_path.write_bytes(report_parts[0]["data"])
        try:
            inspection = inspect_workbook(report_path)
        except Exception:
            shutil.rmtree(folder, ignore_errors=True)
            raise
        with JOBS_LOCK:
            JOBS[job_id] = {"created": time.time(), "folder": folder, "report": report_path, "inspection": inspection, "output": None}
        self.send_json(200, {"ok": True, "jobId": job_id, "parserVersion": PARSER_VERSION, **inspection})

    def process_pdfs(self):
        fields = parse_multipart(self)
        job_id_parts = fields.get("jobId", [])
        job_id = (job_id_parts[0]["data"].decode("utf-8", errors="replace").strip() if job_id_parts else "")
        job = JOBS.get(job_id)
        if not job:
            raise ValueError("The report session is missing or expired. Inspect the Excel report again.")

        pdf_parts = [item for item in fields.get("pdfs", []) if item.get("filename")]
        waste_required = bool(job["inspection"].get("wasteDocumentsRequired"))
        if not pdf_parts:
            raise ValueError("Upload the required PDF files.")
        continuation_parts = [item for item in fields.get("continuation", []) if item.get("filename")]
        if len(continuation_parts) > 1:
            raise ValueError("Upload at most one continuation PDF.")

        upload_folder = job["folder"] / "uploads"
        upload_folder.mkdir(exist_ok=True)
        uploaded = []
        for item in pdf_parts:
            path = unique_path(upload_folder, safe_name(item["filename"], "invoice.pdf"))
            path.write_bytes(item["data"])
            uploaded.append(path)

        match_result = match_uploaded_pdfs(job["inspection"]["entries"], uploaded)
        # With a unified upload, valid PDFs left after invoice matching are waste
        # support documents when 607599 is present. Their upload order is preserved.
        waste_uploaded = match_result.pop("unexpectedPaths", []) if waste_required else []
        waste_result = validate_waste_pdfs(waste_uploaded, waste_required)

        # These PDFs were not required by the Excel report,
        # but they were accepted and merged.
        unexpected_merged = [path.name for path in waste_result["valid"]]

        if waste_required:
            match_result["unexpected"] = []
        blocking = (any(match_result[key] for key in ("missing", "ambiguous", "unreadable", "duplicateUploads"))
                    or waste_result["missing"] or bool(waste_result["unreadable"])
                    or bool(waste_result["duplicateUploads"]))
        if blocking:
            return self.send_json(422, {
                "ok": False, "complete": False,
                "error": "Validation failed. No merged PDF was created.",
                **{key: value for key, value in match_result.items() if key not in {"ordered", "unexpectedPaths"}},
                "missingWasteDocuments": ([{"documentNumber": "607599 waste supporting document"}]
                                          if waste_result["missing"] else []),
                "unreadableWasteDocuments": waste_result["unreadable"],
                "duplicateWasteUploads": waste_result["duplicateUploads"],
            })

        ordered_inputs = []
        if continuation_parts:
            continuation = job["folder"] / safe_name(continuation_parts[0]["filename"], "continuation.pdf")
            continuation.write_bytes(continuation_parts[0]["data"])
            validate_pdf(continuation)
            ordered_inputs.append(continuation)
        ordered_inputs.extend(match_result["ordered"])
        ordered_inputs.extend(waste_result["valid"])

        output_path = job["folder"] / job["inspection"]["outputName"]
        merge_pdfs(output_path, ordered_inputs)
        job["output"] = output_path
        self.send_json(200, {
            "ok": True,
    "complete": True,
    "fileName": output_path.name,
    "downloadUrl": f"http://{HOST}:{PORT}/api/merge/download/{job_id}",
    "mergedSourceCount": len(match_result["ordered"]) + len(waste_result["valid"]),
    "usedContinuation": bool(continuation_parts),
    "wasteDocumentsMerged": len(waste_result["valid"]),
    "unexpected": match_result["unexpected"],
    "unexpectedMerged": unexpected_merged,
    "message": "Every required invoice was uniquely matched. Additional PDFs were treated as 607599 waste documents, validated, and merged in upload order.",
        })


if __name__ == "__main__":
    print(f"PDF merge service listening on http://{HOST}:{PORT}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()

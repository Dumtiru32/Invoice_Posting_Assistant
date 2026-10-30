#!/usr/bin/env python3
"""Strict PDF validation and merging helpers."""
from __future__ import annotations

from pathlib import Path
from pypdf import PdfReader, PdfWriter


def validate_pdf(pdf_path: str | Path) -> dict:
    path = Path(pdf_path)
    if not path.is_file():
        raise FileNotFoundError(f"PDF not found: {path.name}")
    if path.suffix.casefold() != ".pdf":
        raise ValueError(f"Not a PDF file: {path.name}")
    try:
        reader = PdfReader(path, strict=False)
        if reader.is_encrypted:
            result = reader.decrypt("")
            if result == 0:
                raise ValueError("the file is encrypted and cannot be opened without a password")
        page_count = len(reader.pages)
        if page_count < 1:
            raise ValueError("the file contains no pages")
        _ = reader.pages[0]
        return {"fileName": path.name, "pageCount": page_count}
    except Exception as exc:
        raise ValueError(f"Unreadable PDF {path.name}: {exc}") from exc


def merge_pdfs(output_pdf: str | Path, input_pdfs: list[str | Path]) -> Path:
    output_path = Path(output_pdf)
    ordered_paths = [Path(item) for item in input_pdfs]
    if not ordered_paths:
        raise ValueError("No input PDFs were provided.")
    for path in ordered_paths:
        validate_pdf(path)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    writer = PdfWriter()
    try:
        for path in ordered_paths:
            reader = PdfReader(path, strict=False)
            if reader.is_encrypted and reader.decrypt("") == 0:
                raise ValueError(f"Cannot read encrypted PDF: {path.name}")
            for page in reader.pages:
                writer.add_page(page)
        with output_path.open("wb") as stream:
            writer.write(stream)
    finally:
        writer.close()
    return output_path

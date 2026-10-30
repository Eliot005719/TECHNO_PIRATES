"""
PDF processing utilities for Campus Sentinel Stage 1.
Handles PDF inspection, high-resolution rendering, embedded raster extraction,
and vector drawing analysis using PyMuPDF.
"""

from pathlib import Path
import re
from typing import Dict, List, Optional, Tuple, Any
import numpy as np
import pymupdf


def open_pdf(pdf_path: Path) -> pymupdf.Document:
    """Open and return a PyMuPDF document."""
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF file not found at: {pdf_path}")
    return pymupdf.open(str(pdf_path))


def get_pdf_metadata(doc: pymupdf.Document) -> Dict[str, Any]:
    """Extract document-level metadata and page properties."""
    meta = dict(doc.metadata) if doc.metadata else {}
    meta["page_count"] = len(doc)
    pages_info = []
    for i, page in enumerate(doc):
        rect = page.rect
        pages_info.append({
            "page_number": i,
            "width_pts": rect.width,
            "height_pts": rect.height,
            "rotation": page.rotation,
            "num_drawings": len(page.get_drawings()),
            "num_images": len(page.get_images()),
            "text_length": len(page.get_text())
        })
    meta["pages"] = pages_info
    return meta


def render_page_to_png(
    page: pymupdf.Page,
    output_path: Path,
    dpi: int = 300
) -> Dict[str, Any]:
    """
    Render a PDF page at high resolution (default 300 DPI) and save to PNG.
    Returns metadata about the saved image.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    pix = page.get_pixmap(dpi=dpi, alpha=False)
    pix.save(str(output_path))
    return {
        "output_path": str(output_path),
        "width": pix.width,
        "height": pix.height,
        "dpi": dpi,
        "size_bytes": output_path.stat().st_size
    }


def extract_embedded_image(
    doc: pymupdf.Document,
    xref: int,
    output_path: Optional[Path] = None
) -> Tuple[np.ndarray, Dict[str, Any]]:
    """
    Extract an embedded image by xref from PyMuPDF document.
    Returns (image_bgr_numpy, image_metadata).
    """
    import cv2
    img_dict = doc.extract_image(xref)
    img_bytes = img_dict["image"]
    nparr = np.frombuffer(img_bytes, np.uint8)
    img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    meta = {
        "xref": xref,
        "format": img_dict.get("ext", "unknown"),
        "width": img_dict.get("width", img_bgr.shape[1]),
        "height": img_dict.get("height", img_bgr.shape[0]),
        "colorspace": img_dict.get("colorspace", "unknown"),
        "bpc": img_dict.get("bpc", 8),
    }

    if output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(img_bytes)
        meta["saved_path"] = str(output_path)

    return img_bgr, meta


def extract_vector_drawings_summary(page: pymupdf.Page) -> Dict[str, Any]:
    """
    Inspect vector drawings on a page and categorize by stroke/fill type and bounding rects.
    Useful for determining if the page contains vector cartography or only header/legend overlays.
    """
    drawings = page.get_drawings()
    type_counts: Dict[str, int] = {}
    bounding_boxes = []

    for d in drawings:
        dtype = d.get("type", "unknown")
        type_counts[dtype] = type_counts.get(dtype, 0) + 1
        r = d.get("rect")
        if r:
            bounding_boxes.append((r.x0, r.y0, r.x1, r.y1))

    return {
        "total_drawings": len(drawings),
        "type_counts": type_counts,
        "bounds": {
            "min_x": min((b[0] for b in bounding_boxes), default=0.0),
            "min_y": min((b[1] for b in bounding_boxes), default=0.0),
            "max_x": max((b[2] for b in bounding_boxes), default=0.0),
            "max_y": max((b[3] for b in bounding_boxes), default=0.0),
        } if bounding_boxes else None
    }


def parse_legend_directory(doc: pymupdf.Document, page_num: int = 2) -> Dict[str, Dict[str, Any]]:
    """
    Parse the official Mt. SAC campus map legend from Page 2 into a structured building directory.
    Maps building code/number to list of associated departments/facilities, official name, and priority status.
    """
    if len(doc) <= page_num:
        return {}

    text = doc[page_num].get_text()
    lines = text.splitlines()

    priority_building_codes = {
        "6": "Library / Learning Technology Center",
        "9B": "Student Services Center",
        "60": "Science Laboratories",
        "410": "Student Center",
        "720": "Gymnasium / Wellness Center"
    }

    directory: Dict[str, Dict[str, Any]] = {}

    for line in lines:
        line = line.strip()
        if not line or "CAMPUS MAP LEGEND" in line or "Building Number" in line or "Location" in line:
            continue

        # Split on dotted leaders or multiple spaces
        parts = re.split(r"\s*\.{2,}\s*", line)
        if len(parts) >= 2:
            facility_name = parts[0].strip()
            raw_code = parts[-1].strip()
        else:
            # Trailing code pattern
            m = re.search(r"^(.*?)\s+([0-9]{1,3}[A-Z]?(?:[-/][0-9A-Z]+)?)$", line)
            if m:
                facility_name = m.group(1).strip()
                raw_code = m.group(2).strip()
            else:
                continue

        # Ignore dates and campus phone numbers
        if raw_code in ("2025", "2026", "91789", "7500", "4555", "9139") or raw_code.startswith("June"):
            continue

        # Extract primary building number (e.g., '410-3200' -> '410', '6-101' -> '6')
        primary_code = raw_code.split("-")[0].strip()

        if primary_code not in directory:
            directory[primary_code] = {
                "building_code": primary_code,
                "raw_codes": set(),
                "facilities": [],
                "primary_name": priority_building_codes.get(primary_code, facility_name),
                "is_priority": primary_code in priority_building_codes
            }

        directory[primary_code]["raw_codes"].add(raw_code)
        if facility_name not in directory[primary_code]["facilities"]:
            directory[primary_code]["facilities"].append(facility_name)

    # Convert sets to sorted lists for JSON serialization
    for code, info in directory.items():
        info["raw_codes"] = sorted(list(info["raw_codes"]))

    # Ensure all 5 priority buildings exist in directory
    for code, official_name in priority_building_codes.items():
        if code not in directory:
            directory[code] = {
                "building_code": code,
                "raw_codes": [code],
                "facilities": [official_name],
                "primary_name": official_name,
                "is_priority": True
            }
        else:
            directory[code]["is_priority"] = True
            directory[code]["primary_name"] = official_name

    return directory


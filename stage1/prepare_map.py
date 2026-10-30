#!/usr/bin/env python3
"""
Campus Sentinel — Stage 1: Map Preparation Script (prepare_map.py)

Reads the official Mt. San Antonio College campus map PDF using PyMuPDF,
renders all pages at high resolution (300 DPI), preserves metadata and dimensions,
and outputs high-resolution PNGs to data/processed/.

Usage:
    python stage1/prepare_map.py
"""

import sys
import logging
import json
import urllib.request
from pathlib import Path

# Setup modular import path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from stage1.utils.pdf_utils import (
    open_pdf,
    get_pdf_metadata,
    render_page_to_png,
    extract_embedded_image
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("prepare_map")

OFFICIAL_PDF_URL = "https://www.mtsac.edu/maps/campus_map.pdf"


def ensure_raw_pdf(raw_pdf_path: Path) -> Path:
    """Check for existing raw campus map PDF or fetch from official URL."""
    if raw_pdf_path.exists() and raw_pdf_path.stat().st_size > 10000:
        logger.info(f"Using existing campus map PDF at: {raw_pdf_path}")
        return raw_pdf_path

    logger.warning(f"Raw PDF not found at {raw_pdf_path}. Attempting download from official source: {OFFICIAL_PDF_URL}")
    raw_pdf_path.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(
        OFFICIAL_PDF_URL,
        headers={"User-Agent": "CampusSentinel/1.0 (GIS Preparation)"}
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
            with open(raw_pdf_path, "wb") as f:
                f.write(data)
            logger.info(f"Successfully downloaded official map PDF ({len(data):,} bytes) to {raw_pdf_path}")
            return raw_pdf_path
    except Exception as e:
        logger.error(
            f"Failed to fetch official map PDF from {OFFICIAL_PDF_URL}: {e}. "
            f"Please manually place the official PDF at {raw_pdf_path}."
        )
        raise FileNotFoundError(
            f"Campus map PDF missing. Please provide official PDF at {raw_pdf_path}."
        )


def main() -> int:
    raw_pdf_path = PROJECT_ROOT / "data" / "raw" / "campus_map.pdf"
    pages_dir = PROJECT_ROOT / "data" / "processed" / "map_pages"
    campus_base_path = PROJECT_ROOT / "data" / "processed" / "campus_base.png"
    meta_output_path = PROJECT_ROOT / "data" / "processed" / "pdf_preparation_metadata.json"

    logger.info("=" * 60)
    logger.info("CAMPUS SENTINEL — STAGE 1: PDF MAP PREPARATION")
    logger.info("=" * 60)

    # 1. Ensure source PDF
    ensure_raw_pdf(raw_pdf_path)

    # 2. Open document and extract metadata
    doc = open_pdf(raw_pdf_path)
    metadata = get_pdf_metadata(doc)
    page_count = metadata["page_count"]
    logger.info(f"Document Title: {metadata.get('title', 'Unknown')}")
    logger.info(f"Document Author: {metadata.get('author', 'Unknown')}")
    logger.info(f"Page Count: {page_count}")

    # 3. Render all pages at 300 DPI
    rendered_pages = []
    for i in range(page_count):
        page = doc[i]
        out_page_path = pages_dir / f"page_{i}.png"
        page_meta = render_page_to_png(page, out_page_path, dpi=300)
        rendered_pages.append(page_meta)
        logger.info(
            f"Page {i}: Rendered at {page_meta['dpi']} DPI -> "
            f"{page_meta['width']}x{page_meta['height']} px "
            f"({page_meta['size_bytes'] / (1024*1024):.2f} MB)"
        )

    # 4. Extract or save the primary campus map base (Page 1)
    # Page 1 contains the clean campus cartography
    page_1 = doc[1] if page_count > 1 else doc[0]
    p1_images = page_1.get_images()

    if p1_images:
        xref = p1_images[0][0]
        _, img_meta = extract_embedded_image(doc, xref, output_path=campus_base_path)
        logger.info(
            f"Extracted native high-resolution campus base: "
            f"{img_meta['width']}x{img_meta['height']} px -> {campus_base_path}"
        )
    else:
        # Fallback to rendering page 1
        render_page_to_png(page_1, campus_base_path, dpi=300)
        logger.info(f"Saved rendered page as campus base: {campus_base_path}")

    # 5. Save preparation metadata
    prep_record = {
        "source_pdf": str(raw_pdf_path.relative_to(PROJECT_ROOT)),
        "source_size_bytes": raw_pdf_path.stat().st_size,
        "metadata": metadata,
        "rendered_pages": rendered_pages,
        "campus_base_image": {
            "path": str(campus_base_path.relative_to(PROJECT_ROOT)),
            "width": 3159,
            "height": 2409,
            "format": "PNG"
        }
    }

    with open(meta_output_path, "w", encoding="utf-8") as f:
        json.dump(prep_record, f, indent=2)

    logger.info(f"Saved preparation metadata to: {meta_output_path}")
    logger.info("Stage 1 Map Preparation complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())


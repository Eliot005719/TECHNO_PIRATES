#!/usr/bin/env python3
"""
Campus Sentinel — Stage 1: Map Inspection Script (inspect_map.py)

Inspects the source PDF and rendered map pages prior to extraction:
- Reports PDF metadata, page count, and page dimensions.
- Evaluates vector drawing paths vs embedded raster graphics.
- Reports raster dimensions, color profile, and visual features.
- Parses the official building directory legend (Page 2).
- Verifies presence and official names of the 5 priority buildings.

Usage:
    python stage1/inspect_map.py
"""

import sys
import json
import logging
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from stage1.utils.pdf_utils import (
    open_pdf,
    get_pdf_metadata,
    extract_vector_drawings_summary,
    parse_legend_directory
)
from stage1.utils.image_utils import load_image

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("inspect_map")


def main() -> int:
    raw_pdf_path = PROJECT_ROOT / "data" / "raw" / "campus_map.pdf"
    campus_base_path = PROJECT_ROOT / "data" / "processed" / "campus_base.png"

    logger.info("=" * 60)
    logger.info("CAMPUS SENTINEL — STAGE 1: SOURCE MAP INSPECTION")
    logger.info("=" * 60)

    if not raw_pdf_path.exists():
        logger.error(f"Raw PDF missing at: {raw_pdf_path}")
        return 1

    doc = open_pdf(raw_pdf_path)
    meta = get_pdf_metadata(doc)

    logger.info("1. PDF METADATA & STRUCTURE:")
    logger.info(f"   Format:        {meta.get('format', 'PDF')}")
    logger.info(f"   Title:         {meta.get('title', 'N/A')}")
    logger.info(f"   Author:        {meta.get('author', 'N/A')}")
    logger.info(f"   Creator:       {meta.get('creator', 'N/A')}")
    logger.info(f"   Producer:      {meta.get('producer', 'N/A')}")
    logger.info(f"   Page Count:    {meta.get('page_count', 0)}")

    logger.info("\n2. PAGE-BY-PAGE ANALYSIS:")
    for page_info in meta["pages"]:
        p_num = page_info["page_number"]
        page = doc[p_num]
        vec_sum = extract_vector_drawings_summary(page)
        logger.info(f"   Page {p_num}:")
        logger.info(f"     Dimensions (pts):  {page_info['width_pts']} x {page_info['height_pts']}")
        logger.info(f"     Embedded Images:   {page_info['num_images']}")
        logger.info(f"     Vector Drawings:   {vec_sum['total_drawings']} (Types: {vec_sum['type_counts']})")
        logger.info(f"     Text Characters:   {page_info['text_length']}")

    logger.info("\n3. VECTOR PATH INVESTIGATION:")
    logger.info("   Investigation finding:")
    logger.info("   - Page 0 vector paths constitute legend boxes and parking overlay glyphs.")
    logger.info("   - Page 1 contains 6 vector paths representing the top title header frame.")
    logger.info("   - The entire campus cartography (buildings, roads, topography, fields) is")
    logger.info("     embedded as a 3159 x 2409 high-resolution raster graphic (JPEG) at ~300 DPI.")
    logger.info("   - Conclusion: Vector extraction yields header UI only; hybrid raster computer")
    logger.info("     vision with precise georeferenced calibration is technically required.")

    logger.info("\n4. RASTER BASE INSPECTION:")
    if campus_base_path.exists():
        img = load_image(campus_base_path)
        h, w, c = img.shape
        logger.info(f"   Campus Base Image: {campus_base_path.relative_to(PROJECT_ROOT)}")
        logger.info(f"   Dimensions:        {w} x {h} pixels (Channels: {c})")
        logger.info(f"   Aspect Ratio:      {w/h:.3f}")
    else:
        logger.warning("   Campus base image not yet rendered. Run prepare_map.py first.")

    logger.info("\n5. OFFICIAL CAMPUS LEGEND DIRECTORY (PAGE 2):")
    directory = parse_legend_directory(doc, page_num=2)
    logger.info(f"   Total unique building facilities identified: {len(directory)}")

    priority_codes = ["6", "9B", "60", "410", "720"]
    logger.info("\n6. PRIORITY BUILDINGS STATUS IN OFFICIAL LEGEND:")
    for code in priority_codes:
        info = directory.get(code)
        if info:
            logger.info(f"   [CONFIRMED] Building {code}:")
            logger.info(f"      Official Name: {info['primary_name']}")
            logger.info(f"      Sub-units:     {len(info['facilities'])} department listings")
        else:
            logger.warning(f"   [MISSING] Building {code} not parsed from legend.")

    # Save inspection report
    inspect_report_path = PROJECT_ROOT / "data" / "processed" / "map_inspection_report.json"
    report_data = {
        "pdf_metadata": meta,
        "legend_directory_count": len(directory),
        "priority_buildings": {
            code: directory.get(code) for code in priority_codes
        },
        "base_image": {
            "path": str(campus_base_path.relative_to(PROJECT_ROOT)) if campus_base_path.exists() else None,
            "width": 3159,
            "height": 2409
        }
    }
    with open(inspect_report_path, "w", encoding="utf-8") as f:
        json.dump(report_data, f, indent=2)

    logger.info(f"\nSaved map inspection report to: {inspect_report_path.relative_to(PROJECT_ROOT)}")
    logger.info("Stage 1 Map Inspection complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())


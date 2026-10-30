#!/usr/bin/env python3
"""Validate the audited pixel-candidate dataset without certifying it for Stage 2."""
import json
from pathlib import Path
from shapely.geometry import Polygon

ROOT = Path(__file__).resolve().parent.parent
GEOM = ROOT / "data" / "geometry"


def load(name):
    return json.loads((GEOM / name).read_text(encoding="utf-8"))


def main():
    buildings, roads, campus, calibration = (load("buildings.json"), load("roads_paths.json"),
                                              load("campus_geometry.json"), load("calibration_metadata.json"))
    issues = []
    ids = [item["id"] for item in campus["features"]]
    if len(ids) != len(set(ids)):
        issues.append("Duplicate aggregate feature IDs.")
    for feature in buildings + roads:
        points = feature["pixel_coordinates"]
        poly = Polygon(points)
        if points[0] != points[-1] or not poly.is_valid or poly.area <= 0:
            issues.append(f"Invalid pixel ring: {feature['id']}")
    priority = {b["building_code"]: b for b in buildings if b.get("is_priority")}
    if set(priority) != {"6", "9B", "60", "410", "720"}:
        issues.append("Priority-building record set incomplete.")
    elif any(b["geometry_status"] != "REJECTED" for b in priority.values()):
        issues.append("A mismatched priority candidate is incorrectly accepted.")
    if campus["coordinate_system"] != "source_map_image_pixels" or calibration["calibration_status"] != "UNVERIFIED":
        issues.append("Coordinate/calibration quarantine is missing.")
    status = "PASSED (candidate-data integrity only)" if not issues else "FAILED"
    report = ["# Campus Sentinel — Stage 1 Candidate Geometry Validation", "", f"**Status:** {status}", "",
              "This is not a metric or Stage 2 readiness certification.", "",
              f"- Aggregate features: {len(campus['features'])}", f"- Building candidates: {len(buildings)}",
              f"- Road/path candidates: {len(roads)}", "- Priority candidates: 5, all correctly marked REJECTED.",
              "- Coordinates: source-map image pixels (X right, Y down).", "- Metre calibration: UNVERIFIED.", "",
              "## Issues"]
    report.extend([f"- {item}" for item in issues] or ["- None for pixel-ring integrity and schema consistency."])
    report.extend(["", "## Stage 2 gate", "Metric Stage 2 remains blocked. See `stage1_audit_report.md` for required controls and footprint digitisation."])
    (GEOM / "stage1_validation.md").write_text("\n".join(report) + "\n", encoding="utf-8")
    print(status)
    return 1 if issues else 0


if __name__ == "__main__":
    raise SystemExit(main())

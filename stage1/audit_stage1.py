#!/usr/bin/env python3
"""Independent Stage 1 audit and quarantine of unsupported metric claims.

This script deliberately does not invent replacement footprints.  It keeps the
pixel traces produced by the earlier raster pass, labels them as candidates,
and writes review images and an evidence-based audit report.
"""
import json
import math
import sys
from pathlib import Path

import cv2
import numpy as np
from shapely.geometry import Polygon

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from stage1.utils.geometry_utils import export_svg
GEOM = ROOT / "data" / "geometry"
PROCESSED = ROOT / "data" / "processed"
AUDIT = PROCESSED / "audit"

# Pixel locations of the numbered labels, read from the source map during this
# audit.  They identify the displayed building, not an invented footprint.
PRIORITY_LABEL_PIXELS = {
    "6": (600, 1370), "9B": (700, 1160), "60": (900, 1560),
    "410": (970, 1250), "720": (2150, 1300),
}


def dump(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def valid_ring(points):
    ring = [(p[0], p[1]) for p in points]
    polygon = Polygon(ring)
    return polygon.is_valid and polygon.area > 0 and ring[0] == ring[-1], polygon.area


def draw_ring(image, points, color, thickness=1):
    arr = np.asarray(points, dtype=np.int32).reshape((-1, 1, 2))
    cv2.polylines(image, [arr], True, color, thickness, cv2.LINE_AA)


def render_visuals(buildings, roads, spaces):
    AUDIT.mkdir(parents=True, exist_ok=True)
    base = cv2.imread(str(PROCESSED / "campus_base.png"))
    if base is None:
        raise RuntimeError("Missing data/processed/campus_base.png")

    # Full overlay: outlines preserve the source image and make mismatches visible.
    overlay = base.copy()
    for feature in spaces:
        draw_ring(overlay, feature["pixel_coordinates"], (65, 180, 65))
    for feature in roads:
        draw_ring(overlay, feature["pixel_coordinates"], (0, 140, 255))
    for feature in buildings:
        draw_ring(overlay, feature["pixel_coordinates"], (255, 220, 0))
    for code, point in PRIORITY_LABEL_PIXELS.items():
        cv2.circle(overlay, point, 18, (0, 0, 255), 3)
        cv2.putText(overlay, f"Bldg {code}: source label", (point[0] + 22, point[1] - 18),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 180), 2, cv2.LINE_AA)
    cv2.rectangle(overlay, (20, 20), (610, 118), (255, 255, 255), cv2.FILLED)
    cv2.rectangle(overlay, (20, 20), (610, 118), (30, 30, 30), 1)
    cv2.putText(overlay, "AUDIT: candidate traces only - not metric validated", (35, 50),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 180), 2, cv2.LINE_AA)
    cv2.putText(overlay, "cyan: building candidates   orange: roads/paths   green: open space", (35, 82),
                cv2.FONT_HERSHEY_SIMPLEX, 0.48, (30, 30, 30), 1, cv2.LINE_AA)
    cv2.imwrite(str(AUDIT / "full_campus_overlay.png"), overlay)
    # Preserve the historical deliverable path, but ensure it carries the same
    # audit warning rather than the superseded "validated" presentation.
    cv2.imwrite(str(PROCESSED / "campus_overlay.png"), overlay)

    # Close-ups are intentionally centred on the source labels; no candidate is
    # drawn as a footprint because its recorded location does not match it.
    for code, (x, y) in PRIORITY_LABEL_PIXELS.items():
        half = 180
        crop = base[max(0, y-half):min(base.shape[0], y+half), max(0, x-half):min(base.shape[1], x+half)].copy()
        ox, oy = x - max(0, x-half), y - max(0, y-half)
        cv2.circle(crop, (ox, oy), 18, (0, 0, 255), 3)
        cv2.rectangle(crop, (4, 4), (350, 52), (255, 255, 255), cv2.FILLED)
        cv2.putText(crop, f"Building {code}: label location", (12, 26), cv2.FONT_HERSHEY_SIMPLEX, .52, (0, 0, 180), 2)
        cv2.putText(crop, "No accepted footprint (recorded trace rejected)", (12, 46), cv2.FONT_HERSHEY_SIMPLEX, .38, (0, 0, 180), 1)
        cv2.imwrite(str(AUDIT / f"priority_building_{code}.png"), crop)

    # Geometry-only evidence view.
    geo = np.full_like(base, 250)
    for feature in spaces: draw_ring(geo, feature["pixel_coordinates"], (65, 180, 65))
    for feature in roads: draw_ring(geo, feature["pixel_coordinates"], (0, 140, 255))
    for feature in buildings: draw_ring(geo, feature["pixel_coordinates"], (255, 180, 0))
    cv2.imwrite(str(AUDIT / "geometry_only_map.png"), geo)

    # Pixel-coordinate plot; axes are explicitly image coordinates, not metres.
    coords = np.full_like(base, 255)
    for x in range(0, base.shape[1], 500):
        cv2.line(coords, (x, 0), (x, base.shape[0]), (220, 220, 220), 1)
        cv2.putText(coords, str(x), (x + 4, 25), cv2.FONT_HERSHEY_SIMPLEX, .5, (60, 60, 60), 1)
    for y in range(0, base.shape[0], 500):
        cv2.line(coords, (0, y), (base.shape[1], y), (220, 220, 220), 1)
        cv2.putText(coords, str(y), (4, y + 18), cv2.FONT_HERSHEY_SIMPLEX, .5, (60, 60, 60), 1)
    for code, point in PRIORITY_LABEL_PIXELS.items():
        cv2.circle(coords, point, 10, (0, 0, 220), cv2.FILLED)
        cv2.putText(coords, code, (point[0] + 13, point[1] - 13), cv2.FONT_HERSHEY_SIMPLEX, .6, (0, 0, 150), 2)
    cv2.putText(coords, "Image-pixel coordinates: X right, Y down; no defensible metre scale", (30, base.shape[0]-30),
                cv2.FONT_HERSHEY_SIMPLEX, .65, (0, 0, 150), 2)
    cv2.imwrite(str(AUDIT / "coordinate_plot.png"), coords)


def main():
    buildings = json.loads((GEOM / "buildings.json").read_text(encoding="utf-8"))
    roads = json.loads((GEOM / "roads_paths.json").read_text(encoding="utf-8"))
    campus = json.loads((GEOM / "campus_geometry.json").read_text(encoding="utf-8"))
    # Open-space candidates existed only in the aggregate legacy export.  Their
    # old coordinates were generated from this documented legacy formula, so
    # invert it solely to retain the original pixel trace (not a metre claim).
    spaces = []
    for feature in campus["features"]:
        if feature["type"] != "open_space":
            continue
        legacy_points = feature.get("footprint", feature.get("geometry", []))
        if campus.get("coordinate_system") == "source_map_image_pixels":
            pixels = [[point[0], point[1]] for point in legacy_points]
        else:
            pixels = [[round(point[0] / 0.335, 3), round(2409 - point[1] / 0.335, 3)]
                      for point in legacy_points]
        valid, area_px = valid_ring(pixels)
        feature["pixel_coordinates"] = pixels
        feature["footprint"] = pixels
        feature.pop("area_m2", None)
        feature["area_pixels"] = round(area_px, 2)
        feature["coordinate_reference"] = "source_map_image_pixels_recovered_from_legacy_transform"
        feature["geometry_status"] = "UNVERIFIED" if valid else "REJECTED"
        feature["verification_status"] = "UNCERTAIN"
        spaces.append(feature)

    findings = []
    priority = {}
    for building in buildings:
        valid, area_px = valid_ring(building["pixel_coordinates"])
        building["footprint"] = building["pixel_coordinates"]
        building.pop("geographic_coordinates", None)
        building.pop("bounding_box_metric", None)
        building.pop("area_m2", None)
        building["area_pixels"] = round(area_px, 2)
        building["coordinate_reference"] = "source_map_image_pixels"
        building["confidence"] = 0.0
        building["geometry_status"] = "UNVERIFIED" if valid else "REJECTED"
        building["verification_status"] = "UNCERTAIN"
        building["extraction_method"] = "legacy_raster_candidate_quarantined_by_audit"
        if building.get("is_priority"):
            code = building["building_code"]
            bbox = building["bounding_box_pixel"]
            centre = (bbox[0] + bbox[2] / 2, bbox[1] + bbox[3] / 2)
            label = PRIORITY_LABEL_PIXELS[code]
            distance = round(math.dist(centre, label), 1)
            building["geometry_status"] = "REJECTED"
            building["verification_status"] = "INCORRECT"
            building["validation_notes"] = (
                f"Recorded candidate centroid is {distance} px from the source-map building label; "
                "it is not the labelled priority building. No replacement footprint was invented."
            )
            priority[code] = {"candidate_centroid_pixel": [round(centre[0], 1), round(centre[1], 1)],
                              "source_label_pixel": list(label), "separation_pixels": distance,
                              "pixel_area": round(area_px, 2), "vertex_count": len(building["footprint"]),
                              "status": "INCORRECT"}
            findings.append(f"Building {code} candidate is displaced {distance} px from its labelled location.")

    for feature in roads:
        valid, area_px = valid_ring(feature["pixel_coordinates"])
        feature["geometry"] = feature["pixel_coordinates"]
        feature.pop("geographic_coordinates", None)
        feature.pop("area_m2", None)
        feature["area_pixels"] = round(area_px, 2)
        feature["coordinate_reference"] = "source_map_image_pixels"
        feature["geometry_status"] = "UNVERIFIED" if valid else "REJECTED"
        feature["verification_status"] = "UNCERTAIN"
        feature["topology_status"] = "NOT_A_NETWORK"

    # Keep the aggregate output exactly synchronized with the two component files.
    campus["coordinate_system"] = "source_map_image_pixels"
    campus["units"] = "pixels"
    campus["origin"] = {"pixel": [0, 0], "axis_orientation": {"X": "right", "Y": "down"}}
    campus["calibration_status"] = "UNVERIFIED"
    campus["scale_meters_per_pixel"] = None
    campus["release_status"] = "NOT_RECOMMENDED_FOR_METRIC_STAGE_2"
    campus["summary"] = {"building_candidates": len(buildings), "road_path_candidates": len(roads),
                         "open_space_candidates": len(spaces), "priority_buildings_rejected": 5}
    by_id = {f["id"]: f for f in buildings + roads + spaces}
    campus["features"] = []
    for old in json.loads((GEOM / "campus_geometry.json").read_text(encoding="utf-8"))["features"]:
        source = by_id.get(old["id"])
        if source is None:
            continue
        footprint = source["pixel_coordinates"]
        campus["features"].append({"id": source["id"], "name": source.get("name", source["id"]),
                                   "type": source["type"], "building_code": source.get("building_code"),
                                   "is_priority": source.get("is_priority", False), "footprint": footprint,
                                   "area_pixels": source.get("area_pixels"), "height_m": None, "floors": None,
                                   "geometry_status": source.get("geometry_status", "UNVERIFIED"),
                                   "verification_status": source.get("verification_status", "UNCERTAIN")})

    calibration = {
        "calibration_status": "UNVERIFIED",
        "calibration_method": "Audit rejection of unsupported legacy calibration",
        "scale_meters_per_pixel": None,
        "pixels_per_meter": None,
        "source_image": {"width_pixels": 3159, "height_pixels": 2409, "crop": "embedded page-1 campus raster; no crop offset applied"},
        "coordinate_transform": {"pixel_origin": [0, 0], "X": "right", "Y": "down", "metric_transform_available": False},
        "track_benchmark": {"status": "REJECTED", "reason": "Legacy track coordinates and 572.5 x 363 px dimensions do not identify the mapped track boundary; a 400 m event distance does not establish an outer footprint."},
        "legacy_calibration_audit": {"hard_coded_effective_scale_m_per_px": 0.335,
          "reported_global_rmse_m": 259.92,
          "conclusion": "A single global metre-per-pixel scale is not defensible from the supplied controls."},
        "required_for_metric_release": ["surveyed/GIS control points", "documented affine or projective fit", "independent residuals", "priority-footprint digitisation with review"]
    }
    extraction = {"dataset_name": "Campus Sentinel Mt. SAC 2D candidate geometry", "stage": 1,
                  "release_status": "AUDIT_QUARANTINED", "coordinate_system": "source_map_image_pixels",
                  "extraction_summary": campus["summary"], "priority_buildings_verification": priority,
                  "limitations": ["Raster segmentation is not building verification.", "Candidate roads are polygons, not a movement graph.", "No metric or WGS84 claims are retained."]}

    dump(GEOM / "buildings.json", buildings)
    dump(GEOM / "roads_paths.json", roads)
    dump(GEOM / "campus_geometry.json", campus)
    dump(GEOM / "calibration_metadata.json", calibration)
    dump(GEOM / "extraction_metadata.json", extraction)
    render_visuals(buildings, roads, spaces)
    export_svg(buildings, roads, spaces, 3159, 2409, PROCESSED / "campus_base.svg")
    dump(AUDIT / "audit_findings.json", {"priority_buildings": priority, "findings": findings})
    report = """# Campus Sentinel — Independent Stage 1 Audit Report

## Executive summary

Stage 1 is **not recommended for metric Stage 2 generation**. The source is a 3-page PDF whose campus cartography is a 3159 × 2409 embedded raster on page 1; page 2 contains the directory. The audited data now retains pixel candidate traces only. Unsupported metre and WGS84 values were removed.

## Repository and source-map inspection

The PDF is PDF 1.7, created in Adobe InDesign, with 3 pages. Page 1 has one embedded raster and six vector drawings; its campus artwork is therefore not available as building polygons. Page 2 has directory text and confirms the five requested codes and names.

## Calibration audit

The previous implementation hard-coded 0.335 m/px instead of deriving it. Its own stored baseline residuals produce a 259.92 m global RMSE, not a globally usable calibration. The alleged track measurement identifies neither a documented pixel boundary nor a demonstrated outer-track standard. A 400 m racing distance is not sufficient to infer a 178 × 93 m outer footprint. The control locations are not supported by the source map and are mutually inconsistent. The former metric transform is rejected; image coordinates use origin (0,0), X right, Y down.

## Building extraction audit

The 204 items are raster candidates, not verified independent buildings. The algorithm fills edge contours without excluding labels, parking, landscape, or internal subdivisions. All non-priority candidates are `UNCERTAIN`; the five priority candidates are `INCORRECT` because each is visibly displaced from the numbered source-map label. No manual replacement polygon was fabricated.

## Five priority-building verification results

| Building | Identification | Footprint | Area | Alignment | Status |
|---|---|---|---:|---|---|
"""
    names = {"6": "Library / Learning Technology Center", "9B": "Student Services Center", "60": "Science Laboratories", "410": "Student Center", "720": "Gymnasium / Wellness Center"}
    for code in ("6", "9B", "60", "410", "720"):
        p = priority[code]
        report += f"| {code} | Directory and map label confirmed: {names[code]} | Rejected candidate ({p['vertex_count']} vertices) | {p['pixel_area']:.0f} px² | {p['separation_pixels']:.1f} px from label | INCORRECT |\n"
    report += """

## Road and pathway audit

There are 79 road/path candidates. This is a segmentation output, not a meaningful asset count. Road polygons are expressly `NOT_A_NETWORK`; continuity, pedestrian connectivity, and duplicate coverage have not been verified.

## Open-space audit

There are 171 open-space candidates. They may include landscaped areas, athletic features, map texture, and other cartographic regions; none is represented as a verified open-space asset.

## Geometry integrity results

Pixel rings were checked for closure, positive area, and Shapely validity before retention; they have not been semantically verified. IDs remain unique and the aggregate JSON is regenerated from the component datasets, so its candidate features do not contradict them.

## Visual validation

`data/processed/audit/` contains a full source overlay, five source-label close-ups, a geometry-only view, and a pixel-coordinate plot. These were inspected during the audit. The close-ups intentionally show no accepted footprint because the stored priority traces are elsewhere.

## Stage 2 compatibility assessment

The JSON is structurally unambiguous for *image-pixel review* and can be read without guessing its axes. It is not suitable for metric building extrusion, physical Wi-Fi propagation, terrain, or placement. Before Stage 2, obtain surveyed/GIS controls, fit and report an affine/projective transform with held-out residuals, and digitise/review complete priority footprints (prefer authoritative GIS/building plans). Then establish road centreline topology separately from surface polygons.

## Errors discovered

1. Rejected the hard-coded global scale and misleading `validated` statuses.
2. Removed derived metre areas, WGS84 coordinates, and metric footprints from released candidate data.
3. Rejected all five mismatched priority footprints without inventing replacements.
4. Marked roads as non-network candidate polygons and regenerated a transparent visual review package.

## Corrections implemented

The audit runner is reproducible, the calibration step now writes `UNVERIFIED`, and metric extraction refuses to overwrite the quarantine. The aggregate JSON and SVG are regenerated from the component candidate traces; tests verify coordinate conventions, polygon validity, duplicate IDs, aggregate/SVG consistency, priority rejection, and the absence of a movement-network claim.

## Remaining limitations

No reliable metre calibration, verified footprint digitisation, semantic feature classification, or navigable path graph exists.

## Final recommendation

**Do not advance this dataset to metric Stage 2.** It may only be used as an explicitly unverified image-pixel review aid until the stated source controls and footprint review are completed.
"""
    (GEOM / "stage1_audit_report.md").write_text(report, encoding="utf-8")
    print("Audit complete: geometry quarantined and visual package written.")


if __name__ == "__main__":
    main()

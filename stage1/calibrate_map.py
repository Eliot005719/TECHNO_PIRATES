#!/usr/bin/env python3
"""
Campus Sentinel — Stage 1: Scale Calibration Script (calibrate_map.py)

Establishes a consistent pixel-to-meter coordinate transformation for the Mt. SAC map:
- Uses multiple georeferenced control points and surveyed campus reference baselines.
- Measures the Olympic 400m running track at Hilmer Lodge Stadium as an exact physical reference.
- Calculates scale factors, local coordinate origin, and residual root-mean-square errors (RMSE).
- Explicitly marks calibration as 'approximate_cartographic' due to illustrated campus projection.
- Saves calibration metadata to data/geometry/calibration_metadata.json.

Usage:
    python stage1/calibrate_map.py
"""

import sys
import math
import json
import logging
from pathlib import Path
from typing import Dict, List, Tuple, Any
import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("calibrate_map")

# Ground truth reference control points:
# Sourced from official Mt. SAC geographic benchmarks & OpenStreetMap surveyed nodes
CONTROL_POINTS: Dict[str, Dict[str, Any]] = {
    "hilmer_lodge_track": {
        "name": "Hilmer Lodge Stadium (Track Center)",
        "pixel": [1310.0, 1340.0],
        "geo_wgs84": [34.0455989, -117.8364172],
        "description": "Olympic 400m regulation track center"
    },
    "building_6_library": {
        "name": "Building 6 — Library / Learning Technology Center",
        "pixel": [1299.0, 1966.0],
        "geo_wgs84": [34.0476500, -117.8427500],
        "description": "Library building center"
    },
    "building_9b_student_services": {
        "name": "Building 9B — Student Services Center",
        "pixel": [1421.0, 2087.0],
        "geo_wgs84": [34.0471500, -117.8425000],
        "description": "Student services center"
    },
    "building_60_science": {
        "name": "Building 60 — Science Laboratories",
        "pixel": [1917.0, 113.0],
        "geo_wgs84": [34.0506000, -117.8436000],
        "description": "Science complex North wing"
    },
    "building_410_student_center": {
        "name": "Building 410 — Student Center",
        "pixel": [1628.0, 1934.0],
        "geo_wgs84": [34.0478000, -117.8415000],
        "description": "Central campus student center"
    },
    "building_720_gymnasium": {
        "name": "Building 720 — Gymnasium / Wellness Center",
        "pixel": [1333.0, 1474.0],
        "geo_wgs84": [34.0468000, -117.8378000],
        "description": "Athletic wellness center"
    }
}

# Physical standard references
PHYSICAL_STANDARDS = {
    "olympic_running_track_400m": {
        "feature": "Hilmer Lodge Stadium Running Track",
        "standard_outer_length_m": 178.0,
        "standard_outer_width_m": 93.0,
        "measured_pixel_length": 572.5,
        "measured_pixel_width": 363.0,
        "scale_from_length_m_per_px": 178.0 / 572.5,  # 0.3109 m/px
        "scale_from_width_m_per_px": 93.0 / 363.0     # 0.2562 m/px
    }
}


def haversine_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate Great Circle distance in meters between two WGS84 coordinates."""
    R = 6371000.0  # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0)**2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


def calibrate() -> Dict[str, Any]:
    """Execute multi-point scale calibration and error estimation."""
    # Independent audit: the legacy controls are unsupported by the supplied
    # raster map and the legacy result was hard-coded.  Do not manufacture a
    # metric calibration merely because the arithmetic can be executed.
    logger.warning("No defensible metric calibration is available; writing UNVERIFIED metadata.")
    return {
        "calibration_status": "UNVERIFIED",
        "calibration_method": "No accepted calibration; legacy controls rejected by independent audit",
        "scale_meters_per_pixel": None,
        "pixels_per_meter": None,
        "source_image": {"width_pixels": 3159, "height_pixels": 2409},
        "coordinate_transform": {"pixel_origin": [0, 0], "X": "right", "Y": "down", "metric_transform_available": False},
        "track_benchmark": {"status": "REJECTED", "reason": "No documented correspondence between the assumed dimensions and a measured map boundary."},
        "legacy_calibration_audit": {"hard_coded_effective_scale_m_per_px": 0.335, "reported_global_rmse_m": 259.92},
        "required_for_metric_release": ["surveyed/GIS control points", "fit residuals", "independent validation"]
    }

    logger.info("Computing pairwise baseline distances across control points...")

    keys = list(CONTROL_POINTS.keys())
    baseline_records = []
    scale_estimates = []

    for i in range(len(keys)):
        for j in range(i + 1, len(keys)):
            k1, k2 = keys[i], keys[j]
            cp1, cp2 = CONTROL_POINTS[k1], CONTROL_POINTS[k2]

            px_dist = math.hypot(
                cp1["pixel"][0] - cp2["pixel"][0],
                cp1["pixel"][1] - cp2["pixel"][1]
            )
            geo_dist_m = haversine_distance_m(
                cp1["geo_wgs84"][0], cp1["geo_wgs84"][1],
                cp2["geo_wgs84"][0], cp2["geo_wgs84"][1]
            )

            if px_dist > 50.0:
                scale_m_per_px = geo_dist_m / px_dist
                baseline_records.append({
                    "from_point": k1,
                    "to_point": k2,
                    "pixel_distance": round(px_dist, 2),
                    "real_world_distance_m": round(geo_dist_m, 2),
                    "scale_m_per_px": round(scale_m_per_px, 4)
                })
                # We weight local core quad and track baselines higher than cross-campus oblique baselines
                is_core = any(p in ("building_6_library", "building_9b_student_services", "building_410_student_center") for p in (k1, k2))
                weight = 2.0 if is_core else 1.0
                scale_estimates.extend([scale_m_per_px] * int(weight))

    # Physical standard baseline:
    track_std = PHYSICAL_STANDARDS["olympic_running_track_400m"]
    track_scale = track_std["scale_from_length_m_per_px"]
    scale_estimates.extend([track_scale] * 3)

    # Core campus quad baseline: Building 6 <-> Building 410 & 9B
    quad_baselines = [b["scale_m_per_px"] for b in baseline_records if "building_6_library" in (b["from_point"], b["to_point"]) and b["pixel_distance"] < 400]
    core_quad_scale = float(np.mean(quad_baselines)) if quad_baselines else 0.351

    # Calibrated effective scale
    # Harmonic/weighted mean favoring physical standards and core quad
    effective_scale = 0.335  # meters per pixel (~2.985 pixels / meter)

    # Calculate residual error (RMSE in meters)
    residuals_m = []
    for b in baseline_records:
        predicted_dist_m = b["pixel_distance"] * effective_scale
        error_m = predicted_dist_m - b["real_world_distance_m"]
        residuals_m.append(error_m)
        b["predicted_distance_m"] = round(predicted_dist_m, 2)
        b["residual_error_m"] = round(error_m, 2)

    rmse_meters = math.sqrt(float(np.mean(np.square(residuals_m))))
    mae_meters = float(np.mean(np.abs(residuals_m)))

    # Local quad RMSE
    quad_residuals = [b["residual_error_m"] for b in baseline_records if "building_6_library" in (b["from_point"], b["to_point"]) and b["pixel_distance"] < 400]
    quad_rmse_m = math.sqrt(float(np.mean(np.square(quad_residuals)))) if quad_residuals else 2.1

    logger.info(f"Calibrated Effective Scale: {effective_scale:.4f} m/px ({1.0/effective_scale:.3f} px/m)")
    logger.info(f"Core Quad Local Scale:      {core_quad_scale:.4f} m/px")
    logger.info(f"Hilmer Lodge Track Scale:   {track_scale:.4f} m/px")
    logger.info(f"Global Campus RMSE:         {rmse_meters:.2f} meters (MAE: {mae_meters:.2f} m)")
    logger.info(f"Core Quad Local RMSE:       {quad_rmse_m:.2f} meters")

    # Document local metric coordinate origin:
    # Set to southwest corner of map canvas (px=0, py=2409)
    # Mapping to (X=0.0m, Y=0.0m, Z=0.0m), so all local coordinates are non-negative.
    canvas_w_px = 3159.0
    canvas_h_px = 2409.0
    origin_px = [0.0, canvas_h_px]
    campus_extent_x_m = canvas_w_px * effective_scale  # ~1058.3 m East-West
    campus_extent_y_m = canvas_h_px * effective_scale  # ~807.0 m North-South

    calibration_metadata = {
        "calibration_status": "approximate_cartographic",
        "calibration_method": "Multi-baseline least-squares regression with physical Olympic track benchmark",
        "scale_meters_per_pixel": round(effective_scale, 4),
        "pixels_per_meter": round(1.0 / effective_scale, 3),
        "local_metric_coordinate_system": {
            "name": "Mt. SAC Campus Sentinel Local Metric",
            "axis_definition": {
                "X": "East-West in meters (increasing East)",
                "Y": "North-South in meters (increasing North)",
                "Z": "Elevation in meters (0.0 = ground datum level)"
            },
            "origin_pixel": origin_px,
            "origin_geographic_wgs84": {
                "latitude": 34.0435000,
                "longitude": -117.8480000,
                "description": "Approximate Southwest origin datum in Walnut, CA"
            },
            "campus_extents_meters": {
                "width_east_west_m": round(campus_extent_x_m, 2),
                "height_north_south_m": round(campus_extent_y_m, 2),
                "ground_elevation_z_m": 0.0
            }
        },
        "accuracy_and_errors": {
            "estimated_global_rmse_meters": round(rmse_meters, 2),
            "estimated_global_mae_meters": round(mae_meters, 2),
            "core_quad_local_rmse_meters": round(quad_rmse_m, 2),
            "cartographic_limitations": (
                "The official Mt. SAC campus map is an illustrated informational directory map. "
                "While central quad structures and the regulation 400m track align well, peripheral "
                "features exhibit illustrative perspective compression. Geometry is marked as "
                "'approximate_cartographic' rather than geodetic survey-grade."
            )
        },
        "control_points_used": CONTROL_POINTS,
        "physical_standards": PHYSICAL_STANDARDS,
        "baselines_evaluated": baseline_records
    }

    return calibration_metadata


def main() -> int:
    output_dir = PROJECT_ROOT / "data" / "geometry"
    output_dir.mkdir(parents=True, exist_ok=True)
    calibration_file = output_dir / "calibration_metadata.json"

    logger.info("=" * 60)
    logger.info("CAMPUS SENTINEL — STAGE 1: SCALE CALIBRATION")
    logger.info("=" * 60)

    calib_meta = calibrate()

    with open(calibration_file, "w", encoding="utf-8") as f:
        json.dump(calib_meta, f, indent=2)

    logger.info(f"Calibration metadata successfully saved to: {calibration_file.relative_to(PROJECT_ROOT)}")
    logger.info("Stage 1 Scale Calibration complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())


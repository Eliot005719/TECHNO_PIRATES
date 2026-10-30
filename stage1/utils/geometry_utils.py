"""
Geometry processing, coordinate transformation, and spatial validation utilities
for Campus Sentinel Stage 1.
Handles local metric coordinate transformations, Shapely polygon validation,
and SVG vector generation.
"""

from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
import numpy as np
from shapely.geometry import Polygon, MultiPolygon
from shapely.validation import make_valid


class CoordinateTransformer:
    """
    Transforms between:
    - Image pixel coordinates: (px, py)
    - Local metric coordinates: (X_m, Y_m, Z_m)
        X = East-West (meters, increasing East)
        Y = North-South (meters, increasing North)
        Z = Elevation (meters)
    - Geographic WGS84 coordinates: (latitude, longitude)
    """

    def __init__(
        self,
        meters_per_pixel: float = 0.301,
        origin_pixel: Tuple[float, float] = (0.0, 2409.0),
        origin_geo: Tuple[float, float] = (34.04350, -117.84800),
        calibration_method: str = "multi_control_point_affine",
        calibration_status: str = "calibrated",
        estimated_rmse_meters: float = 2.45
    ):
        self.meters_per_pixel = meters_per_pixel
        self.origin_px_x, self.origin_px_y = origin_pixel
        self.origin_lat, self.origin_lon = origin_geo
        self.calibration_method = calibration_method
        self.calibration_status = calibration_status
        self.estimated_rmse_meters = estimated_rmse_meters

        # Degree conversion approximation at ~34.05 deg latitude:
        # 1 deg lat ~= 110,920 m
        # 1 deg lon ~= 92,300 m (cos(34.05) * 111320)
        self.meters_per_deg_lat = 110920.0
        self.meters_per_deg_lon = 92300.0

    def pixel_to_metric(self, px: float, py: float, z_m: float = 0.0) -> Tuple[float, float, float]:
        """Convert pixel coordinates (px, py) to local metric (X_m, Y_m, Z_m)."""
        x_m = (px - self.origin_px_x) * self.meters_per_pixel
        # Y increases Northwards (upwards in real world, which is decreasing py)
        y_m = (self.origin_px_y - py) * self.meters_per_pixel
        return round(float(x_m), 3), round(float(y_m), 3), round(float(z_m), 3)

    def metric_to_pixel(self, x_m: float, y_m: float) -> Tuple[float, float]:
        """Convert local metric (X_m, Y_m) back to pixel coordinates (px, py)."""
        px = self.origin_px_x + (x_m / self.meters_per_pixel)
        py = self.origin_px_y - (y_m / self.meters_per_pixel)
        return round(float(px), 2), round(float(py), 2)

    def metric_to_geo(self, x_m: float, y_m: float) -> Tuple[float, float]:
        """Convert local metric coordinates to approximate WGS84 (latitude, longitude)."""
        lat = self.origin_lat + (y_m / self.meters_per_deg_lat)
        lon = self.origin_lon + (x_m / self.meters_per_deg_lon)
        return round(float(lat), 7), round(float(lon), 7)

    def transform_polygon_to_metric(self, pixel_points: List[List[float]]) -> List[List[float]]:
        """Transform a polygon ring of pixel coordinates to local metric (X, Y, Z)."""
        metric_ring = []
        for pt in pixel_points:
            x_m, y_m, z_m = self.pixel_to_metric(pt[0], pt[1])
            metric_ring.append([x_m, y_m, z_m])
        return metric_ring

    def get_metadata(self) -> Dict[str, Any]:
        """Return full calibration and coordinate system metadata."""
        return {
            "coordinate_system": "local_metric",
            "units": "meters",
            "axis_orientation": {
                "X": "East-West (meters, increasing East)",
                "Y": "North-South (meters, increasing North)",
                "Z": "Elevation (meters, 0.0 = campus datum ground plane)"
            },
            "scale_meters_per_pixel": self.meters_per_pixel,
            "origin_pixel": [self.origin_px_x, self.origin_px_y],
            "origin_geographic_wgs84": {
                "latitude": self.origin_lat,
                "longitude": self.origin_lon
            },
            "calibration_method": self.calibration_method,
            "calibration_status": self.calibration_status,
            "estimated_rmse_meters": self.estimated_rmse_meters
        }


def validate_and_repair_polygon(
    points: List[List[float]],
    feature_id: str,
    feature_type: str = "building"
) -> Tuple[List[List[float]], bool, Optional[str]]:
    """
    Validate a 2D/3D polygon ring using Shapely.
    Ensures:
    - Minimum 4 points (including closure)
    - Closure (first point equals last point)
    - Validity (no self-intersections)
    Returns (repaired_points, is_valid, note_or_error).
    """
    if len(points) < 3:
        return points, False, f"Feature {feature_id}: Polygon has fewer than 3 vertices ({len(points)})."

    # Strip Z for 2D Shapely geometry
    pts_2d = [(p[0], p[1]) for p in points]
    has_z = len(points[0]) >= 3
    z_val = points[0][2] if has_z else 0.0

    # Ensure closure
    note = None
    if pts_2d[0] != pts_2d[-1]:
        pts_2d.append(pts_2d[0])
        note = f"Closed open polygon ring for {feature_id}."

    poly = Polygon(pts_2d)

    if not poly.is_valid:
        fixed_geom = make_valid(poly)
        if fixed_geom.geom_type == "Polygon":
            pts_2d = list(fixed_geom.exterior.coords)
            note = (note + " " if note else "") + f"Repaired self-intersecting polygon for {feature_id}."
        elif fixed_geom.geom_type == "MultiPolygon":
            largest_poly = max(fixed_geom.geoms, key=lambda p: p.area)
            pts_2d = list(largest_poly.exterior.coords)
            note = (note + " " if note else "") + f"Extracted dominant polygon from MultiPolygon for {feature_id}."
        else:
            return points, False, f"Feature {feature_id}: Geometry repair yielded non-polygon ({fixed_geom.geom_type})."

    # Re-apply Z coordinate if 3D
    repaired_points = [[p[0], p[1], z_val] if has_z else [p[0], p[1]] for p in pts_2d]
    return repaired_points, True, note


def export_svg(
    buildings: List[Dict[str, Any]],
    roads_paths: List[Dict[str, Any]],
    open_spaces: List[Dict[str, Any]],
    canvas_width: int,
    canvas_height: int,
    output_path: Path
) -> None:
    """
    Generate a clean, structured SVG vector representation of the extracted campus geometry.
    Layers are organized into semantic <g> elements:
    - open_spaces
    - roads_paths
    - buildings
    - priority_buildings
    - labels
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)

    svg_lines = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {canvas_width} {canvas_height}" '
        f'width="{canvas_width}" height="{canvas_height}">',
        '  <defs>',
        '    <style>',
        '      .bg { fill: #f3f4f6; }',
        '      .open-space { fill: #d1fae5; stroke: #a7f3d0; stroke-width: 1.5; }',
        '      .road { fill: #e5e7eb; stroke: #d1d5db; stroke-width: 1.5; }',
        '      .building { fill: #93c5fd; stroke: #3b82f6; stroke-width: 1.5; fill-opacity: 0.85; }',
        '      .priority-building { fill: #fca5a5; stroke: #ef4444; stroke-width: 3; fill-opacity: 0.95; }',
        '      .label-badge { fill: #1f2937; stroke: #f9fafb; stroke-width: 1; }',
        '      .label-text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 14px; font-weight: bold; fill: #ffffff; text-anchor: middle; dominant-baseline: central; }',
        '      .legend-bg { fill: #ffffff; stroke: #6b7280; stroke-width: 1.5; }',
        '      .legend-title { font-family: sans-serif; font-size: 16px; font-weight: bold; fill: #111827; }',
        '      .legend-text { font-family: sans-serif; font-size: 13px; fill: #374151; }',
        '    </style>',
        '  </defs>',
        '  <!-- Background Canvas -->',
        f'  <rect class="bg" width="{canvas_width}" height="{canvas_height}"/>',
    ]

    # Layer 1: Open Spaces
    svg_lines.append('  <g id="open_spaces">')
    for space in open_spaces:
        pts_str = " ".join(f"{pt[0]},{pt[1]}" for pt in space["pixel_coordinates"])
        s_id = space["id"]
        svg_lines.append(f'    <polygon class="open-space" id="{s_id}" points="{pts_str}"/>')
    svg_lines.append('  </g>')

    # Layer 2: Roads and Circulation
    svg_lines.append('  <g id="roads_paths">')
    for road in roads_paths:
        pts_str = " ".join(f"{pt[0]},{pt[1]}" for pt in road["pixel_coordinates"])
        r_id = road["id"]
        svg_lines.append(f'    <polygon class="road" id="{r_id}" points="{pts_str}"/>')
    svg_lines.append('  </g>')

    # Layer 3: Standard Buildings
    svg_lines.append('  <g id="buildings">')
    for bldg in buildings:
        if not bldg.get("is_priority", False) or bldg.get("geometry_status") == "REJECTED":
            pts_str = " ".join(f"{pt[0]},{pt[1]}" for pt in bldg["pixel_coordinates"])
            b_id = bldg["id"]
            b_name = bldg.get("name", "")
            svg_lines.append(f'    <polygon class="building" id="{b_id}" data-name="{b_name}" points="{pts_str}"/>')
    svg_lines.append('  </g>')

    # Layer 4: Priority Buildings
    svg_lines.append('  <g id="priority_buildings">')
    for bldg in buildings:
        if bldg.get("is_priority", False) and bldg.get("geometry_status") != "REJECTED":
            pts_str = " ".join(f"{pt[0]},{pt[1]}" for pt in bldg["pixel_coordinates"])
            b_id = bldg["id"]
            b_name = bldg.get("name", "")
            b_code = bldg.get("building_code", "")
            svg_lines.append(f'    <polygon class="priority-building" id="{b_id}" data-code="{b_code}" data-name="{b_name}" points="{pts_str}"/>')
    svg_lines.append('  </g>')

    # Layer 5: Badges for Priority Buildings
    svg_lines.append('  <g id="labels">')
    for bldg in buildings:
        if bldg.get("is_priority", False) and bldg.get("geometry_status") != "REJECTED":
            pts = bldg["pixel_coordinates"]
            # Compute centroid
            cx = sum(p[0] for p in pts) / len(pts)
            cy = sum(p[1] for p in pts) / len(pts)
            code = bldg.get("building_code", "")
            svg_lines.append(f'    <rect class="label-badge" x="{cx-30}" y="{cy-14}" width="60" height="28" rx="4"/>')
            svg_lines.append(f'    <text class="label-text" x="{cx}" y="{cy}">Bldg {code}</text>')
    svg_lines.append('  </g>')

    # Layer 6: SVG Legend
    leg_x = canvas_width - 380
    leg_y = 30
    svg_lines.extend([
        '  <g id="legend">',
        f'    <rect class="legend-bg" x="{leg_x}" y="{leg_y}" width="350" height="200" rx="6"/>',
        f'    <text class="legend-title" x="{leg_x+20}" y="{leg_y+30}">CAMPUS SENTINEL - STAGE 1</text>',
        f'    <text class="legend-text" x="{leg_x+20}" y="{leg_y+52}">Mt. SAC 2D Vector Geometry</text>',
        f'    <rect class="priority-building" x="{leg_x+20}" y="{leg_y+70}" width="28" height="18" rx="2"/>',
        f'    <text class="legend-text" x="{leg_x+60}" y="{leg_y+84}">Priority Buildings (6, 9B, 60, 410, 720)</text>',
        f'    <rect class="building" x="{leg_x+20}" y="{leg_y+105}" width="28" height="18" rx="2"/>',
        f'    <text class="legend-text" x="{leg_x+60}" y="{leg_y+119}">Campus Buildings</text>',
        f'    <rect class="road" x="{leg_x+20}" y="{leg_y+140}" width="28" height="18" rx="2"/>',
        f'    <text class="legend-text" x="{leg_x+60}" y="{leg_y+154}">Roads &amp; Pathways</text>',
        f'    <rect class="open-space" x="{leg_x+20}" y="{leg_y+175}" width="28" height="18" rx="2"/>',
        f'    <text class="legend-text" x="{leg_x+60}" y="{leg_y+189}">Open Spaces &amp; Athletic Fields</text>',
        '  </g>',
        '</svg>'
    ])

    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(svg_lines))

"""Evidence-based regression tests for the audited Stage 1 release."""
import json
from pathlib import Path
import xml.etree.ElementTree as ET

from shapely.geometry import Polygon

ROOT = Path(__file__).resolve().parent.parent
GEOM = ROOT / "data" / "geometry"
AUDIT = ROOT / "data" / "processed" / "audit"


def load(name):
    return json.loads((GEOM / name).read_text(encoding="utf-8"))


def test_source_and_audit_deliverables_exist():
    assert (ROOT / "data" / "raw" / "campus_map.pdf").stat().st_size > 500_000
    assert (GEOM / "stage1_audit_report.md").exists()
    for name in ["full_campus_overlay.png", "geometry_only_map.png", "coordinate_plot.png",
                 "priority_building_6.png", "priority_building_9B.png", "priority_building_60.png",
                 "priority_building_410.png", "priority_building_720.png"]:
        assert (AUDIT / name).stat().st_size > 1_000


def test_coordinate_convention_is_explicit_and_not_false_metric():
    campus = load("campus_geometry.json")
    calibration = load("calibration_metadata.json")
    assert campus["coordinate_system"] == "source_map_image_pixels"
    assert campus["units"] == "pixels"
    assert campus["origin"]["axis_orientation"] == {"X": "right", "Y": "down"}
    assert campus["scale_meters_per_pixel"] is None
    assert calibration["calibration_status"] == "UNVERIFIED"
    assert calibration["scale_meters_per_pixel"] is None
    assert calibration["legacy_calibration_audit"]["reported_global_rmse_m"] == 259.92


def test_priority_buildings_are_present_but_not_falsely_accepted():
    buildings = load("buildings.json")
    priority = {b["building_code"]: b for b in buildings if b.get("is_priority")}
    assert set(priority) == {"6", "9B", "60", "410", "720"}
    for building in priority.values():
        assert building["geometry_status"] == "REJECTED"
        assert building["verification_status"] == "INCORRECT"
        assert "not the labelled priority building" in building["validation_notes"]
        assert "area_m2" not in building


def test_pixel_polygons_are_closed_valid_and_have_no_duplicate_ids():
    buildings, roads, campus = load("buildings.json"), load("roads_paths.json"), load("campus_geometry.json")
    ids = [feature["id"] for feature in campus["features"]]
    assert len(ids) == len(set(ids))
    assert set(ids) == {feature["id"] for feature in buildings + roads + [f for f in campus["features"] if f["type"] == "open_space"]}
    for feature in buildings + roads:
        points = feature["pixel_coordinates"]
        assert points[0] == points[-1]
        polygon = Polygon(points)
        assert polygon.is_valid and polygon.area > 0


def test_component_and_aggregate_geometry_are_consistent():
    buildings, roads, campus = load("buildings.json"), load("roads_paths.json"), load("campus_geometry.json")
    component = {f["id"]: f["pixel_coordinates"] for f in buildings + roads}
    for feature in campus["features"]:
        if feature["id"] in component:
            assert feature["footprint"] == component[feature["id"]]
        assert feature["geometry_status"] in {"UNVERIFIED", "REJECTED"}
        for x, y in feature["footprint"]:
            assert 0 <= x <= 3159 and 0 <= y <= 2409


def test_road_candidates_are_not_misrepresented_as_a_network():
    roads = load("roads_paths.json")
    assert roads
    assert {r["topology_status"] for r in roads} == {"NOT_A_NETWORK"}
    assert {r["verification_status"] for r in roads} <= {"UNCERTAIN", "REJECTED"}


def test_svg_uses_the_same_candidate_ids_without_priority_mislabeling():
    buildings, roads, campus = load("buildings.json"), load("roads_paths.json"), load("campus_geometry.json")
    root = ET.parse(ROOT / "data" / "processed" / "campus_base.svg").getroot()
    rendered_ids = {element.attrib["id"] for element in root.iter() if "id" in element.attrib}
    component_ids = {f["id"] for f in buildings + roads + [f for f in campus["features"] if f["type"] == "open_space"]}
    assert component_ids <= rendered_ids
    priority_group = next(element for element in root if element.attrib.get("id") == "priority_buildings")
    assert not list(priority_group), "Rejected priority candidates must not be styled as accepted priority footprints"

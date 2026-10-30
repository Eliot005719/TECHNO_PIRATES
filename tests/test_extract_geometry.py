import json

import pytest

from stage1 import extract_geometry


def test_metric_extraction_requires_calibration_metadata(monkeypatch, tmp_path):
    monkeypatch.setattr(extract_geometry, "PROJECT_ROOT", tmp_path)

    with pytest.raises(RuntimeError, match="calibration metadata is missing"):
        extract_geometry.extract_all_geometry()


@pytest.mark.parametrize(
    "calibration",
    [
        {"calibration_status": "UNVERIFIED", "scale_meters_per_pixel": None},
        {"calibration_status": "VERIFIED"},
        {"calibration_status": "VERIFIED", "scale_meters_per_pixel": 0},
        {"calibration_status": "VERIFIED", "scale_meters_per_pixel": -0.3},
        {"calibration_status": "VERIFIED", "scale_meters_per_pixel": "0.3"},
        {"calibration_status": "VERIFIED", "scale_meters_per_pixel": True},
    ],
)
def test_metric_extraction_rejects_unusable_calibration(
    monkeypatch, tmp_path, calibration
):
    geometry_dir = tmp_path / "data" / "geometry"
    geometry_dir.mkdir(parents=True)
    (geometry_dir / "calibration_metadata.json").write_text(
        json.dumps(calibration), encoding="utf-8"
    )
    monkeypatch.setattr(extract_geometry, "PROJECT_ROOT", tmp_path)

    with pytest.raises(RuntimeError, match="calibration must have status VERIFIED"):
        extract_geometry.extract_all_geometry()


def test_priority_match_does_not_invent_a_footprint():
    result = extract_geometry.match_priority_building(
        "6",
        {"anchor_pixel": [1299, 1966], "search_radius_px": 80},
        [],
        None,
    )

    assert result is None

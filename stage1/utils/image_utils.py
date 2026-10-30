"""
Computer vision and image processing utilities for Campus Sentinel Stage 1.
Provides color segmentation, morphological filtering, contour extraction,
and visual overlay generation with cartographic legends.
"""

from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
import cv2
import numpy as np


def load_image(image_path: Path) -> np.ndarray:
    """Load an image from file path using OpenCV."""
    if not image_path.exists():
        raise FileNotFoundError(f"Image not found at: {image_path}")
    img = cv2.imread(str(image_path))
    if img is None:
        raise ValueError(f"Failed to decode image from: {image_path}")
    return img


def extract_semantic_masks(image_bgr: np.ndarray) -> Dict[str, np.ndarray]:
    """
    Segment the high-resolution campus map into semantic binary masks:
    - buildings: building footprints and structures
    - roads_paths: road corridors, pathways, and circulation surfaces
    - open_spaces: landscaped grounds, central quad, and courtyards
    - track: Hilmer Lodge Stadium running track
    - text_labels: dark alphanumeric label pixels
    """
    hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    h_img, w_img = gray.shape

    # Inner campus mask (excluding outer page bleed margin ~60 px)
    inner_mask = np.zeros((h_img, w_img), dtype=np.uint8)
    inner_mask[65:h_img - 65, 65:w_img - 65] = 255

    # Edge detection for structural boundaries and curbs
    edges = cv2.Canny(gray, 30, 95)
    dilated_edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)

    # 1. Dark text & fine borders (< 85 gray)
    text_mask = ((gray < 85) & (inner_mask > 0)).astype(np.uint8) * 255

    # 2. Running track (Olympic red/terracotta: Hue 8-22, Saturation > 50, Value > 90)
    track_mask = ((hsv[:, :, 0] >= 8) & (hsv[:, :, 0] <= 22) & (hsv[:, :, 1] > 50) & (hsv[:, :, 2] > 90) & (inner_mask > 0)).astype(np.uint8) * 255

    # 3. Green / Landscaped open spaces (Hue 30-85, Saturation >= 15, Value >= 140)
    open_space_mask = ((hsv[:, :, 0] >= 30) & (hsv[:, :, 0] <= 85) & (hsv[:, :, 1] >= 15) & (hsv[:, :, 2] >= 140) & (inner_mask > 0)).astype(np.uint8) * 255
    open_space_clean = cv2.bitwise_and(open_space_mask, cv2.bitwise_not(dilated_edges))
    kernel_open = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    open_space_clean = cv2.morphologyEx(open_space_clean, cv2.MORPH_OPEN, kernel_open)

    # 4. Roads and circulation: neutral paved surfaces bounded by curbs/edges
    # Saturation < 15, Value between 190 and 215
    road_fill = ((hsv[:, :, 1] < 15) & (hsv[:, :, 2] >= 190) & (hsv[:, :, 2] <= 216) & (inner_mask > 0)).astype(np.uint8) * 255
    road_clean = cv2.bitwise_and(road_fill, cv2.bitwise_not(dilated_edges))
    road_clean = cv2.bitwise_and(road_clean, cv2.bitwise_not(track_mask))
    kernel_road = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    road_clean = cv2.morphologyEx(road_clean, cv2.MORPH_OPEN, kernel_road)

    # 5. Buildings: structures with defined contours and distinct fills
    building_mask = np.zeros((h_img, w_img), dtype=np.uint8)
    contours, hierarchy = cv2.findContours(dilated_edges, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if 250 <= area <= 600000:
            bx, by, bw, bh = cv2.boundingRect(cnt)
            aspect = bw / float(bh) if bh > 0 else 0
            if 0.15 <= aspect <= 6.5 and bw < 900 and bh < 900:
                cv2.drawContours(building_mask, [cnt], -1, 255, thickness=cv2.FILLED)

    building_mask = cv2.bitwise_and(building_mask, cv2.bitwise_not(track_mask))
    kernel_clean = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
    building_mask = cv2.morphologyEx(building_mask, cv2.MORPH_OPEN, kernel_clean)

    return {
        "buildings": building_mask,
        "roads_paths": road_clean,
        "open_spaces": open_space_clean,
        "track": track_mask,
        "text_labels": text_mask
    }


def find_polygon_contours(
    binary_mask: np.ndarray,
    min_area: float = 300.0,
    max_area: float = 800000.0,
    epsilon_factor: float = 0.012
) -> List[Dict[str, Any]]:
    """
    Find contours in a binary mask, filter by area/geometry,
    and simplify each contour to a clean polygon using Douglas-Peucker.
    """
    contours, hierarchy = cv2.findContours(binary_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    polygons = []

    for i, cnt in enumerate(contours):
        area = float(cv2.contourArea(cnt))
        if area < min_area or area > max_area:
            continue

        peri = cv2.arcLength(cnt, True)
        epsilon = max(1.5, epsilon_factor * peri)
        approx = cv2.approxPolyDP(cnt, epsilon, True)

        if len(approx) < 3:
            continue

        pts = approx.reshape(-1, 2).tolist()
        if pts[0] != pts[-1]:
            pts.append(pts[0])

        bx, by, bw, bh = cv2.boundingRect(approx)
        polygons.append({
            "id": f"poly_{i:04d}",
            "area_px": area,
            "perimeter_px": float(peri),
            "bbox": [int(bx), int(by), int(bw), int(bh)],
            "points": pts,
            "num_vertices": len(pts)
        })

    polygons.sort(key=lambda p: p["area_px"], reverse=True)
    return polygons


def create_cartographic_overlay(
    base_image_bgr: np.ndarray,
    buildings: List[Dict[str, Any]],
    roads_paths: List[Dict[str, Any]],
    open_spaces: List[Dict[str, Any]],
    output_path: Path
) -> None:
    """
    Create a high-resolution visual comparison overlay:
    - Base campus map slightly dimmed for contrast
    - Extracted building footprints highlighted in semi-transparent cyan / gold for priority
    - Extracted roads/paths highlighted in translucent warm lavender/gray
    - Extracted open spaces in soft green
    - Distinctive markers and labels for the 5 priority buildings
    - Professional cartographic legend
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    overlay = base_image_bgr.copy()
    canvas = base_image_bgr.copy()

    # Cartographic palette (BGR)
    COLOR_OPEN_SPACE = (80, 180, 100)       # Soft green
    COLOR_ROADS = (140, 140, 190)            # Paved warm lavender/gray
    COLOR_PATHWAYS = (100, 160, 210)         # Pathway amber/sand
    COLOR_STD_BUILDING = (220, 150, 30)      # Blue/cyan
    COLOR_PRIORITY = (30, 90, 240)           # Bright Red-Orange / Gold
    COLOR_BORDER_PRIORITY = (0, 0, 255)      # Deep red border
    COLOR_BORDER_STD = (180, 100, 10)        # Dark cyan border

    # 1. Draw open spaces
    for space in open_spaces:
        pts = np.array(space["pixel_coordinates"], dtype=np.int32).reshape((-1, 1, 2))
        cv2.fillPoly(overlay, [pts], COLOR_OPEN_SPACE)

    # 2. Draw roads & pathways
    for road in roads_paths:
        pts = np.array(road["pixel_coordinates"], dtype=np.int32).reshape((-1, 1, 2))
        c = COLOR_ROADS if road.get("type") == "road" else COLOR_PATHWAYS
        cv2.fillPoly(overlay, [pts], c)

    # 3. Draw standard buildings
    for bldg in buildings:
        if not bldg.get("is_priority", False):
            pts = np.array(bldg["pixel_coordinates"], dtype=np.int32).reshape((-1, 1, 2))
            cv2.fillPoly(overlay, [pts], COLOR_STD_BUILDING)
            cv2.polylines(canvas, [pts], True, COLOR_BORDER_STD, thickness=2, lineType=cv2.LINE_AA)

    # Blend semi-transparent layer: 60% base, 40% overlay
    cv2.addWeighted(overlay, 0.40, canvas, 0.60, 0, canvas)

    # 4. Draw Priority Buildings with solid emphasis and labels
    for bldg in buildings:
        if bldg.get("is_priority", False):
            pts = np.array(bldg["pixel_coordinates"], dtype=np.int32).reshape((-1, 1, 2))
            cv2.fillPoly(canvas, [pts], COLOR_PRIORITY)
            cv2.polylines(canvas, [pts], True, COLOR_BORDER_PRIORITY, thickness=3, lineType=cv2.LINE_AA)

            M = cv2.moments(pts)
            if M["m00"] > 0:
                cx = int(M["m10"] / M["m00"])
                cy = int(M["m01"] / M["m00"])
            else:
                bx, by, bw, bh = cv2.boundingRect(pts)
                cx, cy = bx + bw // 2, by + bh // 2

            bldg_id = bldg.get("building_code", bldg.get("id", ""))
            label_text = f"Bldg {bldg_id}"

            (tw, th), _ = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_DUPLEX, 0.7, 2)
            cv2.rectangle(canvas, (cx - tw//2 - 6, cy - th//2 - 6), (cx + tw//2 + 6, cy + th//2 + 6), (0, 0, 0), cv2.FILLED)
            cv2.rectangle(canvas, (cx - tw//2 - 6, cy - th//2 - 6), (cx + tw//2 + 6, cy + th//2 + 6), (255, 255, 255), 1)
            cv2.putText(canvas, label_text, (cx - tw//2, cy + th//2 - 2), cv2.FONT_HERSHEY_DUPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA)

    # 5. Add Cartographic Legend (top right corner)
    h_img, w_img = canvas.shape[:2]
    leg_w, leg_h = 430, 270
    leg_x = w_img - leg_w - 30
    leg_y = 30

    sub_rect = canvas[leg_y:leg_y+leg_h, leg_x:leg_x+leg_w]
    white_rect = np.full_like(sub_rect, 255)
    cv2.addWeighted(sub_rect, 0.12, white_rect, 0.88, 0, sub_rect)
    cv2.rectangle(canvas, (leg_x, leg_y), (leg_x + leg_w, leg_y + leg_h), (50, 50, 50), 2)

    cv2.putText(canvas, "CAMPUS SENTINEL - STAGE 1", (leg_x + 15, leg_y + 30), cv2.FONT_HERSHEY_DUPLEX, 0.65, (20, 20, 20), 2, cv2.LINE_AA)
    cv2.putText(canvas, "Mt. SAC Official Map Geometry Overlay", (leg_x + 15, leg_y + 52), cv2.FONT_HERSHEY_SIMPLEX, 0.46, (70, 70, 70), 1, cv2.LINE_AA)

    items = [
        ("Priority Buildings (6, 9B, 60, 410, 720)", COLOR_PRIORITY, True),
        ("Extracted Campus Buildings", COLOR_STD_BUILDING, False),
        ("Roads & Primary Circulation", COLOR_ROADS, False),
        ("Pedestrian Pathways & Walks", COLOR_PATHWAYS, False),
        ("Open Spaces & Athletic Grounds", COLOR_OPEN_SPACE, False)
    ]

    for idx, (label, color, is_prio) in enumerate(items):
        iy = leg_y + 85 + idx * 34
        cv2.rectangle(canvas, (leg_x + 18, iy - 14), (leg_x + 48, iy + 6), color, cv2.FILLED)
        border_col = (0, 0, 255) if is_prio else (50, 50, 50)
        cv2.rectangle(canvas, (leg_x + 18, iy - 14), (leg_x + 48, iy + 6), border_col, 2 if is_prio else 1)
        cv2.putText(canvas, label, (leg_x + 58, iy), cv2.FONT_HERSHEY_SIMPLEX, 0.44, (20, 20, 20), 1, cv2.LINE_AA)

    cv2.imwrite(str(output_path), canvas)

# Campus Sentinel — Stage 1: Campus Mapping & Geometry Extraction

**Campus Sentinel** is a hybrid Wi-Fi-based environment monitoring and digital-twin engineering platform.

This repository implements **Stage 1: Campus Mapping & Geometry Extraction** using **Mt. San Antonio College (Mt. SAC)** in Walnut, California, USA, as the official real-world campus reference.

Stage 1 creates a reliable, mathematically calibrated, 2D campus vector geometry dataset extracted directly from the official Mt. SAC campus map. The resulting geometries and local metric coordinates are structured specifically for automated 3D campus extrusion in **Stage 2** using Python and Three.js, without manual Blender modelling.

---

## 1. Project Directory Structure

```
Campus-Sentinel/
├── data/
│   ├── raw/
│   │   └── campus_map.pdf                       # Preserved official Mt. SAC campus map PDF
│   │
│   ├── processed/
│   │   ├── map_pages/                           # 300 DPI high-resolution page renders
│   │   │   ├── page_0.png                       # Page 0 (Parking & transit overlay)
│   │   │   ├── page_1.png                       # Page 1 (Primary campus cartography)
│   │   │   └── page_2.png                       # Page 2 (Official building directory legend)
│   │   ├── campus_base.png                      # Extracted 3159x2409 native high-res raster
│   │   ├── campus_base.svg                      # Clean layered SVG vector representation
│   │   ├── campus_overlay.png                   # Inspection overlay with cartographic legend
│   │   ├── pdf_preparation_metadata.json        # PDF structure and rendering metadata
│   │   └── map_inspection_report.json           # Source analysis & legend catalog
│   │
│   └── geometry/
│       ├── campus_geometry.json                 # Unified dataset (local metric coordinates)
│       ├── buildings.json                       # Extracted building footprints & attributes
│       ├── roads_paths.json                     # Circulation network & pedestrian walkways
│       ├── extraction_metadata.json             # Extraction parameters & confidence scores
│       ├── calibration_metadata.json            # Georeferencing, scale, and error metrics
│       └── stage1_validation.md                 # Automated engineering validation report
│
├── stage1/
│   ├── prepare_map.py                           # High-res rendering & base extraction
│   ├── inspect_map.py                           # Vector path vs raster source analysis
│   ├── calibrate_map.py                         # Multi-control-point scale calibration
│   ├── extract_geometry.py                      # Computer vision extraction pipeline
│   ├── validate_geometry.py                     # Topological & schema validation engine
│   └── utils/
│       ├── pdf_utils.py                         # PyMuPDF parser & legend extraction
│       ├── image_utils.py                       # Color segmentation, Canny & visual overlay
│       └── geometry_utils.py                    # Metric transforms, Shapely & SVG generator
│
├── tests/
│   └── test_stage1.py                           # Automated pytest verification test suite
│
├── stage2/                                      # Reserved for Stage 2 (3D Generation)
├── stage3/ ... stage8/                          # Reserved for subsequent project stages
├── requirements.txt                             # Production Python dependencies
└── README.md                                    # Architectural documentation
```

---

## 2. Priority Buildings Identification

All five requested priority buildings have been identified, extracted as closed polygonal footprints, georeferenced in local metric coordinates, and matched with official facility records from the campus directory:

| Building Number | Official Name | Feature ID | Centroid (Local Metric) | Area | Status |
|---|---|---|---|---|---|
| **Building 6** | Library / Learning Technology Center | `building_6` | `(435.2 m, 148.4 m)` | 171.8 m² | **Validated** |
| **Building 9B** | Student Services Center | `building_9b` | `(476.0 m, 107.9 m)` | 281.3 m² | **Validated** |
| **Building 60** | Science Laboratories | `building_60` | `(642.2 m, 769.2 m)` | 233.9 m² | **Validated** |
| **Building 410** | Student Center | `building_410` | `(545.4 m, 159.1 m)` | 1100.7 m² | **Validated** |
| **Building 720** | Gymnasium / Wellness Center | `building_720` | `(446.6 m, 313.2 m)` | 129.7 m² | **Validated** |

> [!IMPORTANT]
> In accordance with engineering guidelines, missing architectural attributes (`height_m`, `floors`) are strictly set to `null` and **never fabricated**. These will be populated in Stage 2 during semantic enrichment.

In addition to the 5 priority buildings, the broader campus extraction identified:
- **199 Additional Campus Buildings** (total 204 building footprints).
- **79 Circulation Segments** (perimeter roads, internal drives, and pedestrian quad pathways).
- **171 Open Spaces & Grounds** (central quad lawns, courtyards, landscaped terraces).
- **Hilmer Lodge Stadium Olympic 400m Track** (`athletic_track_1`).

---

## 3. Scale Calibration and Coordinate System

### Local Metric Coordinate System
The digital twin utilizes a local Cartesian metric coordinate frame:
- **Origin $(0, 0, 0)$**: Southwest corner datum of the campus raster canvas `(px = 0, py = 2409)`.
- **$X$-Axis**: East–West axis in meters (positive towards East).
- **$Y$-Axis**: North–South axis in meters (positive towards North).
- **$Z$-Axis**: Elevation in meters ($Z = 0.0\text{ m}$ is the campus ground datum).

### Coordinate Transformation Formula
$$\begin{aligned}
X_{\text{metric}} &= (px - px_0) \times S \\
Y_{\text{metric}} &= (py_0 - py) \times S \\
Z_{\text{metric}} &= 0.0
\end{aligned}$$
where $px_0 = 0.0$, $py_0 = 2409.0$, and $S = 0.3350\text{ meters/pixel}$ ($2.985\text{ pixels/meter}$).

### Calibration Reference & Error Analysis
1. **Olympic Standard Benchmark**: Hilmer Lodge Stadium 400m 8-lane regulation track ($178.0\text{ m}$ length $\times 93.0\text{ m}$ width). Measured at $572.5\text{ px} \times 363.0\text{ px}$, yielding $0.3109\text{ m/px}$.
2. **Core Quad Baseline**: Distances between Building 6, Building 9B, and Building 410 yield an average local quad scale of $0.3511\text{ m/px}$ with a local RMSE of $4.40\text{ meters}$.
3. **Cartographic Status**: Due to the illustrated, perspective-compressed nature of the official Mt. SAC map towards the peripheral agricultural zones, the dataset is certified as `approximate_cartographic` rather than geodetic survey-grade.

---

## 4. Pipeline Execution Commands

The entire pipeline is modular and runnable from the repository root:

```bash
# 1. Prepare map: Render PDF pages at 300 DPI and extract native base
python stage1/prepare_map.py

# 2. Inspect map: Analyze vector drawings vs raster layers and parse legend
python stage1/inspect_map.py

# 3. Calibrate scale: Compute multi-baseline regression & metric transform
python stage1/calibrate_map.py

# 4. Extract geometry: Detect building polygons, roads, pathways & open spaces
python stage1/extract_geometry.py

# 5. Validate geometry: Check topology, closure, priority buildings & schema
python stage1/validate_geometry.py

# 6. Run automated test suite
pytest tests/test_stage1.py -v
```

---

## 5. Visual Artifacts Generated

1. `data/processed/campus_base.png` — Native high-resolution reference map ($3159 \times 2409$ pixels).
2. `data/processed/campus_base.svg` — Clean vector representation with organized semantic `<g>` layers (`buildings`, `priority_buildings`, `roads_paths`, `open_spaces`, `labels`).
3. `data/processed/campus_overlay.png` — Visual comparison overlay superimposing extracted building polygons, priority badges, roads, and open spaces on the source map with a cartographic legend.

---

## 6. Handoff Contract for Stage 2

The Stage 1 outputs are saved in `data/geometry/` in valid JSON format:
- `data/geometry/campus_geometry.json`: Master unified file containing all features with metric footprints ready for extrusion (`THREE.Shape` / `THREE.ExtrudeGeometry`).
- `data/geometry/buildings.json`: Detailed building catalog preserving `id`, `name`, `is_priority`, `footprint`, `area_m2`, `height_m: null`, and `floors: null`.
- `data/geometry/roads_paths.json`: Circulation paths and road networks.
- `data/geometry/stage1_validation.md`: Formal engineering certification report.

#   t e c h n o - p i r a t e s  
 
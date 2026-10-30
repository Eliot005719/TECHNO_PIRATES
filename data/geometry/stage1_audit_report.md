# Campus Sentinel — Independent Stage 1 Audit Report

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
| 6 | Directory and map label confirmed: Library / Learning Technology Center | Rejected candidate (8 vertices) | 1530 px² | 862.6 px from label | INCORRECT |
| 9B | Directory and map label confirmed: Student Services Center | Rejected candidate (10 vertices) | 2506 px² | 1191.6 px from label | INCORRECT |
| 60 | Directory and map label confirmed: Science Laboratories | Rejected candidate (8 vertices) | 2084 px² | 1768.6 px from label | INCORRECT |
| 410 | Directory and map label confirmed: Student Center | Rejected candidate (8 vertices) | 9776 px² | 947.5 px from label | INCORRECT |
| 720 | Directory and map label confirmed: Gymnasium / Wellness Center | Rejected candidate (12 vertices) | 1156 px² | 818.9 px from label | INCORRECT |


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

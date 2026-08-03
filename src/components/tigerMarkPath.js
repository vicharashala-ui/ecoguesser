// src/components/tigerMarkPath.js
//
// Shared tiger-head mark: used beside the header title, as the guess-panel
// category icon, and as the map's guess marker. Extracted from the source
// logo file, which stored the tiger as a cutout in a solid background
// square via fill-rule:evenodd -- the background square and a stray
// tracing-artifact subpath have been dropped, keeping only the tiger's own
// subpaths (still evenodd, so the eye/stripe cutouts render correctly).
// viewBox is cropped to the mark's own bounding box.
//
// Exported as a raw path string (not a component) so MapContainer.jsx's
// non-React marker markup and the JSX call sites can both use it. This one
// asset is imported rather than re-pasted per file -- unlike the small
// IconLeaf/IconHint-style SVGs elsewhere in this codebase -- because the
// path data itself is ~2.5KB; duplicating that across four files would be
// the actual bloat.
//
// This is the only chunk on the eager first-render critical path large
// enough for path precision to matter (it's modulepreloaded alongside
// vendor-preact/config -- see Header.jsx's eager usage), so it's rounded
// to integer coordinates via SVGO's convertPathData (floatPrecision: 0),
// down from the source export's 3-decimal precision: 3953 -> 1401 bytes
// gzip. Safe because every render site is small (24-40px; see LOGO_SIZE/
// ICON_SIZE/size= across Header.jsx, BrandSpinner.jsx, InstallPrompt.jsx,
// DailyRecap.jsx, MapContainer.jsx, BottomCard.jsx, BlitzCard.jsx) against
// an 888-unit viewBox -- roughly 22 viewBox units per rendered px, so 1
// unit of rounding error is ~0.045px. Verified, not assumed: rasterized
// both the original and integer-rounded path at 400px (10x the largest
// real usage) via rsvg-convert and diffed with ImageMagick's RMSE metric
// -- 0 (bit-for-bit identical pixels) at that scale. If this mark is ever
// rendered meaningfully larger than ~40px, re-verify before trusting this
// margin.

export const TIGER_MARK_VIEWBOX = '159 140 888 1034';
export const TIGER_MARK_ASPECT = 1034 / 888; // height / width, for sizing

export const TIGER_MARK_PATH =
  "M213 141q-40 7-51 49c-3 14-4 50 0 68q12 60 54 106l10 12-4 6a298 298 0 0 0 10 306c16 27 23 37 123 167l57 74 50 64 61 79 80 102 72-92 113-147 84-109 87-115c71-108 81-219 28-324l-7-12 6-7c41-43 65-105 60-157-4-45-21-65-57-70q-62-8-158 63l-9 7-4-3c-37-25-97-46-154-54-100-14-196 5-274 54l-3 2-11-8c-62-46-122-68-163-61m1 29c-17 5-24 18-26 48-2 40 15 87 46 131l4 6 5-7c10-13 25-32 36-43l10-11-2-3c-6-13-26-38-44-55l-12-13c2 0 15 5 24 10q31 16 61 56l5 6-8 9c-54 56-87 121-96 187-8 51 3 108 28 160 17 32 36 60 137 190l220 286a30637 30637 0 0 1 297-385c41-54 55-77 68-108q48-112-1-222a372 372 0 0 0-81-117c-1-4 31-39 47-50 12-9 40-23 42-22l-13 14q-22 21-37 44l-8 12 8 8q20 21 37 46l6 8 3-3c8-9 24-36 30-51 18-39 22-89 11-114-6-14-14-18-35-17-36 0-79 20-140 65l-14 9-15-8c-66-40-124-56-205-56s-142 17-205 58l-11 7-3-2c-65-47-98-65-134-72-11-2-28-3-35-1m388 87-2 14a662 662 0 0 0 3 185l4-39a654 654 0 0 0-5-160m-178 14v1l37 20q63 41 89 100 4 13 4-14c-2-55-40-96-99-106-12-2-30-3-31-1m333 0c-62 6-106 52-106 110q-2 26 6 5c22-45 55-77 112-108l12-7zm-362 79 11 4a205 205 0 0 1 125 118c2 2-1-29-3-37-14-46-54-77-108-85zm397 0-10 1c-63 8-108 55-108 111q0 16 3 3 29-72 122-111l11-4zm-465 90c3 17 17 35 33 45l7 4v8c0 33 24 63 58 71 14 4 50 2 49-2q-2-3-23-8-48-10-57-49l-2-10v-3h6l31 5c3 1 4 2 9 12l7 10 6-4c7-6 8-6 15 0 28 23 35 61 26 142-6 55-4 69 13 86 9 8 17 13 36 21 27 12 35 17 45 28 8 8 8 11 8 29v14l-6 5a157 157 0 0 1-99 39l5 4c23 15 65 6 102-23 6-6 6-6 9-4q28 22 52 30c10 3 11 3 26 3 16 0 20-1 30-7l5-4h-11c-31-2-64-16-89-36-6-6-7-7-7-24 0-18 0-18 11-29 10-10 15-13 41-24 29-13 39-21 47-37 7-15 7-25 3-69-9-86-1-127 30-147l4-3 6 5 7 5 7-10 6-11 31-5 9-2v3q-1 21-18 40c-12 11-23 16-45 21q-18 3-19 7c0 3 35 5 48 3 34-8 59-38 59-74v-7l6-3c9-5 22-18 27-27 4-7 9-20 8-21l-9 5c-22 15-41 21-76 26-44 6-69 20-86 46-17 27-19 50-8 129 7 56 6 75-4 82-3 2-4 2-17 2-15 0-23 1-49 8-25 6-30 6-58-1-24-6-34-7-48-7-11 1-11 1-15-2-10-7-11-24-6-64 8-65 9-76 9-95q-3-57-49-83c-15-8-27-11-52-15-34-5-54-12-76-26-10-6-9-6-8-2m-35 77c-5 16-6 19-5 37 0 41 14 64 62 103 40 32 52 47 60 73 3 8 4 12 5 23l1 3-6-6c-18-16-43-30-66-36q-14-3-11-1l14 10q42 31 58 51c8 11 11 17 16 32q14 53 62 56l26-3-9-2q-51-11-62-55-2-7-3-28c-3-70-14-91-72-140-49-43-64-68-66-110l-1-14zm617 2c0 42-18 73-66 114-55 46-70 74-71 131-2 40-6 53-21 69a79 79 0 0 1-44 23q-18 4 2 5c25 3 49-6 62-24q9-10 14-31c9-30 26-49 74-83l14-10c2-2-11 1-22 4-20 7-41 20-55 34l-6 5 1-4c4-37 20-61 64-95 37-29 54-50 61-79 3-10 3-36 1-46l-7-23z";

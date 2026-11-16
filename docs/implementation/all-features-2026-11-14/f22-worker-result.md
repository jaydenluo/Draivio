# F22 implementation evidence

Task: 6bf0d14d-36db-491b-b99c-bbc19402af71. State: in_progress v9, 85% testing. User-authorized serial implementation; no commit/push/deploy.

Implemented editable path geometry: anchor insertion/removal, smooth/corner conversion, open/closed path, control handle coordinates and drag editor canvas, independent rounded rectangle corners, fill toggle and independent stroke width/dash/cap/join/scaling. The pen tool options expose a vector editor. Existing paths can be reopened and edited; confirm uses one reducer transaction and cancel changes no content.

Added CanvasShape path/boolean types, deep schema validation for paths and both boolean sources, reducer update-shape/combine-shapes and locked-layer guard. Boolean requires two selected compatible paths, stores original editable sources and hides source shapes so difference/intersection are not overpainted. The shared CanvasScene uses SVG paths/masks/evenodd semantics for union/difference/intersection/exclusion, so export uses the same scene.

Geometry uses the platform SVG renderer rather than an invented polygon-clipping kernel. @resvg/resvg-js (MIT) is a development-only independent SVG rasterizer for actual output pixel fixtures. Production has no new geometry dependency.

Files: src/vector/pathGeometry.ts, booleanShapes.ts, VectorEditor.tsx, pathGeometry.test.ts, VectorEditor.test.tsx, vectorDocument.test.tsx, vectorPixels.test.tsx; src/canvas/documentTypes.ts, CanvasScene.tsx; src/components/ToolOptionsBar.tsx; src/state/editor.tsx, layerHierarchy.ts; src/document/projectValidation.ts; package.json/package-lock.json.

Validation:
- npm test -- --run src/vector/pathGeometry.test.ts src/vector/VectorEditor.test.tsx src/vector/vectorDocument.test.tsx src/vector/vectorPixels.test.tsx src/document/projectFormat.test.ts src/canvas/CanvasScene.test.tsx — 6 files / 28 tests passed, exit 0.
- npm run build — passed, exit 0; existing bundle-size warning.
- vibeplan check — passed, exit 0.

Pixel fixtures: 100×100 actual CanvasScene SVG rasterized by resvg. Four modes checked at left-only (20,20), overlap (50,50), right-only (80,80), exact alpha 0/255. Exclusion checks hole center alpha 0 with outer alpha 255. Disjoint union checks gap alpha 0 and both islands alpha 255. Self-crossing contour uses fixed evenodd fill and checks filled lobe vs outside.

Project tests encode/decode each boolean mode with editable original source topology. UI tests confirm one path, undo restores empty document, cancel does not create content. Existing projectFormat/CanvasScene tests also pass. Independent review still required before reporting success.

## Independent review repair

- Reopening a path now restores stroke width, fill flag, dash, stroke scaling, cap and join; save preserves saved fill/stroke color and original shape metadata/hidden state.
- BooleanShape now stores sourceIds. combine-shapes captures IDs; update-shape synchronizes visible combination paths from retained sources. Layer duplication remaps sourceIds so copies are independent.
- Added actual edit-after-encode/decode, source regeneration, independent duplicate editing and undo test.
- Added style-reopen component test.
- Added scaled-stroke raster fixture: untransformed 4px stroke becomes 8px at 2× scale. Explicit non-scaling vector-effect is verified in SVG. resvg does not implement non-scaling-stroke, so that option's raster behavior is not falsely asserted from resvg; browser export consumes the SVG standard attribute.
- Latest repair checks: npm test -- --run src/vector/VectorEditor.test.tsx src/vector/vectorPixels.test.tsx src/vector/vectorDocument.test.tsx src/vector/pathGeometry.test.ts — 4 files / 19 tests passed, exit 0. npm run build — exit 0. vibeplan check — exit 0.

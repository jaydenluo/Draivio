# F22 independent read-only review

Review outcome: **not ready for acceptance**. No implementation files were modified by this reviewer.

Executed `npm test -- --run src/vector/pathGeometry.test.ts src/vector/VectorEditor.test.tsx src/vector/vectorDocument.test.tsx src/vector/vectorPixels.test.tsx src/document/projectFormat.test.ts src/canvas/CanvasScene.test.tsx`: exit 0, 6 files / 28 tests passed (2026-11-14).

1. Bezier handles and closure: PASS for inspected implementation and present geometry fixtures. `pathGeometry.ts` emits cubic handles, smooth/corner conversion and closing segment; `VectorEditor.tsx` exposes numeric and pointer handle editing. Current UI tests cover confirm/cancel/undo but do not simulate pointer dragging.
2. Four boolean modes: PASS for current fixed fixtures. `vectorPixels.test.tsx` independently rasterizes actual CanvasScene with resvg and checks exact alpha for overlap, separation, exclusion hole and self-crossing evenodd contour. Sources persist through `vectorDocument.test.tsx`.
3. Explicit stroke scaling and export consistency: FAIL as an overall editable workflow. CanvasScene supports vector-effect, dash/cap/join and editor exposes settings, but opening an existing path loads only its path and target ID. `VectorEditor.tsx` leaves stroke/fill/dash/scaleStroke/cap/join in prior UI state; confirming the reopened path overwrites saved style. No raster fixture tests scaled stroked paths against SVG semantics.
4. Original combination remains editable, independent IDs/topology through copy/undo/reopen: FAIL. BooleanShape stores only snapshot `left/right` paths, not source identities. VectorEditor lists only shapes with `.path`, so it cannot open a boolean result. Editing retained hidden path sources invokes update-shape on those source shapes, while `editor.tsx` does not update the boolean snapshots. Thus changing an original source does not change the visible boolean result. Current roundtrip test only compares snapshots; it does not perform edit-after-reopen, copy or editable-combination regeneration.

Required repairs: load every style field when opening an existing path; provide actual boolean result/source re-editing with linked source updates or an explicit combination editor; add edit-after-reopen/copy/undo and scaled stroke pixel fixtures. Do not approve this task solely because current 28 tests pass.

## Repair re-review, 2026-11-14

The original rejection above is historical. The inspected repair resolves both identified implementation defects. **Final code review: PASS, ready for report and authorized acceptance**, with the validation limits below.

Executed independently after repair:

- `npm test -- --run src/vector/pathGeometry.test.ts src/vector/VectorEditor.test.tsx src/vector/vectorDocument.test.tsx src/vector/vectorPixels.test.tsx src/document/projectFormat.test.ts src/canvas/CanvasScene.test.tsx`: exit 0, **6 files / 31 tests passed**.
- `npm run build`: exit 0; existing bundle-size warning (~751KB).
- `vibeplan check`: exit 0 and local checks passed, but the status section says session verification `fetch failed`. This is **not evidence of current server authentication/availability**; reconcile connectivity before remote acceptance mutations.

Final criterion results:

1. **PASS** — `pathGeometry.ts` emits handles and closure, smooth/corner transitions; VectorEditor has pointer-driven anchor/handle editing plus numeric editing, explicit confirmation and cancellation. Existing geometry/UI tests pass. Pointer dragging itself remains code-reviewed rather than simulated by the UI tests.
2. **PASS** — actual shared CanvasScene SVG is rasterized independently by resvg for all four operations; exact overlap/separate-region alpha, hole and self-intersection fixtures pass. Production uses SVG path/mask fill semantics, not an untested custom polygon kernel.
3. **PASS** — reopening now restores width/fill/dash/scaleStroke/cap/join; save spreads original shape so original colors and hidden state survive. `VectorEditor.test.tsx` verifies saved style after geometry editing. `vectorPixels.test.tsx` measures scaling stroke width 4px→8px under 2× transform; the non-scaling option emits the correct SVG `vector-effect="non-scaling-stroke"`. Limitation: resvg does not implement non-scaling-stroke, so that branch has an attribute/semantic assertion, not an independent raster equality assertion. Browser export uses the same SVG scene; no claim is made that resvg verified the unsupported branch.
4. **PASS** — combine-shapes persists sourceIds; update-shape refreshes left/right snapshots from linked sources, so retained hidden path editing changes the visible combination. Copy remaps sourceIds using the newly generated object IDs. The new project roundtrip test restores a linked combination, edits its source, duplicates the layer, edits only the copy, verifies the original remains unchanged, and undoes the copy edit. This resolves the earlier broken edit-after-reopen workflow.

No source code changed by this reviewer. Evidence is limited to inspected implementation and the commands above; no desktop/browser visual interaction or paid service call was performed.

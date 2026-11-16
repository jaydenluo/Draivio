# F19 final independent review v3

Read-only independent implementation review; only this evidence document was written. Task 35cf98fb-639a-49fd-873b-e5e26f0a1f7b, context version 12 / human / in_review. No acceptance mutation, commit, deployment or paid service call.

## Independently executed checks

- `npm test -- --run src/retouch/cloneHeal.test.ts src/canvas/rasterTools.test.ts src/canvas/layerCoordinates.test.ts src/state/layerWorkspace.test.ts src/document/projectFormat.test.ts src/components/ToolOptionsBar.test.tsx src/canvas/CanvasViewport.test.tsx src/canvas/retouchScope.test.ts`: exit 0, 8 files / 67 tests passed.
- `npm run build`: exit 0; existing >500 kB chunk warning.
- `vibeplan check`: exit 0.
- Additional independent Resvg composition probe: exit 0. A full selected-layer image repeated as a normal top repair layer changes an untouched half-transparent red pixel from premultiplied RGBA [128,0,0,128] to [192,0,0,192]. An untouched blue pixel in an upper layer changes [0,0,255,255] to [255,0,0,255] when the selected lower red layer is sampled and its complete image is inserted at top. This probe models the actual composition sequence identified below; it is not claimed as a new full UI regression test.

## Findings preventing acceptance

1. **High: repair layer contains the complete sampled image, changing unrelated pixels.** `clonePixels` initializes output with all original image data (`src/canvas/rasterTools.ts`); `healPixels` and `patchPixels` do the same (`src/retouch/cloneHeal.ts`). CanvasViewport encodes these complete images into add-repair-layer actions. The reducer inserts a full-document, opacity100, normal-blend layer at `[layer, ...state.layers]` (`src/state/editor.tsx:337`). Therefore even a tiny repair duplicates all unchanged semi-transparent sampled content and can cover other upper layers excluded from current sampling. Keeping the original layer object unchanged does not establish non-destructive final appearance. Existing opaque single-layer UI fixture cannot detect this. Repair output needs localized coverage/delta and appropriate layer placement/compositing, with final-render tests asserting untouched pixels remain unchanged for semitransparent and multi-layer documents.
2. **Medium: advertised aligned/non-aligned mode is inaccessible.** `cloneAligned` is read by CanvasViewport, but no control writes it anywhere in ToolOptionsBar; only the status text advertises support. The default is always true from normal UI. Add an accessible control and interaction evidence. Additionally, the algorithm recomputes source offset from each stroke's first dab, so the standard persistent aligned offset across separate strokes is not implemented; define and test intended semantics.
3. **Medium: patch sampling selector is absent.** Patch consumes persisted sampleScope in CanvasViewport, but ToolOptionsBar only exposes the selector for clone-stamp/healing. Patch displays “只影响当前图层” even though a previously chosen scope can still apply. Expose the real range for patch and test a user changing it.

## Criterion decisions

1. `497a539b-7f34-4d27-b0a6-7e7108259d6f`: pixel algorithm fixture evidence passes within existing local algorithm scope. Fixed texture, spot and edge tests support source-offset/blending behavior. Overall feature scope still has the inaccessible clone mode noted above.
2. `5f38b093-246f-4b4b-91af-6d607b253f98`: **fail**. New nested SVG test genuinely verifies ancestor transform retention, current/below/visible filtering and hidden/locked-ancestor exclusion. Reducer guards protected target ancestry. However the full sampled image inserted at top changes unrelated original composition, and patch scope is not user-selectable. Source object preservation alone is insufficient.
3. `312db790-2849-44d3-9fb5-0246de8f8000`: **pass for demonstrated cancellation/transaction path**. New healing UI test aborts an in-flight rasterization through Escape, checks signal.aborted and exact unchanged layers/undo/history, and no dialog. Clone UI confirmation adds exactly one undo entry. Shared perform logic rejects canceled/stale results; pending cancellation does not dispatch. Synchronous local processing is not claimed interruptible in mid CPU loop; no real remote cancellation call was performed.
4. `02d3be34-0c27-402e-8cd1-b45bef9b998e`: **pass for tested coordinate and error-contract scope**. Actual pointer Alt source and destination, rendered SVG via Resvg, real clonePixels and confirmation cover 120x80 document, 200% zoom, 90-degree view rotation and transformed layer rectangle. Platform decode/encode seams are mocked explicitly, not clone algorithm or scene. Remote error branch supplies concrete failure text and no successful action; latest remote branch also consumes sampleScope. No paid/live-service success is claimed.

## Conclusion

Do not accept F19 yet. Previous v2 evidence gaps for nested SVG, actual UI cancellation and rotated pointer-to-pixel coordinates are addressed. The remaining composition defect is a real correctness blocker despite all 67 tests passing; missing clone-mode and patch-scope controls also remain in the authorized scope. Return these concrete findings for same-task repair and then perform a fresh review.

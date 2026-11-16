# F19 final independent review v8

Read-only review of the final frontier/surface repair.

## Checks

- `npm test -- --run src/retouch/cloneHeal.test.ts src/canvas/rasterTools.test.ts src/canvas/layerCoordinates.test.ts src/state/layerWorkspace.test.ts src/document/projectFormat.test.ts src/components/ToolOptionsBar.test.tsx src/canvas/CanvasViewport.test.tsx src/canvas/retouchScope.test.ts src/canvas/retouchComposite.test.tsx src/canvas/retouchFrontier.test.tsx src/state/layerHierarchy.test.ts src/canvas/CanvasScene.test.tsx`: **12 files / 81 tests passed, exit 0**.
- `npm run build`: **exit 0**; production build includes `refineWorker-p1zqbGNb.js`.
- `vibeplan check`: **exit 0**.

## Criterion review

1. **Passed.** RGBA texture, edge and alpha fixtures exercise clone/heal/patch behavior, source offsets, opacity/hardness/alignment, and local fallback semantics.
2. **Passed after frontier repair.** Nested and cross-group Resvg fixtures verify current/below/visible scope, hidden/locked layers, ancestor opacity exactly once, unsampled foreground preservation, root visible replacement, and same-group below placement. The frontier fixture now preserves the unsampled blue foreground (`[0,64,128,255]`); composite fixtures verify half-alpha green replacement, opaque green replacement, and no change outside coverage.
3. **Passed.** UI cancellation tests abort the in-flight operation and leave layers/history/undo unchanged; base undo and ancestor-lock guards prevent stale or protected writes. Repair remains an independent layer and can be hidden/undone.
4. **Passed.** Real transformed-layer, 120×80/10×6/12×8, zoom 200%, rotation 90° and document-coordinate fixtures verify patch placement. Offline service failures return a concrete localizable error and do not write a layer. Project save/reopen and duplicate source-id remapping are covered.

Remaining limitation: cloud healing is optional and was not invoked; local processing is the verified fallback. Existing bundle-size warning remains.

All four criteria pass in this independent review; the prior v7 below-frontier counterexample is covered by `retouchFrontier.test.tsx`.

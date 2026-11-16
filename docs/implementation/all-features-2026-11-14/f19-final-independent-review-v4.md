# F19 final independent review v4

Read-only implementation review; wrote only this evidence document. No acceptance mutation or implementation edit.

## Executed evidence

`npm test -- --run src/retouch/cloneHeal.test.ts src/canvas/rasterTools.test.ts src/canvas/layerCoordinates.test.ts src/state/layerWorkspace.test.ts src/document/projectFormat.test.ts src/components/ToolOptionsBar.test.tsx src/canvas/CanvasViewport.test.tsx src/canvas/retouchScope.test.ts src/canvas/retouchComposite.test.tsx src/state/layerHierarchy.test.ts src/canvas/CanvasScene.test.tsx`: exit 0, 11 files / 79 tests passed (latest cross-stroke alignment changes included).

`vibeplan check`: exit 0.

`npm run build`: exit 1 at this shared-workspace snapshot. TextObject.tsx:60 TS2353 (`rotation` absent from CanvasTextObject), :84 TS2339 (same field). This appears outside F19 and was reported to coordinator; no passing build claim is made for this snapshot.

## Resolved v3 findings

- repairDeltaPixels removes unchanged pixels, repairCoveragePath supplies binary replacement coverage, and CanvasScene knocks out referenced sampled source content before compositing the repair. Existing actual CanvasScene→Resvg test proves a repaired alpha128 source can become green alpha128 rather than alpha192, while untouched pixels and an upper root layer remain unchanged.
- Hiding repair, undo, project encode/decode, external copy-reference cleanup and ancestor-lock rejection are genuinely covered by the new rendering/state tests.
- cloneAligned checkbox and patch/smudge sampleScope select are now reachable. Latest implementation maintains alignmentOrigin across strokes; the source offset test passes. The remaining patch status text still says current-layer only, but the selector itself works.

## Blocking independent counterexample

**High: root repair layer is underneath the entire selected parent group, so a lower sibling covers the repair.** add-repair-layer inserts its new layer before the base in the flat array, but does not assign the base's parent. CanvasScene renders by hierarchy. Therefore inserting before a nested base in the flat list does not put the root repair above that base in rendered order.

Independent probe used Vite createServer + ssrLoadModule to load the real CanvasScene and editorReducer, renderToStaticMarkup, then Resvg. No mocked scene or reducer and no source edits. Fixture: 120x80 transparent document; root group with children [base,lower], base opaque red, lower opaque blue; both fill the canvas. Submit a green 10x10 repair image covering document x30..39,y20..29 with repairSourceIds=['base'] and matching coverage. Sample x32,y22:

- before: [255,0,0,255]
- expected repair: [0,128,0,255]
- actual after: [0,0,255,255]

Probe exit 0; resulting flat list is group(root), repair(root), base(group), lower(group). Rendering root reverse order paints repair first, then group; the knockout in base exposes lower blue, which paints over the repair. Existing fixture has only one child, so it misses this case.

Repair must preserve actual relative hierarchy/stacking and document-coordinate semantics, with a real final-render regression containing a lower sibling in a nested transformed group. Merely assigning groupId without compensating document coordinates/ancestor opacity is insufficient.

## Four criterion decisions

1. `497a539b-7f34-4d27-b0a6-7e7108259d6f`: pass within fixed local texture/spot/edge/source-offset fixture scope; aligned/non-aligned is now exposed and tested.
2. `5f38b093-246f-4b4b-91af-6d607b253f98`: **fail**. Sampling filtering, alpha replacement, source-object retention, lock guards and serialization are supported, but actual hierarchy placement makes a normal nested-layer repair visibly wrong as reproduced above.
3. `312db790-2849-44d3-9fb5-0246de8f8000`: pass within demonstrated shared transaction/cancellation path; real UI Escape abort leaves layers/undo/history unchanged and confirmation is one undo entry. Visibility/undo restoring original composite also passes.
4. `02d3be34-0c27-402e-8cd1-b45bef9b998e`: pass within tested 120x80 / zoom200 / view90 / transformed rectangle pointer-to-pixel path and explicit remote failure contract. No live paid call is claimed.

F19 is not ready for acceptance. Fix the nested stacking counterexample, rerun actual rendering evidence and final integration build, then request fresh independent review.

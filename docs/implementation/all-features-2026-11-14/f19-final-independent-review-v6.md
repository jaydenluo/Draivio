# F19 final independent review v6

Read-only implementation review; only this review document written. No acceptance mutation.

## Fresh verification

`npm test -- --run src/retouch/cloneHeal.test.ts src/canvas/rasterTools.test.ts src/canvas/layerCoordinates.test.ts src/state/layerWorkspace.test.ts src/document/projectFormat.test.ts src/components/ToolOptionsBar.test.tsx src/canvas/CanvasViewport.test.tsx src/canvas/retouchScope.test.ts src/canvas/retouchComposite.test.tsx src/state/layerHierarchy.test.ts src/canvas/CanvasScene.test.tsx`: latest rerun exit0,11files79tests passed.

`npm run build`: latest rerun exit0, existing bundle-size warning. An earlier transient failure from missing PropertiesPanel during concurrent work was resolved before this rerun.

`vibeplan check`: exit0.

## Resolved findings

Current/same-parent sampling now removes target-ancestor paint opacity/filter/blend while retaining geometry, and source knockout uses repair's own opacity. Actual Scene→scope→Resvg regression proves group50 local source red alpha255 and final repaired green alpha128 without old residual red. v5 current-scope opacity blocker is resolved. v4 nested lower-sibling placement is resolved. Legacy children-only ancestor locking was independently reproduced during this review, then fixed using layerParentId+visited; final checked regression rejects repair with no new layer/undo. Do not reuse these resolved findings as current rejection reasons.

## Remaining confirmed blocker: visible sampling across parent boundaries

Actual independent Node probe used Vite ssrLoadModule for real editorReducer and CanvasScene, renderToStaticMarkup and Resvg; no mocked reducer/scene. Exit0.

Fixture: transparent120x80 document. Root upper opaque blue fills canvas. Root group opacity50 contains base red. This is a normal visible sampling set ['upper','group','base']. Supply a10x10 opaque green repair output in document coordinates and matching binary coverage, with those repairSourceIds. The reducer places repair beside base inside group50 and knocks out upper blue at the repaired pixel.

Premultiplied pixel x32,y22:

- original: [0,0,255,255]
- expected repaired opaque result: [0,128,0,255]
- actual final render: [0,64,0,128]

This is a real cross-parent composition failure, not the resolved current-scope case. The root upper source is already opaque and is unaffected by stripping only the target's ancestor opacity in retouchScopeSvg. Inserting its sampled result into the target's half-opacity group nevertheless scales the result. Knockout removes upper root content, so final alpha is halved. Same-parent normalization cannot establish correct visible/below behavior across other ancestry chains. Coordinate insertion and replacement must respect the sampled composite's actual paint space/stacking; add a genuine cross-parent visible fixture before approval.

## Four acceptance criteria

1. `497a539b-7f34-4d27-b0a6-7e7108259d6f`: pass within fixed texture/spot/edge/source-offset fixture scope; clone mode UI and cross-stroke alignment evidence present.
2. `5f38b093-246f-4b4b-91af-6d607b253f98`: **fail** solely for the confirmed cross-parent visible composite above. Current/same-parent alpha replacement, nested order, hidden rules, source preservation, ancestor locks, hiding/undo/reopen/copy evidence are supported.
3. `312db790-2849-44d3-9fb5-0246de8f8000`: pass within demonstrated shared cancellation/transaction path; actual UI Escape abort leaves document/undo/history unchanged and confirmation adds one undo.
4. `02d3be34-0c27-402e-8cd1-b45bef9b998e`: pass within actual pointer120x80/zoom200/view90/transformed-layer pixel fixture and explicit remote failure contract. No live paid call claimed.

F19 remains not ready for acceptance despite green tests/build/check. Cross-parent visible sampling needs repair and fresh independent review.

# F19 final independent review v5

Read-only implementation review. Only this evidence file written; no acceptance mutation.

## Fresh checks

- `npm test -- --run src/retouch/cloneHeal.test.ts src/canvas/rasterTools.test.ts src/canvas/layerCoordinates.test.ts src/state/layerWorkspace.test.ts src/document/projectFormat.test.ts src/components/ToolOptionsBar.test.tsx src/canvas/CanvasViewport.test.tsx src/canvas/retouchScope.test.ts src/canvas/retouchComposite.test.tsx src/state/layerHierarchy.test.ts src/canvas/CanvasScene.test.tsx`: exit 0, 11 files / 79 tests passed.
- `npm run build`: exit 0, existing bundle-size warning. Previous unrelated TextObject type error is no longer present.
- `vibeplan check`: exit 0.

## Resolved

v4 nested lower-sibling counterexample is addressed: repair adopts actual parent, is inserted above the selected base, and documentSpace rendering cancels ancestor transform. New actual CanvasScene→Resvg fixture covers opaque green replacing base red above lower blue, semi-transparent green over lower blue, no-lower alpha128, upper root preservation, hidden/undo/reopen/copy/lock. Patch sampling and clone alignment controls remain present. Out-of-scope repair knockout paths are removed from sampled SVG.

## Remaining blocker: ancestor opacity is applied twice and weakens knockout

Independent Node probe loaded actual CanvasScene and editorReducer through Vite ssrLoadModule and rendered with renderToStaticMarkup→Resvg. Exit 0. Fixture: transparent120x80, root group opacity50 containing opaque red base, no lower sibling. A10x10 green repair with alpha0.5 represents the output pixels already containing the sampled ancestor opacity. Repair metadata covers exactly that area and references base. Sample x32,y22, premultiplied RGBA:

- before red: [128,0,0,128]
- expected repaired green: [0,64,0,128]
- actual: [32,32,0,96]

CanvasViewport samples scene pixels with ancestor opacity already applied; the repair then enters the same parent and inherits opacity again. Additionally SceneLayer knockout strength uses effectiveLayerState(repair).opacity including that parent opacity, leaving residual red inside the repaired region. Existing parent opacity100 fixture cannot detect this. Implementation worker independently identified the same boundary and has been notified of concrete observed pixels.

Use coherent sampling/output and local replacement-opacity semantics, then test an actual sampled result under ancestor opacity50 (plus nested opacity if supported). Avoid treating a green source with already-baked ancestor alpha as if it were uncomposited child content.

## Four criteria

1. `497a539b-7f34-4d27-b0a6-7e7108259d6f`: pass within fixed local texture/spot/edge/source-offset evidence. Aligned/non-aligned controls and cross-stroke offset tests present.
2. `5f38b093-246f-4b4b-91af-6d607b253f98`: **fail**. Visibility/filtering/locks/source retention and normal-opacity placement are supported, but ancestor-opacity sampling/replacement corrupts final alpha and color as reproduced above.
3. `312db790-2849-44d3-9fb5-0246de8f8000`: pass within demonstrated shared cancellation/transaction path; Escape abort leaves document/undo/history unchanged, confirmation is one undo, hiding/undo restores original render.
4. `02d3be34-0c27-402e-8cd1-b45bef9b998e`: pass within tested120x80/zoom200/view90/transformed-pointer pixel path and explicit remote-failure contract. No paid/live service success claimed.

F19 remains not ready for acceptance despite green checks. Repair ancestor-opacity semantics and obtain fresh independent evidence before approval.

# F19 final independent review v7

Read-only implementation review. Only this evidence file written, no acceptance mutation.

## Checks independently executed

- `npm test -- --run src/retouch/cloneHeal.test.ts src/canvas/rasterTools.test.ts src/canvas/layerCoordinates.test.ts src/state/layerWorkspace.test.ts src/document/projectFormat.test.ts src/components/ToolOptionsBar.test.tsx src/canvas/CanvasViewport.test.tsx src/canvas/retouchScope.test.ts src/canvas/retouchComposite.test.tsx src/state/layerHierarchy.test.ts src/canvas/CanvasScene.test.tsx`: exit0,11files80tests passed.
- `npm run build`: exit0, existing bundle-size warning.
- `vibeplan check`: exit0.

## Resolved prior blocker

Visible sampling now uses complete root composite and passes rootPlacement to the repair reducer; the actual cross-group alpha fixture produces opaque green as expected. Current sampling retains local parent normalization. Legacy locking, same-parent alpha, nested lower-sibling ordering, source retention, save/reopen and cancellation fixes remain supported. The v6 visible-alpha counterexample is resolved, not reused as a rejection reason.

## Confirmed remaining blocker: below repair covers an unsampled upper sibling

Independent Node probe loaded the real editorReducer/CanvasScene through Vite ssrLoadModule and used renderToStaticMarkup→Resvg. Exit0. Fixture: transparent120x80 document; a root group contains opaque blue upper followed by opaque red base. Selected base, below scope therefore samples only base, excluding the upper sibling. Supply an opaque green10x10 result with rootPlacement=true, repairSourceIds=['base'] and matching coverage.

At document pixel x32,y22:

- before: blue [0,0,255,255]
- expected final: blue [0,0,255,255], because the unsampled upper sibling still covers the repaired base
- actual final: green [0,128,0,255]

The reducer moves the below repair above the entire root group. This keeps root alpha correct but changes the relative stacking of content above the sampling boundary. A flat insertion at rootBase cannot preserve upper siblings inside that root group. Sampling and replacement must preserve the unsampled upper content's order; add a real below-scope nested upper-sibling render regression.

## Criterion decisions

1. `497a539b-7f34-4d27-b0a6-7e7108259d6f`: pass within fixed local texture/spot/edge and source-offset fixtures, including clone mode controls/alignment.
2. `5f38b093-246f-4b4b-91af-6d607b253f98`: **fail**, due solely to confirmed below nested-upper-sibling coverage above. The prior resolved alpha/lock cases are supported.
3. `312db790-2849-44d3-9fb5-0246de8f8000`: pass within actual UI cancellation/shared transaction evidence; no canceled layer/history/undo pollution and one confirmed undo.
4. `02d3be34-0c27-402e-8cd1-b45bef9b998e`: pass within actual120x80/zoom200/view90/transformed-pointer pixel and explicit remote failure evidence. No paid/live success claimed.

F19 is not ready for acceptance despite green tests/build/check. Preserve below scope's real stacking boundary and obtain fresh independent review.

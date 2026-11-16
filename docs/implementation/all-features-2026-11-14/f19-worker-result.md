# F19 worker result

## Changed files

- `src/retouch/cloneHeal.ts`: pure RGBA local healing (annulus texture blend), feathered rectangle patch, sample-scope resolution.
- `src/retouch/cloneHeal.test.ts`: fixed texture/spot/patch/sample scope tests.
- `src/canvas/CanvasViewport.tsx`: healing uses configured cloud adapter when present and otherwise performs local raster healing through the same undo/async document guard; result is one `rasterize-layer` action.
- `src/components/ToolOptionsBar.tsx`: healing/clone options expose size, hardness, opacity, sample scope and concrete local/service status.

## Verification

- `npm test -- --run src/retouch/cloneHeal.test.ts` — passed, 3 tests.
- `npm run build` — passed; Vite emitted the existing large bundle warning.
- `vibeplan check` — passed.

## Acceptance evidence

- Local RGBA healing blends surrounding pixels through a circular annulus and opacity/hardness edge weighting; it does not paint a flat color.
- Patch operation copies a shifted source rectangle with feathered boundaries and preserves pixels outside the target.
- Sample scope resolver excludes hidden/locked layers for below/visible modes.
- Canvas processing uses the existing `perform` transaction guard, so async document changes discard stale results and one completed stroke dispatches one undoable raster action.

## Remaining issues

- The current UI has no dedicated patch tool/confirm dialog and the local healing path still rasterizes the selected-layer scene; creating a separate repair layer and compositing multiple sample layers requires a follow-up state action.
- Cloud service calls were not exercised; no paid/network inference was made. The local fallback is explicit in the options status.

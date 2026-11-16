# 双重曝光 Implementation Plan

Goal: explicit subject/second-image inputs produce an editable, source-preserving double exposure with real CanvasScene preview and one-step undo.
Architecture: pure doubleExposure.ts creates an isolated group with copied image layers; second clips to the subject alpha/mask. Source layers remain in document, hidden on adoption. DoubleExposureWorkspace owns private candidates, input-file epochs and document fingerprint guarding. Existing layer masks, curves, blend mode, opacity and transform fields persist without a new schema/type. DoubleExposureWorkspace is mounted in the production AIComposer.
Base: c30a9ba8e06832f75e321146f95c3a6b6bcd939f.

Design alternatives: direct destructive compositing loses editing; requiring semantic segmentation adds an unnecessary blocker. Chosen explicit existing mask/current selection/subject alpha + clipping reuses accepted manual tools. A16 semantic localization is not required by any criterion and is removed from dependsOn; A23 recipe engine and F06 clipping remain. No implicit inference/paid generation. Imported image or downloaded result is an explicit second input; generation remains the existing separate user-triggered flow.

Scope/constraints: new ai/recipes/doubleExposure.ts, DoubleExposureWorkspace.tsx and focused tests/evidence. Do not edit RecipeWorkspace/runner/Product/shared Layer type. Parent explicitly authorized a small AIComposer import/mount after parallel writers finished. Targets must be independent root image layers on active board; locked/nested/text/vector/group/high-precision targets reject with feedback. Existing masks/effects remain preserved. UI states which contour source is used; no automatic subject extraction claim.

- [x] RED: source preservation, alpha/selection masks, blend ratio, editable curves and independent second placement; invalid/missing/locked inputs; real pixels and no mutation.
- [x] GREEN pure candidate group construction using existing fields and clipping contract.
- [x] RED/GREEN workspace before/after preview, tuning invalidation, cancellation, adopt/undo, stale document/blocking and explicit second input; no fetch.
- [x] PNG/SVG before/after evidence from fixed source images; project encode/decode/restore and independent subsequent editing.
- [x] Focused tests, tsc, build, vibeplan check, scoped actual report to review. No commit/push/accept.

Acceptance mapping: 8a4e6e19: two image copies retain original source and independently editable parameters, source originals retained, undo + roundtrip. a6c9152d: contour mask/feather/inversion, blend mode/opacity, curves and second x/y/scale editable and change actual pixels. 340630af: missing second image blocks preview with explicit input message, local import/downloaded candidate only, fetch spy zero calls.
Risks: subject alpha without mask includes full opaque frame; UI explicitly requests manual contour for opaque subject images. Unsupported high-precision/nested sources remain unchanged.

Delivery checkpoint (2026-11-16): core+UI+production Composer+clipping checks: 4 files / 47 tests passed, exit 0. Fresh tsc, production build and vibeplan check exit 0. Fixed rectangle red/blue screen sample writes before/after SVG and 512px PNG under docs/evidence/double-exposure; black/white replacement and elliptical contour verified in focused tests. Report leaves human task in review; root arranges independent reviewer. No model/network generation request, cost 0 for this deterministic local composition. No commit/push. Existing build chunk/dynamic-import warnings are nonfatal.

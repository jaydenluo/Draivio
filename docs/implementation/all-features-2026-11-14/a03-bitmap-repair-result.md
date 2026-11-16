# A03 bitmap/revision repair evidence

Read independent review, task context and plan. Plan uploaded v12; reviewer legally rejected missing bitmap/revision scope, leaving task in_progress v13. No report or acceptance submitted by this worker.

Implemented:
- `editorPreview.tsx` renders the captured EditorState using shared CanvasScene into an SVG, isolates a target layer subtree while preserving ancestor transforms, clips to scope pixel bounds and applies selection mask. Browser Image + canvas rasterizes a real downsampled PNG (long edge <=1024); object URL is revoked on success/failure.
- The frozen context now contains preview.dataUrl, real width/height/scale and unique requestId. Metadata-only capture remains the synchronous geometry/validation helper; real entry always awaits rendered context before request.
- Real ImageGeneration entry freezes target/selection/prompt, renders bitmap and checks content revision before sending. Content changes during preparation reject without network request. Selection/view changes do not alter target or invalidate content identity.
- Delayed image results check basis in provider and atomically in reducer. A batch's own pristine receipts are excluded to allow progressive results; user edits/duplicates of those receipts remain conflicts. Conflict is failed/retryable and writes no layer. Retry captures a fresh bitmap/revision with the original target and selection, then resubmits only failed batch items.
- Per-document provider dispatch stays bound to original document; background generation test confirms a switched active document does not receive the result.

Files: src/ai/context/editorContext.ts; new src/ai/context/editorPreview.tsx/editorPreview.test.ts; src/creation/ImageGeneration.tsx/ImageGeneration.test.tsx; src/state/editor.tsx; async-boundary test updates in src/document/DocumentTabs.test.tsx, src/creation/Inspector.test.tsx, OutputFormat.test.tsx, ServiceSourceSettings.test.tsx.

Evidence:
- Actual preview test rasterizes fixed 2000x1000 red/transparent scene with independent resvg into PNG, checks PNG signature, IHDR 1024x512 and expected RGBA red/transparent samples. Integration tests inject a known PNG rasterizer fixture at the browser decode boundary; they do not claim jsdom implements Image/canvas decoding.
- New delayed-response test modifies original layer opacity while request is pending, asserts no output layer and retry action, retries, receives output bound to original target with actual PNG dataUrl.
- New preparation-delay test changes content while bitmap is pending; fetch is never called and stale-preview feedback appears.
- Existing delayed selection/target, inherited lock, ancestor-transform, multi-document, retry-only-failed tests pass.

Validation:
1. npm test -- --run src/creation/ImageGeneration.test.tsx src/document/DocumentTabs.test.tsx src/ai/context/editorPreview.test.ts src/ai/context/editorContext.test.ts src/creation/Inspector.test.tsx src/creation/OutputFormat.test.tsx src/creation/ServiceSourceSettings.test.tsx — 7 files / 46 tests passed, exit 0.
2. After strengthening pristine-receipt filtering, npm test -- --run src/ai/context/editorPreview.test.ts src/creation/ImageGeneration.test.tsx — 2 files / 8 tests passed, exit 0.
3. npm run build — passed exit 0, existing bundle-size warning.
4. vibeplan check — passed exit 0.

Limits: no real paid API call or native GUI verification. Current actual provider remains text-to-image; bitmap exists in frozen request context but is not uploaded to a text-only endpoint. F23 owns image-edit endpoint transport. No F10/F19 implementation modified.

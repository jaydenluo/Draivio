# A03 bitmap/revision independent review

Review is read-only; no source implementation changes were made.

Executed independently:

- `npm test -- --run src/creation/ImageGeneration.test.tsx src/document/DocumentTabs.test.tsx src/ai/context/editorPreview.test.ts src/ai/context/editorContext.test.ts src/creation/Inspector.test.tsx src/creation/OutputFormat.test.tsx src/creation/ServiceSourceSettings.test.tsx`: **7 files / 46 tests passed, exit 0**.
- Build and vibeplan checks were previously reported by the repair worker; this review did not treat those as evidence of the missing behavior.

Criterion observations:

1. **Bitmap preview: PASS.** `captureRenderedEditorContext` renders the shared CanvasScene, isolates layer ancestry, clips pixel bounds and rasterizes a real PNG. Independent `editorPreview.test.ts` uses resvg on a 2000×1000 fixed scene and verifies PNG signature, 1024×512 IHDR and red/transparent RGBA samples. Browser fallback revokes object URLs.
2. **Request preparation and scope binding: PASS.** `ImageGeneration.tsx` freezes documentId, target, selection and rendered PNG before network transport; selection/view changes preserve the original target context. Multi-document and retry tests cover original document ownership and fresh bitmap capture.
3. **Revision and atomic result guard: FAIL.** `contextCanCommit` is called before transport, in the provider callback, and in `append-ai-result`/`complete-ai-operation`. However, `contentRevision`'s `ownRequestId` filter excludes pristine generated receipts and does not detect all user edits to such a receipt. Independent reducer reproduction in this review: append a receipt, change its blend mode to `正片叠底`, then `contextCanCommit(state, ctx)` returned `true`; a late second `append-ai-result` was accepted. The filter must mark any post-receipt edit (including blendMode/adjustments/content dimensions and other mutable layer fields) as a conflict, or use an explicit immutable request revision token.
4. **Retry/multi-document ownership: PASS conditionally.** Retry calls `captureRenderedEditorContext` with the original target and documentId, and `DocumentTabs` tests cover switched-document ownership. Final acceptance remains blocked by criterion 3's stale-result guard.

Required repair: strengthen the pristine-receipt detection or revision token so every user modification to a generated receipt conflicts, add regression coverage for blend/adjustment/transform/duplicate edits, rerun the seven-file suite, and repeat the reducer reproduction.

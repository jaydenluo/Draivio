# 用户说明、能力声明与分阶段发布验收

Git base: c30a9ba8e06832f75e321146f95c3a6b6bcd939f (uncommitted shared workspace; no commit/push).

## Agreed scope and source
Task 9110cc9a-1498-4365-9768-23baddf97337, criteria unchanged. Root authorized implementation and dependency analysis, official-cloud balance correction, five representative automated component/export flows, docs and honest release gates. No real model credentials or human platform acceptance supplied.

## Dependency decision
Read A35 / 6bab7ff2-efdb-4bea-92c4-4736f6cc4f83 context: backlog, platform/manual/real-model/full-suite acceptance outstanding. Removed only hard implementation dependency: docs and gates can be implemented without that output. A35 remains a required full-release acceptance input, not passed or waived.

## Implementation
1. Inspect real production source/provider and recipe entrypoints, RAW/runtime/recovery limits.
2. Red/green tests proving unconfigured official cloud cannot generate or quote fabricated balance/cost; configured custom provider remains reachable, disabled/missing credentials unavailable.
3. Shared releaseGates module separates configured availability, automated evidence, human acceptance and first/full release. Wire actual model-source usability, generation UI and account/billing UI; no isolated marketing data.
4. Write docs/user-guide/ai-editing.md covering basic local sentence edit, masked edit, recipes, batch, offline recovery, uploads, fee confirmation, cancellation/retry, RAW limitations and no full Photoshop/detail-restoration promise. Correct outdated README.
5. Reuse and freshly run five actual production component/export flow suites (local sentence edit; masked edit request; poster apply/export; batch preview/run/retry; offline recovery). Mark automated coverage, not human user acceptance.
6. Focused tests, build, vibeplan check; record exact evidence. Root owns full-suite and independent review. If A35/model/manual acceptance prevents release, retain it as blocker and do not claim full-goal completion.

## Acceptance mapping
- f123af48-8af7-46d7-9987-ffbecd8ecfb4: guide five flows and fresh component/export checks, limitations reviewed against source.
- cdcc6a2d-bf07-411e-97cd-4c862af9290a: no fictional cloud balance/prices, no fake results/Photoshop compatibility/true restoration claims.
- 62f06857-9aed-4dec-84e0-2da402f4a838: separate first-version candidate and full-target pending status; missing human platform/model acceptance explicit; report not approval.

## Risks and remaining acceptance
No Windows/macOS/browser manual equivalence or live paid provider results can be inferred from mocked transport tests. No verified real cloud balance or order API exists. Current recipes have independent task reports, not automatically accepted releases. RAW runtime support must match actual adapter and fail clearly where absent. Preserve unrelated shared edits and no acceptance mutation.

## Checkpoint
Analysis complete; implementation next. Serial performance rerun deferred until root RAW freeze signal.

## Implementation checkpoint (2026-11-16)
Implemented docs/user-guide/ai-editing.md five actual flows; README obsolete demo/credential claims corrected. New runtime releaseGates consumed in TopBar/BillingDialog: official cloud unconfigured, no fabricated1280 balance or package prices; configured session-only custom providers remain distinct. first-version-candidate.md and full-target-pending.md preserve staged acceptance. Red missing gate test then2green; five flow suites6files22tests pass; account/window/AppShell regressions2files11tests pass. No AIComposer/editor/recipe changes or publication. A35 actual-user/platform/live-model acceptance remains missing: report blocked for complete release evidence, not implemented-docs failure. Independent review belongs to root.

## TopBar repair checkpoint (2026-11-16)
Root supplied real1422×800 browser evidence of crowded file actions hitting the artboard select. Added scoped topBar.css and moved secondary controls under 更多工具; file/export/account actions remain nonshrinking. Native Chrome screenshot3600×2134 (retina desktop) confirms single header row, fully visible overflow panel, document-size dialog opens/cancels, New creates a separate document, original500×625 document/content preserved on switch. Root owns independent1422×800 retest. Original panel right anchoring clipped at left in real screenshot; repaired to header-relative left16px and reverified. Layer-panel/Composer layout outside scope. Performance latest root result maxTask68.9ms exceeds50ms; retained as pending, no false all-gates pass.

Fresh focused TopBar/gates/window/AppShell run:3files14tests exit0. Build caught unsupported testing-library option exact in new role queries; removed the redundant option (string name matching is exact by default) and reran gate/build. vibeplan check exit0; no queued operations. Build final result recorded below after completion.


## Independent verification update 2026-11-16
Independent read-only review /tmp/release-docs-independent-review.json ran8files43tests successfully. Coordinator actual browser1422x800 verifies fixed TopBar single line, New correct new1024 document while original500 remains, complete More Tools size dialog and cancel preserves document; merge toolbar prose readable. README contradictory top undo wording corrected. Performance cycle2 is now independently accepted v25: reference AppleM5 decoded2048 single layer coldp9553.09/warm46.65/maxTask8.25ms; prior68.9 failed evidence retained and not current blocker. Poster cycle3 also accepted v26. docs/release/full-target-pending.md and crossplatform README reflect this. Real user five workflow, real Windows/AT/trackpad/fullmodel quality and final integration evidence remain unmet; document implementation success does not close release acceptance.

## Scope correction and resumed delivery (2026-11-16)
The prior blocked report conflated document acceptance with authorizing the entire product release. The unchanged criteria ask for accurate coverage of five flows, no false promises, and separately reviewable first/full stages without declaring unaccepted capabilities done. The description’s user-run example is retained as a pending verification activity, with a concrete five-flow user packet; no user result is invented. A35/platform/live-model evidence remains a full-release gate. This task only submits guide/gate/stage documentation for review, and does not approve first or full release.

Current baseline supplied by coordinator: 69 done / 5 blocked / 3 backlog, not a live counter and not a completion claim. Workflow and semantic tasks are accepted; performance cycle2 is accepted within its measured scope. Update stale local notes accordingly.

Steps: review source and current task contexts; revise guide, separate first/full review packets, add minimum user validation sheet; run production five-flow/gates tests and vibeplan check; explicitly resume and report new evidence in_review for independent review. Do not edit criteria, dependencies, source behavior or accepted task states. No commit/push/payment/deployment.

Acceptance mapping remains unchanged. Remaining product release issues are disclosed in full-target-pending and are not reported as passed tests. Review may reject documentation if its coverage disagrees with source; actual-user evidence remains unperformed rather than fabricated.

## Fresh verification and review handoff
Fresh production replay: npx vitest run src/ai/capabilities/releaseGates.test.tsx src/creation/AIComposer.preview.test.tsx src/ai/maskedEdit/provider.test.tsx src/ai/recipes/RecipeWorkspace.test.tsx src/ai/batch/RecipeBatchWorkspace.test.tsx src/ai/persistence/recoveryUI.test.tsx --maxWorkers=1 --testTimeout=30000 — exit 0, 6 files / 23 tests; /tmp/release-remaining-tests.log. vibeplan check exit 0, no pending events; /tmp/release-remaining-check.log. Local documentation link check: 5 documents / 17 links resolved, exit 0. Scoped git diff --check exit 0.

Changed only README.md, docs/user-guide/ai-editing.md, docs/release/first-version-candidate.md, docs/release/full-target-pending.md, new docs/release/user-five-flow-validation.md and this plan in this resumed pass. releaseGates source behavior unchanged; existing production gate tests rerun. No build claim for this documentation-only pass, no commit/push/deploy/payment. Five actual user rows remain explicitly unperformed; A35/full release remains separate and unaccepted. New success report asks for independent document review against unchanged criteria, not approval to release the product. Historical blocked report retained for audit and superseded for current documentation readiness only.

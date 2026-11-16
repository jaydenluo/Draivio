# Cross-platform / accessibility workflow evidence

2026-11-16, macOS host. This directory records production React UI integration with Vitest/jsdom and actual Resvg PNG output. It does not claim a real Windows run, real browser assistive-technology session, or real model response.

## Executed

`WORKFLOW_EVIDENCE_DIR=docs/evidence/crossplatform npx vitest run src/ai/e2e/workflows.test.tsx src/layers/LayersPanel.compact.test.tsx --maxWorkers=1` — 2 files / 4 tests passed, exit 0, 14.31 s. Full log `/tmp/workflow-green-v5.log`.

The production EditorProvider, LayersPanel, AIComposer, planner, executor, preview, reducer, CanvasScene, project encoder and workspace reopen are used without mocks. The only network spy rejects fetch and asserts no calls. A test harness exposes the actual production export serializer and project codec; its saved string represents a disk file, retained across document remounts.

- Select art layer; Ctrl+Enter parses two dependent edits; confirm creates a private candidate without document mutation.
- Tune horizontal movement from 10 to 20 pixels; actual Resvg output changes. Before toggle reproduces original pixel hash.
- Adopt adds exactly one undo entry; document export equals preview pixel hash. Undo restores original layers and focuses prompt; redo re-applies.
- Encode actual project, create a new document, reopen saved project with fetch disabled; exported pixels equal adopted pixels. Hashes in `workflow.json`.
- Locked edit fails without changing layers; corrupted project does not replace current document; unlock and retry produces an adoptable preview.
- Plain Enter/IME do not execute; docking/minimizing retains text. Layer search/filter and merge toolbar have accessible names.

`before.png`, `after.png`, `offline-reopened.png` are generated actual render outputs, not design mockups. The after image intentionally includes rotated/canvas-clipped corners because the tested command is a 15-degree rotation. AI visual inspection opened after.png; this is not human review.

`npm run build`, `cargo check --manifest-path src-tauri/Cargo.toml`, and `vibeplan check` all exited 0. Build has existing chunk/dynamic-import warnings; Rust has an unused helper warning. Logs `/tmp/crossplatform-build.log`, `/tmp/crossplatform-cargo.log`, `/tmp/crossplatform-check.log`.

## Compact merge toolbar

Production LayersPanel now names its merge group and scopes its grid independently. The explanation spans the full row, and four buttons auto-fit to sidebar width. The existing positional five-column rules no longer squeeze the explanatory prose into one narrow column. Structure test passes; coordinator independently checked the actual local browser at 1422×800 on 2026-11-16: merge prose wraps across the full sidebar row; TopBar file actions stay on one line, New creates a second document, More Tools opens a complete size dialog, and Cancel preserves the original document. This is browser UI observation, not screen-reader or Windows evidence.

## Still blocked / not executed

- Real Windows desktop/browser execution and macOS native Tauri manual workflow.
- Real keyboard-only browser traversal, screen-reader speech/navigation, and physical trackpad interaction. DOM labels/focus assertions cover only the specific checks above.
- Full recipe release matrix: portrait human review and final whole-suite freeze remain separate coordinator gates; poster cycle3 and performance cycle2 have since passed independent acceptance. This test does not substitute for all recipes.
- Actual model generation, masked edits, outpaint, and super-resolution service/provider checks, including cost and original requests/results. No paid or model call was made here.
- Final whole-repository test run after all agents freeze; per-task focused checks are not final integration acceptance.

Task remains blocked until the missing original scope evidence exists. No criterion is waived and no review approval is inferred from implementation.
